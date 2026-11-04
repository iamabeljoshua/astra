import { useCallback, useEffect, useRef, useState } from 'react';
import { createDeviceVoice } from './deviceVoice';
import { createReplayClock, type ReplaySpeed } from './replayClock';
import { getSpokenBeatAt, type ReplayLesson } from './replayLesson';

/** A step between frames longer than this is a seek, and not the clock moving on. */
const LONGEST_FRAME_MS = 500;

export interface ReplayPlayer {
  atMs: number;
  isPlaying: boolean;
  speed: ReplaySpeed;
  isSoundOn: boolean;
  canSpeak: boolean;
  togglePlay(): void;
  seek(atMs: number): void;
  setSpeed(speed: ReplaySpeed): void;
  toggleSound(): void;
}

function useCanSpeak(voice: ReturnType<typeof createDeviceVoice>) {
  const [canSpeak, setCanSpeak] = useState(() => voice.canSpeak());
  useEffect(() => {
    const speech = window.speechSynthesis as SpeechSynthesis | undefined;
    const check = () => setCanSpeak(voice.canSpeak());
    speech?.addEventListener('voiceschanged', check);
    return () => speech?.removeEventListener('voiceschanged', check);
  }, [voice]);
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
    const spoken = isPlaying && isSoundOn ? getSpokenBeatAt(lesson, atMs) : null;
    voice.follow(spoken && { ...spoken, endMs: spoken.beat.endMs, speed: clock.getSpeed(), wasJump });
  }, [atMs, isPlaying, isSoundOn, lesson, voice, clock]);

  useEffect(() => () => voice.stop(), [voice]);

  const togglePlay = useCallback(() => {
    if (clock.isPlaying()) clock.pause();
    else clock.play();
    setAtMs(clock.getAtMs());
    setIsPlaying(clock.isPlaying());
  }, [clock]);

  const seek = useCallback(
    (next: number) => {
      clock.seek(next);
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

  return { atMs, isPlaying, speed, isSoundOn, canSpeak, togglePlay, seek, setSpeed, toggleSound: () => setIsSoundOn((isOn) => !isOn) };
}
