import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/apiError';
import { api } from '../api/client';
import { type LiveVoice, type LiveVoiceView, type MicControls, startLiveVoice } from './liveVoice';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'unavailable' | 'tooSoon' | 'finished';

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

export interface HeldMic extends Pick<MicControls, 'isMicOn' | 'lowerTutor' | 'tellHoldStarted' | 'endLine'> {
  open(): void;
  close(): void;
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
  heldMic: HeldMic;
  /** Leaves a room the tutor has gone from, and opens a new one with a new tutor. */
  openAgain(): Promise<void>;
}

// One room for one session screen, opened by the student's own press, because audio needs a user gesture.
export function useLiveVoice({ sessionId, usesSpeechCleanup = true, start = startLiveVoice }: UseLiveVoiceOptions): LiveVoiceControls {
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);
  const [voice, setVoice] = useState<LiveVoice | null>(null);
  const opening = useRef<Promise<LiveVoice | null> | null>(null);
  // The tutor is known to have gone, and a plain join would find its room and keep that room alive for 2 more minutes, so every ask starts over until one is answered.
  const asksToStartOver = useRef(false);
  const isGone = useRef(false);
  const micControls = useRef<MicControls | null>(null);
  const wantsMicWhileOpening = useRef(false);
  const isHoldTellOwed = useRef(false);
  const [isTalkWaiting, setIsTalkWaiting] = useState(false);
  const view = useSyncExternalStore(voice?.subscribe ?? noSubscribe, voice?.getView ?? noView);

  const connect = useCallback(({ wantsGreeting, startsOver = false }: { wantsGreeting: boolean; startsOver?: boolean } = { wantsGreeting: true }) => {
    if (startsOver) asksToStartOver.current = true;
    opening.current ??= (async () => {
      setStatus('connecting');
      const getAccess = async () => {
        const query = asksToStartOver.current ? { startOver: 'yes' as const } : {};
        try {
          const access = await api.post('/sessions/{id}/live-room', { params: { path: { id: sessionId }, query } });
          asksToStartOver.current = false;
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
        const opened = await start({
          usesSpeechCleanup,
          wantsGreeting,
          getAccess,
          onMicReady(controls) {
            micControls.current = controls;
            if (wantsMicWhileOpening.current) void controls.setMic(true);
            if (isHoldTellOwed.current) controls.tellHoldStarted();
            isHoldTellOwed.current = false;
          },
          onTalkInvited() {
            void api.put('/me/talk-invitation', { body: { heard: true } }).catch(() => {});
          },
        });
        if (isGone.current) {
          await opened.close();
          return null;
        }
        if (import.meta.env.DEV) window.astraVoice = opened;
        micControls.current = opened;
        setVoice(opened);
        setStatus('live');
        return opened;
      } catch {
        opening.current = null;
        micControls.current = null;
        setStatus((current) => (current === 'finished' || current === 'tooSoon' ? current : 'unavailable'));
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

  // Only the last wish reaches the microphone, because a second press while the room opens means off.
  const askForMic = async (isOn: boolean) => {
    wantsMicWhileOpening.current = isOn;
    setIsTalkWaiting(isOn);
    void micControls.current?.setMic(isOn);
    const opened = await connect();
    const wantsMic = wantsMicWhileOpening.current;
    wantsMicWhileOpening.current = false;
    setIsTalkWaiting(false);
    if (opened && wantsMic) await opened.setMic(true);
  };

  const dropMicWish = () => {
    wantsMicWhileOpening.current = false;
    isHoldTellOwed.current = false;
    setIsTalkWaiting(false);
  };

  const heldMic: HeldMic = {
    isMicOn: () => micControls.current?.isMicOn() ?? wantsMicWhileOpening.current,
    open: () => void askForMic(true),
    close() {
      dropMicWish();
      void micControls.current?.setMic(false);
    },
    endLine() {
      dropMicWish();
      micControls.current?.endLine();
    },
    lowerTutor: () => micControls.current?.lowerTutor(),
    tellHoldStarted() {
      if (micControls.current) micControls.current.tellHoldStarted();
      else isHoldTellOwed.current = true;
    },
  };

  return {
    status,
    waitSeconds,
    view,
    voice,
    isTalkOn,
    connect,
    async sendTyped(text) {
      const opened = await connect({ wantsGreeting: false });
      opened?.sendTyped(text);
      return opened !== null;
    },
    async toggleTalk() {
      if (voice) return voice.toggleMic();
      await askForMic(!wantsMicWhileOpening.current);
    },
    heldMic,
    async openAgain() {
      const old = await opening.current;
      opening.current = null;
      micControls.current = null;
      setVoice(null);
      await old?.close();
      await connect({ wantsGreeting: false, startsOver: true });
    },
  };
}
