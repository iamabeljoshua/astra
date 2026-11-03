const SMALLEST_GAP_MS = 20;
const HELD_SHORT_MS = 1;
export const LONGEST_HOLD_MS = 3000;

// Counts from the first sound and skips the gaps the agent reports, so a silence needs no guess.
export function createWordClock() {
  let firstSoundAtMs = null;
  const gaps = [];
  return {
    onFirstSound(atMs) {
      firstSoundAtMs ??= atMs;
    },
    addGap({ atMs, ms = null }) {
      const known = gaps.find((gap) => gap.atMs === atMs);
      if (known) known.ms ??= ms;
      else gaps.push({ atMs, ms });
      gaps.sort((first, second) => first.atMs - second.atMs);
    },
    getPositionMs(atMs, firstWordStartMs = 0) {
      if (firstSoundAtMs === null) return null;
      let positionMs = atMs - firstSoundAtMs + firstWordStartMs;
      for (const gap of gaps) {
        if (positionMs < gap.atMs) break;
        if (gap.ms !== null) positionMs -= gap.ms;
        else if (positionMs - gap.atMs < LONGEST_HOLD_MS) return gap.atMs - HELD_SHORT_MS;
      }
      return positionMs;
    },
  };
}

// Runs in the agent. A report sent when the queue empties reaches the browser before the silence does.
export function createPlayoutTracker({ onRanDry }) {
  let queuedUntilMs = null;
  let audioMs = 0;
  let unreportedLateMs = 0;
  let openGapAtMs = null;
  let dryTimer = null;
  const takeGapIfDue = () => {
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
