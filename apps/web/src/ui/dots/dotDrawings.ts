export type DotPoint = readonly [x: number, y: number];

const FULL_TURN = Math.PI * 2;
const DRAWING_SEED = 67;
const RANDOM_MULTIPLIER = 1664525;
const RANDOM_INCREMENT = 1013904223;
const RANDOM_RANGE = 4294967296;

export function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * RANDOM_MULTIPLIER + RANDOM_INCREMENT) % RANDOM_RANGE;
    return state / RANDOM_RANGE;
  };
}

function getLine(startX: number, startY: number, endX: number, endY: number, count: number): DotPoint[] {
  return getCurve((progress) => [startX + (endX - startX) * progress, startY + (endY - startY) * progress], count);
}

function getCurve(pointAt: (progress: number) => DotPoint, count: number): DotPoint[] {
  return Array.from({ length: count }, (_unused, index) => pointAt(index / Math.max(1, count - 1)));
}

function getRing(radiusX: number, radiusY: number, tilt: number, count: number): DotPoint[] {
  return Array.from({ length: count }, (_unused, index) => {
    const angle = (index / count) * FULL_TURN;
    const [x, y] = [Math.cos(angle) * radiusX, Math.sin(angle) * radiusY];
    return [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
  });
}

function getBlob(centerX: number, centerY: number, radius: number, count: number): DotPoint[] {
  const random = createSeededRandom(DRAWING_SEED);
  return Array.from({ length: count }, () => {
    const angle = random() * FULL_TURN;
    const distance = Math.sqrt(random()) * radius;
    return [centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance];
  });
}

export const DOT_DRAWINGS = {
  arc: [
    ...getLine(-0.85, 0.6, 0.85, 0.6, 180),
    ...getCurve((progress) => {
      const x = -0.8 + 1.6 * progress;
      return [x, 0.6 - 1.1 * (1 - (x / 0.8) ** 2)];
    }, 720),
    ...getBlob(0, -0.5, 0.075, 240),
  ],
  atom: [...getBlob(0, 0, 0.09, 240), ...getRing(0.72, 0.26, 0, 340), ...getRing(0.72, 0.26, 1.05, 340), ...getRing(0.72, 0.26, -1.05, 340)],
  orbit: [...getBlob(0, 0, 0.13, 320), ...getRing(0.5, 0.2, -0.35, 240), ...getRing(0.82, 0.34, -0.35, 400), ...getBlob(0.74, -0.3, 0.05, 90), ...getBlob(-0.45, 0.16, 0.035, 60)],
  wave: [0, 1, 2].flatMap((row) => getCurve((progress) => [-0.9 + 1.8 * progress, -0.34 + row * 0.34 + Math.sin(progress * Math.PI * (4 + row)) * 0.13], 430)),
  code: [
    ...getLine(-0.28, -0.5, -0.75, 0, 200),
    ...getLine(-0.75, 0, -0.28, 0.5, 200),
    ...getLine(0.28, -0.5, 0.75, 0, 200),
    ...getLine(0.75, 0, 0.28, 0.5, 200),
    ...getLine(0.12, -0.62, -0.12, 0.62, 280),
  ],
  stairs: [0, 1, 2, 3, 4].flatMap((stair) => {
    const [x, y] = [-0.8 + stair * 0.32, 0.55 - stair * 0.26];
    return [...getLine(x, y, x + 0.32, y, 130), ...getLine(x + 0.32, y, x + 0.32, y - 0.26, 110)];
  }),
  rise: [
    ...getLine(-0.85, 0.6, 0.85, 0.6, 200),
    ...getLine(-0.85, 0.6, -0.85, -0.65, 200),
    ...getCurve((progress) => [-0.8 + 1.6 * progress, 0.55 - 1.15 * progress ** 2.4], 800),
  ],
} satisfies Record<string, DotPoint[]>;
