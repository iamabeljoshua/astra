import type { components } from '@astra/contracts';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/apiError';
import { api } from '../api/client';
import { type LiveVoice, type LiveVoiceView, startLiveVoice } from './liveVoice';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'unavailable' | 'overLimit' | 'finished';

const SESSION_FINISHED_STATUS = 409;
/** A room with no student closes after 120 s and its token lasts as long, so an answer older than this is asked for again. */
const WARM_ANSWER_LASTS_MS = 100_000;

type RoomAnswer = components['schemas']['LiveRoomResponseDto'];

const noSubscribe = () => () => {};
const noView = () => null;

declare global {
  interface Window {
    astraVoice?: LiveVoice;
  }
}

export interface UseLiveVoiceOptions {
  sessionId: string;
  usesSpeechCleanup?: boolean;
  start?: typeof startLiveVoice;
}

export interface LiveVoiceControls {
  status: LiveVoiceStatus;
  view: LiveVoiceView | null;
  voice: LiveVoice | null;
  /** Follows the student's press at once, so a room still opening cannot look like a press that missed. */
  isTalkOn: boolean;
  connect(options?: { wantsGreeting: boolean; startsOver?: boolean }): Promise<LiveVoice | null>;
  /** Calls the tutor in before the student presses anything, so the first press does not wait for a job. */
  warm(): void;
  sendTyped(text: string): Promise<boolean>;
  toggleTalk(): Promise<void>;
  /** Leaves a room the tutor has gone from, and opens a new one with a new tutor. */
  openAgain(): Promise<void>;
}

// One room for one session screen, opened by the student's own press, because audio needs a user gesture. With no access from the API it joins no room.
export function useLiveVoice({ sessionId, usesSpeechCleanup = true, start = startLiveVoice }: UseLiveVoiceOptions): LiveVoiceControls {
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [voice, setVoice] = useState<LiveVoice | null>(null);
  const opening = useRef<Promise<LiveVoice | null> | null>(null);
  const warmed = useRef<{ answer: Promise<RoomAnswer>; askedAtMs: number } | null>(null);
  const isGone = useRef(false);
  const pressesWhileOpening = useRef(0);
  const [isTalkWaiting, setIsTalkWaiting] = useState(false);
  const view = useSyncExternalStore(voice?.subscribe ?? noSubscribe, voice?.getView ?? noView);

  const askForRoom = useCallback((query: { startOver?: 'yes' } = {}) => api.post('/sessions/{id}/live-room', { params: { path: { id: sessionId }, query } }), [sessionId]);

  const warm = useCallback(() => {
    if (warmed.current || opening.current) return;
    const answer = askForRoom();
    answer.catch(() => {});
    warmed.current = { answer, askedAtMs: Date.now() };
  }, [askForRoom]);

  const connect = useCallback(({ wantsGreeting, startsOver = false }: { wantsGreeting: boolean; startsOver?: boolean } = { wantsGreeting: true }) => {
    opening.current ??= (async () => {
      setStatus('connecting');
      let nextAskStartsOver = startsOver;
      const takeWarmAnswer = () => {
        const held = warmed.current;
        warmed.current = null;
        return held && Date.now() - held.askedAtMs < WARM_ANSWER_LASTS_MS ? held.answer.catch(() => askForRoom()) : askForRoom();
      };
      const getAccess = async () => {
        const asking = nextAskStartsOver ? askForRoom({ startOver: 'yes' }) : takeWarmAnswer();
        nextAskStartsOver = false;
        try {
          const { access, unavailableBecause } = await asking;
          if (!access) setStatus(unavailableBecause === 'dailyLimit' ? 'overLimit' : 'unavailable');
          return access;
        } catch (problem) {
          if (!(problem instanceof ApiError && problem.status === SESSION_FINISHED_STATUS)) throw problem;
          setStatus('finished');
          return null;
        }
      };
      try {
        const opened = await start({ usesSpeechCleanup, wantsGreeting, getAccess });
        if (isGone.current) {
          await opened.close();
          return null;
        }
        if (import.meta.env.DEV) window.astraVoice = opened;
        setVoice(opened);
        setStatus('live');
        return opened;
      } catch {
        opening.current = null;
        setStatus((current) => (current === 'finished' || current === 'overLimit' ? current : 'unavailable'));
        return null;
      }
    })();
    return opening.current;
  }, [askForRoom, start, usesSpeechCleanup]);

  useEffect(() => {
    isGone.current = false;
    return () => {
      isGone.current = true;
      void opening.current?.then((opened) => opened?.close());
    };
  }, []);

  const sendTyped = useCallback(
    async (text: string) => {
      const opened = await connect({ wantsGreeting: false });
      if (!opened || opened.getView().closedBecause) return false;
      opened.sendTyped(text);
      return true;
    },
    [connect],
  );

  const isTalkOn = view ? view.mic === 'on' || view.mic === 'starting' : isTalkWaiting;

  return {
    status,
    view,
    voice,
    isTalkOn,
    connect,
    warm,
    sendTyped,
    // Every press counts, because a second press while the room opens means off. Only the sum of them reaches the microphone.
    async toggleTalk() {
      if (voice) return voice.toggleMic();
      pressesWhileOpening.current += 1;
      setIsTalkWaiting(pressesWhileOpening.current % 2 === 1);
      const opened = await connect();
      const presses = pressesWhileOpening.current;
      pressesWhileOpening.current = 0;
      setIsTalkWaiting(false);
      if (opened && presses % 2 === 1) await opened.toggleMic();
    },
    async openAgain() {
      const old = await opening.current;
      opening.current = null;
      setVoice(null);
      await old?.close();
      await connect({ wantsGreeting: false, startsOver: true });
    },
  };
}
