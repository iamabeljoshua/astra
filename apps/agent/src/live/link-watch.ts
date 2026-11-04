/** Pulses come every 500 ms, so this many missed is a drop and not a late packet. */
export const LINK_QUIET_LIMIT_MS = 1500;

export interface LinkWatch {
  notePulse(hearsAgent: boolean, nowMs: number): void;
  check(nowMs: number): void;
}

interface LinkWatchOptions {
  onLost(): void;
  onBack(): void;
}

// Watches both directions. The student's browser says if the agent's own pulse stopped reaching it, because the agent's audio would be going nowhere while its pulses still arrive.
export function createLinkWatch({ onLost, onBack }: LinkWatchOptions): LinkWatch {
  let lastPulseAtMs: number | null = null;
  let isDown = false;
  const setDown = (next: boolean) => {
    if (next === isDown) return;
    isDown = next;
    (next ? onLost : onBack)();
  };
  return {
    notePulse(hearsAgent, nowMs) {
      lastPulseAtMs = nowMs;
      setDown(!hearsAgent);
    },
    check(nowMs) {
      if (lastPulseAtMs !== null && nowMs - lastPulseAtMs > LINK_QUIET_LIMIT_MS) setDown(true);
    },
  };
}
