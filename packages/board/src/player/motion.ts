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

// Lands on `to` itself, because `from` plus the distance can round one step past it, and a second play to that moment would read as going backward and start over.
export function getMotionValue(motion: Motion, atMs: number): number {
  const travelled = Math.max(0, atMs - motion.startedAtMs) * motion.unitsPerMs;
  return travelled >= Math.abs(motion.to - motion.from) ? motion.to : motion.from + Math.sign(motion.to - motion.from) * travelled;
}

export function isMoving(motion: Motion, atMs: number): boolean {
  return getMotionValue(motion, atMs) !== motion.to;
}

export function getMotionEndMs(motion: Motion): number {
  return motion.unitsPerMs === 0 ? motion.startedAtMs : motion.startedAtMs + Math.abs(motion.to - motion.from) / motion.unitsPerMs;
}

const SHORTEST_RETIME_MS = 80;

export function retimeMotion(motion: Motion, atMs: number, landsAtMs: number): Motion {
  if (!isMoving(motion, atMs)) return motion;
  return moveOver({ from: getMotionValue(motion, atMs), to: motion.to, atMs, overMs: Math.max(landsAtMs - atMs, SHORTEST_RETIME_MS) });
}
