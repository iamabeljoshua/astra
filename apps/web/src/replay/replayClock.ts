export const REPLAY_SPEEDS = [1, 1.5, 2] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export interface ReplayClock {
  getAtMs(): number;
  isPlaying(): boolean;
  getSpeed(): ReplaySpeed;
  /** Starts again from the top if it has reached the end. */
  play(): void;
  pause(): void;
  seek(atMs: number): void;
  setSpeed(speed: ReplaySpeed): void;
}

// Everything in a replay is a reading of this one time, so pausing, seeking, and speed need nothing else to agree with them.
export function createReplayClock(durationMs: number, getNowMs: () => number): ReplayClock {
  let fromMs = 0;
  let startedAtMs: number | null = null;
  let speed: ReplaySpeed = 1;

  const getAtMs = () => (startedAtMs === null ? fromMs : Math.min(durationMs, fromMs + (getNowMs() - startedAtMs) * speed));

  const settle = () => {
    const atMs = getAtMs();
    fromMs = atMs;
    startedAtMs = startedAtMs === null || atMs >= durationMs ? null : getNowMs();
  };

  return {
    getAtMs,
    isPlaying() {
      settle();
      return startedAtMs !== null;
    },
    getSpeed: () => speed,
    play() {
      settle();
      if (fromMs >= durationMs) fromMs = 0;
      startedAtMs = getNowMs();
    },
    pause() {
      settle();
      startedAtMs = null;
    },
    seek(atMs) {
      settle();
      fromMs = Math.min(durationMs, Math.max(0, atMs));
    },
    setSpeed(next) {
      settle();
      speed = next;
    },
  };
}
