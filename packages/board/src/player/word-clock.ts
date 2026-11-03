const HELD_SHORT_MS = 1;

/** A starting guess: a closing report later than this counts as lost. */
export const LONGEST_HOLD_MS = 3000;

export interface ReportedGap {
  atMs: number;
  ms?: number | null;
}

interface KnownGap {
  atMs: number;
  ms: number | null;
}

export interface WordClock {
  onFirstSound(atMs: number): void;
  addGap(gap: ReportedGap): void;
  getPositionMs(atMs: number, firstWordStartMs?: number): number | null;
}

// Counts from the first sound and skips the gaps the agent reports, so a silence needs no guess.
export function createWordClock(): WordClock {
  let firstSoundAtMs: number | null = null;
  const gaps: KnownGap[] = [];
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
        // A stall before the first word came before the first sound, so the count already starts after it.
        if (gap.atMs <= firstWordStartMs) continue;
        if (positionMs < gap.atMs) break;
        if (gap.ms !== null) positionMs -= gap.ms;
        else if (positionMs - gap.atMs < LONGEST_HOLD_MS) return gap.atMs - HELD_SHORT_MS;
      }
      return positionMs;
    },
  };
}
