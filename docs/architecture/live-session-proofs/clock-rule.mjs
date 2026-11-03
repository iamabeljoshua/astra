const SMALLEST_GAP_MS = 20;
const HELD_SHORT_MS = 1;

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
        if (gap.ms === null) return gap.atMs - HELD_SHORT_MS;
        positionMs -= gap.ms;
      }
      return positionMs;
    },
  };
}

// Runs in the agent. A report sent when the queue empties reaches the browser before the silence does.
export function createPlayoutTracker({ onRanDry }) {
  let queuedUntilMs = null;
  let audioMs = 0;
  let dryTimer = null;
  return {
    onFrame(nowMs, frameMs) {
      clearTimeout(dryTimer);
      const lateByMs = queuedUntilMs === null ? 0 : nowMs - queuedUntilMs;
      const gap = lateByMs >= SMALLEST_GAP_MS ? { atMs: Math.round(audioMs), ms: Math.round(lateByMs) } : null;
      queuedUntilMs = Math.max(queuedUntilMs ?? nowMs, nowMs) + frameMs;
      audioMs += frameMs;
      const atMs = Math.round(audioMs);
      dryTimer = setTimeout(() => onRanDry({ atMs }), queuedUntilMs + SMALLEST_GAP_MS - nowMs);
      return gap;
    },
    close() {
      clearTimeout(dryTimer);
    },
  };
}
