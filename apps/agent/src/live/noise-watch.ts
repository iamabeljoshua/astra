/** Two cuts this close are a room, and one is a cough. */
const CUTS_WITHIN_MS = 120_000;

export interface NoiseWatch {
  /** The tutor was cut by sound that turned out to have no words. Returns true the first time that keeps happening. */
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
