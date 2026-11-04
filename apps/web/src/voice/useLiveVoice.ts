import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '../api/client';
import { type LiveVoice, type LiveVoiceView, startLiveVoice } from './liveVoice';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'unavailable';

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
  connect(): Promise<LiveVoice | null>;
  sendTyped(text: string): Promise<boolean>;
  toggleTalk(): Promise<void>;
}

// One room for one session screen, opened by the student's own press, because audio needs a user gesture.
export function useLiveVoice({ sessionId, usesSpeechCleanup = true, start = startLiveVoice }: UseLiveVoiceOptions): LiveVoiceControls {
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [voice, setVoice] = useState<LiveVoice | null>(null);
  const opening = useRef<Promise<LiveVoice | null> | null>(null);
  const isGone = useRef(false);
  const view = useSyncExternalStore(voice?.subscribe ?? noSubscribe, voice?.getView ?? noView);

  const connect = useCallback(() => {
    opening.current ??= (async () => {
      setStatus('connecting');
      try {
        const opened = await start({ usesSpeechCleanup, getAccess: () => api.post('/sessions/{id}/live-room', { params: { path: { id: sessionId } } }) });
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

  return {
    status,
    view,
    voice,
    connect,
    async sendTyped(text) {
      const opened = await connect();
      opened?.sendTyped(text);
      return opened !== null;
    },
    async toggleTalk() {
      const opened = await connect();
      if (opened) await opened.setMicOn(opened.getView().mic !== 'on');
    },
  };
}
