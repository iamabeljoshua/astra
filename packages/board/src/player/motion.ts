/** A value moving from `from` toward `to` over session time, so a freeze and a replay treat everything on the board alike. */
export interface Motion {
  startedAtMs: number;
  from: number;
  to: number;
  unitsPerMs: number;
}

export function holdMotion(value: number, atMs: number): Motion {
  return { startedAtMs: atMs, from: value, to: value, unitsPerMs: 0 };
}

export function moveOver({ from, to, atMs, overMs }: { from: number; to: number; atMs: number; overMs: number }): Motion {
  if (overMs <= 0) return holdMotion(to, atMs);
  return { startedAtMs: atMs, from, to, unitsPerMs: Math.abs(to - from) / overMs };
}

export function getMotionValue(motion: Motion, atMs: number): number {
  const travelled = Math.min(Math.abs(motion.to - motion.from), Math.max(0, atMs - motion.startedAtMs) * motion.unitsPerMs);
  return motion.from + Math.sign(motion.to - motion.from) * travelled;
}

export function isMoving(motion: Motion, atMs: number): boolean {
  return getMotionValue(motion, atMs) !== motion.to;
}
