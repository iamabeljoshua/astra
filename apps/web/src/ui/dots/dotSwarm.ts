import type { DotPoint } from './dotPoint';
import { createSeededRandom } from './dotPoint';
import { getGlideProgress, SETTLE_MS } from './glide';

export interface DotSwarm {
  count: number;
  fromX: Float32Array;
  fromY: Float32Array;
  fromSize: Float32Array;
  toX: Float32Array;
  toY: Float32Array;
  toSize: Float32Array;
  waitMs: Float32Array;
  startedAt: number;
}

const SWARM_SEED = 13;
const LONGEST_WAIT_MS = 360;
const DEFAULT_DOT_SIZE = 1;
const SCATTER = { width: 2.4, height: 1.6, size: 0.6 };

const random = createSeededRandom(SWARM_SEED);

export function createDotSwarm(count: number): DotSwarm {
  const makeList = () => new Float32Array(count);
  return {
    count,
    fromX: makeList(),
    fromY: makeList(),
    fromSize: makeList(),
    toX: makeList(),
    toY: makeList(),
    toSize: makeList(),
    waitMs: makeList(),
    startedAt: Number.NEGATIVE_INFINITY,
  };
}

export function getDotPosition(swarm: DotSwarm, dot: number, now: number): [x: number, y: number, size: number] {
  const progress = getGlideProgress(now - swarm.startedAt - (swarm.waitMs[dot] ?? 0));
  const [fromX, fromY, fromSize] = [swarm.fromX[dot] ?? 0, swarm.fromY[dot] ?? 0, swarm.fromSize[dot] ?? 0];
  return [
    fromX + ((swarm.toX[dot] ?? 0) - fromX) * progress,
    fromY + ((swarm.toY[dot] ?? 0) - fromY) * progress,
    fromSize + ((swarm.toSize[dot] ?? 0) - fromSize) * progress,
  ];
}

function setTargets(swarm: DotSwarm, points: readonly DotPoint[]) {
  for (let dot = 0; dot < swarm.count; dot += 1) {
    const [x, y, size = DEFAULT_DOT_SIZE] = points[Math.floor((dot / swarm.count) * points.length)] ?? [0, 0];
    swarm.toX[dot] = x;
    swarm.toY[dot] = y;
    swarm.toSize[dot] = size;
  }
}

export function placeDots(swarm: DotSwarm, points: readonly DotPoint[]) {
  setTargets(swarm, points);
  swarm.fromX.set(swarm.toX);
  swarm.fromY.set(swarm.toY);
  swarm.fromSize.set(swarm.toSize);
  swarm.waitMs.fill(0);
  swarm.startedAt = Number.NEGATIVE_INFINITY;
}

export function scatterDots(swarm: DotSwarm) {
  for (let dot = 0; dot < swarm.count; dot += 1) {
    swarm.toX[dot] = (random() - 0.5) * SCATTER.width;
    swarm.toY[dot] = (random() - 0.5) * SCATTER.height;
    swarm.toSize[dot] = SCATTER.size;
  }
  swarm.fromX.set(swarm.toX);
  swarm.fromY.set(swarm.toY);
  swarm.fromSize.set(swarm.toSize);
}

export function sendDots(swarm: DotSwarm, points: readonly DotPoint[], now: number) {
  for (let dot = 0; dot < swarm.count; dot += 1) {
    const [x, y, size] = getDotPosition(swarm, dot, now);
    swarm.fromX[dot] = x;
    swarm.fromY[dot] = y;
    swarm.fromSize[dot] = size;
    swarm.waitMs[dot] = random() * LONGEST_WAIT_MS;
  }
  setTargets(swarm, points);
  swarm.startedAt = now;
}

export function isSwarmSettled(swarm: DotSwarm, now: number) {
  return now - swarm.startedAt >= LONGEST_WAIT_MS + SETTLE_MS;
}
