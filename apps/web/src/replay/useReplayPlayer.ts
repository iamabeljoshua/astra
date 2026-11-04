import { useCallback, useEffect, useRef, useState } from 'react';
import { createDeviceVoice } from './deviceVoice';
import { createReplayClock, type ReplaySpeed } from './replayClock';
import { getSpokenBeatAt, type ReplayLesson } from './replayLesson';

/** A step between frames longer than this is a seek, and not the clock moving on. */
const LONGEST_FRAME_MS = 500;
/** A browser lists its voices some time after the page opens, so until then it is not known whether it has any. */
const VOICES_LISTED_WITHIN_MS = 2500;

export interface ReplayPlayer {
  atMs: number;
  isPlaying: boolean;
  speed: ReplaySpeed;
  isSoundOn: boolean;
  /** Nothing has moved yet, so the screen can open on how the lesson ended. */
  hasMoved: boolean;
  /** Null until the browser has had time to list its voices. */
  canSpeak: boolean | null;
  togglePlay(): void;
  seek(atMs: number): void;
  setSpeed(speed: ReplaySpeed): void;
  toggleSound(): void;
}

function useCanSpeak(voice: ReturnType<typeof createDeviceVoice>) {
  const speech = window.speechSynthesis as SpeechSynthesis | undefined;
  const [canSpeak, setCanSpeak] = useState<boolean | null>(() => (!speech ? false : voice.canSpeak() || null));
  useEffect(() => {
    const check = () => setCanSpeak(voice.canSpeak());
    const giveUp = setTimeout(check, VOICES_LISTED_WITHIN_MS);
    speech?.addEventListener('voiceschanged', check);
    return () => {
      clearTimeout(giveUp);
      speech?.removeEventListener('voiceschanged', check);
    };
  }, [voice, speech]);
  return canSpeak;
}

// One clock, read once a frame while it plays. A paused replay runs nothing.
export function useReplayPlayer(lesson: ReplayLesson): ReplayPlayer {
  const [clock] = useState(() => createReplayClock(lesson.durationMs, () => performance.now()));
  const [voice] = useState(() => createDeviceVoice(window.speechSynthesis as SpeechSynthesis | undefined));
  const canSpeak = useCanSpeak(voice);
  const [atMs, setAtMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [hasMoved, setHasMoved] = useState(false);
  const lastAtMs = useRef(0);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let frame = requestAnimationFrame(function draw() {
      setAtMs(clock.getAtMs());
      if (clock.isPlaying()) frame = requestAnimationFrame(draw);
      else setIsPlaying(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, clock]);

  useEffect(() => {
    const wasJump = Math.abs(atMs - lastAtMs.current) > LONGEST_FRAME_MS * clock.getSpeed();
    lastAtMs.current = atMs;
    const spoken = getSpokenBeatAt(lesson, atMs);
    if (!isPlaying || !isSoundOn || (wasJump && !spoken)) voice.stop();
    else if (spoken) voice.follow({ ...spoken, speed: clock.getSpeed(), wasJump });
  }, [atMs, isPlaying, isSoundOn, lesson, voice, clock]);

  useEffect(() => () => voice.stop(), [voice]);

  const togglePlay = useCallback(() => {
    if (clock.isPlaying()) clock.pause();
    else clock.play();
    setHasMoved(true);
    setAtMs(clock.getAtMs());
    setIsPlaying(clock.isPlaying());
  }, [clock]);

  const seek = useCallback(
    (next: number) => {
      clock.seek(next);
      setHasMoved(true);
      setAtMs(clock.getAtMs());
    },
    [clock],
  );

  const setSpeed = useCallback(
    (next: ReplaySpeed) => {
      clock.setSpeed(next);
      setSpeedState(next);
    },
    [clock],
  );

  return { atMs, isPlaying, speed, isSoundOn, hasMoved, canSpeak, togglePlay, seek, setSpeed, toggleSound: () => setIsSoundOn((isOn) => !isOn) };
}
