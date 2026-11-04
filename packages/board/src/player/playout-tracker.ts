const SMALLEST_GAP_MS = 20;

export interface PlayoutGap {
  atMs: number;
  ms: number;
}

export interface PlayoutTracker {
  onFrame(nowMs: number, frameMs: number): PlayoutGap | null;
  close(): void;
}

interface PlayoutTrackerOptions {
  onRanDry(gap: { atMs: number }): void;
}

// Runs in the agent. A report sent when the queue empties reaches the browser before the silence does.
export function createPlayoutTracker({ onRanDry }: PlayoutTrackerOptions): PlayoutTracker {
  let queuedUntilMs: number | null = null;
  let audioMs = 0;
  let unreportedLateMs = 0;
  let openGapAtMs: number | null = null;
  let dryTimer: ReturnType<typeof setTimeout> | undefined;

  const takeGapIfDue = (): PlayoutGap | null => {
    if (openGapAtMs === null && unreportedLateMs < SMALLEST_GAP_MS) return null;
    const gap = { atMs: openGapAtMs ?? Math.round(audioMs), ms: Math.round(unreportedLateMs) };
    openGapAtMs = null;
    unreportedLateMs = 0;
    return gap;
  };
  const reportDry = () => {
    openGapAtMs = Math.round(audioMs);
    onRanDry({ atMs: openGapAtMs });
  };

  return {
    onFrame(nowMs, frameMs) {
      clearTimeout(dryTimer);
      // A frame ahead of the queue banks nothing, or a burst would hide the next stall.
      unreportedLateMs += Math.max(0, nowMs - (queuedUntilMs ?? nowMs));
      const gap = takeGapIfDue();
      queuedUntilMs = Math.max(queuedUntilMs ?? nowMs, nowMs) + frameMs;
      audioMs += frameMs;
      dryTimer = setTimeout(reportDry, queuedUntilMs + SMALLEST_GAP_MS - nowMs);
      return gap;
    },
    close() {
      clearTimeout(dryTimer);
    },
  };
}
