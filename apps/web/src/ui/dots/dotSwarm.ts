import { createSeededRandom, type DotPoint } from './dotDrawings';

export interface DotSwarm {
  count: number;
  fromX: Float32Array;
  fromY: Float32Array;
  toX: Float32Array;
  toY: Float32Array;
  waitMs: Float32Array;
  startedAt: number;
}

const SWARM_SEED = 13;
const JITTER = 0.012;
const LONGEST_WAIT_MS = 360;
const SETTLE_MS = 1400;
const FRAME_MS = 1000 / 60;
const STILL_LEFT_PER_FRAME = 0.925;

const random = createSeededRandom(SWARM_SEED);

export function createDotSwarm(count: number): DotSwarm {
  const makeList = () => new Float32Array(count);
  return { count, fromX: makeList(), fromY: makeList(), toX: makeList(), toY: makeList(), waitMs: makeList(), startedAt: 0 };
}

// Each dot closes the same share of its distance each frame, by the clock, so a slow phone arrives on time.
function getProgress(elapsedMs: number) {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= SETTLE_MS) return 1;
  return 1 - STILL_LEFT_PER_FRAME ** (elapsedMs / FRAME_MS);
}

export function getDotPosition(swarm: DotSwarm, dot: number, now: number): [x: number, y: number] {
  const progress = getProgress(now - swarm.startedAt - (swarm.waitMs[dot] ?? 0));
  const [fromX, fromY] = [swarm.fromX[dot] ?? 0, swarm.fromY[dot] ?? 0];
  return [fromX + ((swarm.toX[dot] ?? 0) - fromX) * progress, fromY + ((swarm.toY[dot] ?? 0) - fromY) * progress];
}

function setTargets(swarm: DotSwarm, points: readonly DotPoint[]) {
  for (let dot = 0; dot < swarm.count; dot += 1) {
    const [x, y] = points[Math.floor((dot / swarm.count) * points.length)] ?? [0, 0];
    swarm.toX[dot] = x + (random() - 0.5) * JITTER;
    swarm.toY[dot] = y + (random() - 0.5) * JITTER;
  }
}

export function placeDots(swarm: DotSwarm, points: readonly DotPoint[]) {
  setTargets(swarm, points);
  swarm.fromX.set(swarm.toX);
  swarm.fromY.set(swarm.toY);
  swarm.waitMs.fill(0);
  swarm.startedAt = 0;
}

export function sendDots(swarm: DotSwarm, points: readonly DotPoint[], now: number) {
  for (let dot = 0; dot < swarm.count; dot += 1) {
    const [x, y] = getDotPosition(swarm, dot, now);
    swarm.fromX[dot] = x;
    swarm.fromY[dot] = y;
    swarm.waitMs[dot] = random() * LONGEST_WAIT_MS;
  }
  setTargets(swarm, points);
  swarm.startedAt = now;
}

export function isSwarmSettled(swarm: DotSwarm, now: number) {
  return now - swarm.startedAt >= LONGEST_WAIT_MS + SETTLE_MS;
}
