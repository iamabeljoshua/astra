const SMALLEST_GAP_MS = 20;
const HELD_SHORT_MS = 1;

// The agent reports when its audio ran dry, so a silence needs no guess: a report is skipped, and anything else is on the timeline.
export function createWordClock() {
  let firstSoundAtMs = null;
  const gaps = [];
  return {
    onFirstSound(atMs) {
      firstSoundAtMs ??= atMs;
    },
    // A gap with no length is still open, because the agent says when its audio runs dry and again when it comes back.
    addGap({ atMs, ms = null }) {
      const open = gaps.find((gap) => gap.atMs === atMs);
      if (open) open.ms = ms;
      else gaps.push({ atMs, ms });
      gaps.sort((first, second) => first.atMs - second.atMs);
    },
    // Word times count from the first sound, so the first word sets the zero once it is known.
    getPositionMs(atMs, firstWordStartMs = 0) {
      if (firstSoundAtMs === null) return null;
      let positionMs = atMs - firstSoundAtMs + firstWordStartMs;
      for (const gap of gaps) {
        if (positionMs < gap.atMs) break;
        // Held just short, so a word that starts right after the gap waits for its own sound.
        if (gap.ms === null) return gap.atMs - HELD_SHORT_MS;
        positionMs -= gap.ms;
      }
      return positionMs;
    },
  };
}

// Runs in the agent. The audio in flight is still ahead of the browser when the queue empties, so a report sent then arrives before the silence does.
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
