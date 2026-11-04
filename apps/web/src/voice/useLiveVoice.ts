import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/apiError';
import { api } from '../api/client';
import { type LiveVoice, type LiveVoiceView, startLiveVoice } from './liveVoice';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'unavailable' | 'overLimit' | 'tooSoon' | 'finished';

const SESSION_FINISHED_STATUS = 409;
const TOO_MANY_STATUS = 429;

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
  /** With `tooSoon`, how long until the student can start another tutor. */
  waitSeconds: number | null;
  view: LiveVoiceView | null;
  voice: LiveVoice | null;
  /** Follows the student's press at once, so a room still opening cannot look like a press that missed. */
  isTalkOn: boolean;
  connect(options?: { wantsGreeting: boolean; startsOver?: boolean }): Promise<LiveVoice | null>;
  sendTyped(text: string): Promise<boolean>;
  toggleTalk(): Promise<void>;
  /** Leaves a room the tutor has gone from, opens a new one with a new tutor, and starts it talking with this line. */
  openAgain(opening: string): Promise<void>;
}

// One room for one session screen, joined as the screen opens so the student is never left waiting. The microphone stays off until they press Talk. With no access from the API it joins no room.
export function useLiveVoice({ sessionId, usesSpeechCleanup = true, start = startLiveVoice }: UseLiveVoiceOptions): LiveVoiceControls {
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);
  const [voice, setVoice] = useState<LiveVoice | null>(null);
  const opening = useRef<Promise<LiveVoice | null> | null>(null);
  // The tutor is known to have gone, and a plain join would find its room and keep that room alive for 2 more minutes, so every ask starts over until one is answered.
  const asksToStartOver = useRef(false);
  const isGone = useRef(false);
  const pressesWhileOpening = useRef(0);
  const [isTalkWaiting, setIsTalkWaiting] = useState(false);
  const view = useSyncExternalStore(voice?.subscribe ?? noSubscribe, voice?.getView ?? noView);

  const connect = useCallback(({ wantsGreeting, startsOver = false }: { wantsGreeting: boolean; startsOver?: boolean } = { wantsGreeting: true }) => {
    if (startsOver) asksToStartOver.current = true;
    opening.current ??= (async () => {
      setStatus('connecting');
      const getAccess = async () => {
        const query = asksToStartOver.current ? { startOver: 'yes' as const } : {};
        try {
          const { access, unavailableBecause } = await api.post('/sessions/{id}/live-room', { params: { path: { id: sessionId }, query } });
          asksToStartOver.current = false;
          if (!access) setStatus(unavailableBecause === 'dailyLimit' ? 'overLimit' : 'unavailable');
          return access;
        } catch (problem) {
          if (!(problem instanceof ApiError)) throw problem;
          if (problem.status === TOO_MANY_STATUS) {
            setWaitSeconds(problem.retryAfterSeconds);
            setStatus('tooSoon');
            return null;
          }
          if (problem.status !== SESSION_FINISHED_STATUS) throw problem;
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
        setStatus((current) => (current === 'finished' || current === 'overLimit' || current === 'tooSoon' ? current : 'unavailable'));
        return null;
      }
    })();
    return opening.current;
  }, [sessionId, start, usesSpeechCleanup]);

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
    waitSeconds,
    view,
    voice,
    isTalkOn,
    connect,
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
    async openAgain(openingLine) {
      const old = await opening.current;
      opening.current = null;
      setVoice(null);
      await old?.close();
      const opened = await connect({ wantsGreeting: false, startsOver: true });
      opened?.sendTyped(openingLine);
    },
  };
}
