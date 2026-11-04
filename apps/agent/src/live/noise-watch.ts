const CUTS_WITHIN_MS = 120_000;

export interface NoiseWatch {
  /** Returns true the first time such cuts keep happening. */
  noteNoiseCut(atMs: number): boolean;
}

export function createNoiseWatch(): NoiseWatch {
  let lastCutAtMs = -Infinity;
  let hasSaid = false;
  return {
    noteNoiseCut(atMs) {
      const keepsHappening = atMs - lastCutAtMs <= CUTS_WITHIN_MS;
      lastCutAtMs = atMs;
      if (!keepsHappening || hasSaid) return false;
      hasSaid = true;
      return true;
    },
  };
}
