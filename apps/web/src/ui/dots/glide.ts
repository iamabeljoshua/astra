const FRAME_MS = 1000 / 60;
const STILL_LEFT_PER_FRAME = 0.925;

export const SETTLE_MS = 1400;

export interface Glide {
  from: number;
  to: number;
  startedAt: number;
}

// Closes the same share of the distance each frame, by the clock, so a slow phone arrives on time.
export function getGlideProgress(elapsedMs: number) {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= SETTLE_MS) return 1;
  return 1 - STILL_LEFT_PER_FRAME ** (elapsedMs / FRAME_MS);
}

export function getGlideValue({ from, to, startedAt }: Glide, now: number) {
  return from + (to - from) * getGlideProgress(now - startedAt);
}

export function isGlideMoving({ from, to, startedAt }: Glide, now: number) {
  return from !== to && now - startedAt < SETTLE_MS;
}
