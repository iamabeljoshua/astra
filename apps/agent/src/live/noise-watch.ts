const CUTS_WITHIN_MS = 120_000;

export interface NoiseWatch {
  /** Returns true the first time wordless cuts keep happening. */
  noteWordlessCut(atMs: number): boolean;
}

export function createNoiseWatch(): NoiseWatch {
  let lastCutAtMs = -Infinity;
  let hasSaid = false;
  return {
    noteWordlessCut(atMs) {
      const keepsHappening = atMs - lastCutAtMs <= CUTS_WITHIN_MS;
      lastCutAtMs = atMs;
      if (!keepsHappening || hasSaid) return false;
      hasSaid = true;
      return true;
    },
  };
}
