import type { Point } from '../figure/figure-marks.ts';

export const GRAVITY = 9.8;

export interface PathPoint {
  at: Point;
  turn: number;
}

export interface SketchPath {
  durationSeconds: number;
  moments: Readonly<Record<string, number>>;
  getPoint(seconds: number): PathPoint;
}

const clampTime = (seconds: number, duration: number) => Math.min(Math.max(seconds, 0), duration);

export function getRollOffPath({ start, edgeX, floorY, radius, landsAfter, gravity }: { start: Point; edgeX: number; floorY: number; radius: number; landsAfter: number; gravity: number }): SketchPath {
  const direction = Math.sign(edgeX - start.x) || 1;
  const drop = Math.max(0, floorY - radius - start.y);
  const fallSeconds = Math.sqrt((2 * drop) / gravity);
  const speed = fallSeconds > 0 ? landsAfter / fallSeconds : 1;
  const rollSeconds = Math.abs(edgeX - start.x) / speed;
  const durationSeconds = rollSeconds + fallSeconds;
  return {
    durationSeconds,
    moments: { edge: rollSeconds, landing: durationSeconds },
    getPoint(seconds) {
      const time = clampTime(seconds, durationSeconds);
      const rolled = Math.min(time, rollSeconds) * speed;
      const flying = Math.max(0, time - rollSeconds);
      return { at: { x: start.x + direction * (rolled + flying * speed), y: start.y + (gravity * flying * flying) / 2 }, turn: (direction * (rolled + flying * speed)) / radius };
    },
  };
}

export function getFallPath({ start, floorY, radius, gravity }: { start: Point; floorY: number; radius: number; gravity: number }): SketchPath {
  const drop = Math.max(0, floorY - radius - start.y);
  const durationSeconds = Math.sqrt((2 * drop) / gravity);
  return {
    durationSeconds,
    moments: { landing: durationSeconds },
    getPoint: (seconds) => {
      const time = clampTime(seconds, durationSeconds);
      return { at: { x: start.x, y: start.y + (gravity * time * time) / 2 }, turn: 0 };
    },
  };
}

/** Goes round a centre at one speed, counterclockwise as seen on the board, which is how orbits in our sky are drawn from above the north pole. */
export function getOrbitPath({ start, center, turns, secondsPerTurn }: { start: Point; center: Point; turns: number; secondsPerTurn: number }): SketchPath {
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const durationSeconds = turns * secondsPerTurn;
  return {
    durationSeconds,
    moments: { half: durationSeconds / 2, around: durationSeconds },
    getPoint(seconds) {
      const angle = startAngle - (clampTime(seconds, durationSeconds) / secondsPerTurn) * 2 * Math.PI;
      return { at: { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }, turn: 0 };
    },
  };
}

export function getSwingPath({ start, pivot, amplitudeRadians, swings, gravity }: { start: Point; pivot: Point; amplitudeRadians: number; swings: number; gravity: number }): SketchPath {
  const length = Math.max(Math.hypot(start.x - pivot.x, start.y - pivot.y), 1e-6);
  const restAngle = Math.atan2(start.x - pivot.x, start.y - pivot.y);
  const angularSpeed = Math.sqrt(gravity / length);
  const period = (2 * Math.PI) / angularSpeed;
  const durationSeconds = swings * period;
  return {
    durationSeconds,
    moments: { top: period / 4, back: period / 2, other: (3 * period) / 4, done: durationSeconds },
    getPoint(seconds) {
      const angle = restAngle + amplitudeRadians * Math.sin(angularSpeed * clampTime(seconds, durationSeconds));
      return { at: { x: pivot.x + Math.sin(angle) * length, y: pivot.y + Math.cos(angle) * length }, turn: restAngle - angle };
    },
  };
}

function getLengths(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push((lengths[index - 1] as number) + Math.hypot((points[index] as Point).x - (points[index - 1] as Point).x, (points[index] as Point).y - (points[index - 1] as Point).y));
  return lengths;
}

export function getAlongPath({ points, speed }: { points: readonly Point[]; speed: number }): SketchPath {
  const lengths = getLengths(points);
  const total = lengths.at(-1) ?? 0;
  const durationSeconds = speed > 0 ? total / speed : 0;
  return {
    durationSeconds,
    moments: { end: durationSeconds },
    getPoint(seconds) {
      const travelled = durationSeconds === 0 ? total : (clampTime(seconds, durationSeconds) / durationSeconds) * total;
      const index = Math.max(1, lengths.findIndex((length) => length >= travelled));
      const from = points[index - 1] ?? points[0] ?? { x: 0, y: 0 };
      const to = points[index] ?? from;
      const span = (lengths[index] ?? 0) - (lengths[index - 1] ?? 0);
      const share = span === 0 ? 1 : (travelled - (lengths[index - 1] ?? 0)) / span;
      return { at: { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }, turn: 0 };
    },
  };
}

export function getTiltPath({ start, pivot, radians, seconds: durationSeconds }: { start: Point; pivot: Point; radians: number; seconds: number }): SketchPath {
  return {
    durationSeconds,
    moments: { tipped: durationSeconds },
    getPoint(seconds) {
      const share = durationSeconds === 0 ? 1 : clampTime(seconds, durationSeconds) / durationSeconds;
      const angle = radians * (0.5 - Math.cos(Math.PI * share) / 2);
      const offset = { x: start.x - pivot.x, y: start.y - pivot.y };
      return { at: { x: pivot.x + offset.x * Math.cos(angle) - offset.y * Math.sin(angle), y: pivot.y + offset.x * Math.sin(angle) + offset.y * Math.cos(angle) }, turn: angle };
    },
  };
}

export function getSpinPath({ start, turns, secondsPerTurn }: { start: Point; turns: number; secondsPerTurn: number }): SketchPath {
  const durationSeconds = turns * secondsPerTurn;
  return {
    durationSeconds,
    moments: { done: durationSeconds },
    getPoint: (seconds) => ({ at: start, turn: (clampTime(seconds, durationSeconds) / secondsPerTurn) * 2 * Math.PI }),
  };
}
