import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/apiError';
import { api } from '../api/client';
import { type LiveVoice, type LiveVoiceView, startLiveVoice } from './liveVoice';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'unavailable';

const SESSION_FINISHED_STATUS = 409;

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
  sendTyped(text: string): Promise<boolean>;
  toggleTalk(): Promise<void>;
  /** Leaves a room the tutor has gone from, and opens a new one with a new tutor. */
  openAgain(): Promise<void>;
}

// One room for one session screen, opened by the student's own press, because audio needs a user gesture.
export function useLiveVoice({ sessionId, usesSpeechCleanup = true, start = startLiveVoice }: UseLiveVoiceOptions): LiveVoiceControls {
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [voice, setVoice] = useState<LiveVoice | null>(null);
  const opening = useRef<Promise<LiveVoice | null> | null>(null);
  const isGone = useRef(false);
  const pressesWhileOpening = useRef(0);
  const [isTalkWaiting, setIsTalkWaiting] = useState(false);
  const view = useSyncExternalStore(voice?.subscribe ?? noSubscribe, voice?.getView ?? noView);

  const connect = useCallback(({ wantsGreeting, startsOver = false }: { wantsGreeting: boolean; startsOver?: boolean } = { wantsGreeting: true }) => {
    opening.current ??= (async () => {
      setStatus('connecting');
      let nextAskStartsOver = startsOver;
      const getAccess = async () => {
        const query = nextAskStartsOver ? { startOver: 'yes' as const } : {};
        nextAskStartsOver = false;
        try {
          return await api.post('/sessions/{id}/live-room', { params: { path: { id: sessionId }, query } });
        } catch (problem) {
          if (problem instanceof ApiError && problem.status === SESSION_FINISHED_STATUS) return null;
          throw problem;
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
        setStatus('unavailable');
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

  const isTalkOn = view ? view.mic === 'on' || view.mic === 'starting' : isTalkWaiting;

  return {
    status,
    view,
    voice,
    isTalkOn,
    connect,
    async sendTyped(text) {
      const opened = await connect({ wantsGreeting: false });
      opened?.sendTyped(text);
      return opened !== null;
    },
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
