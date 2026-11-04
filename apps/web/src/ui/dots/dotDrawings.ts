import type { DotPoint } from './dotPoint';
import { getPlanetDots } from './planetDots';

function getCurve(pointAt: (progress: number) => DotPoint, count: number): DotPoint[] {
  return Array.from({ length: count }, (_unused, index) => pointAt(index / Math.max(1, count - 1)));
}

function getLine(startX: number, startY: number, endX: number, endY: number, count: number): DotPoint[] {
  return getCurve((progress) => [startX + (endX - startX) * progress, startY + (endY - startY) * progress], count);
}

export const DOT_DRAWINGS = {
  planet: getPlanetDots(),
  stairs: [0, 1, 2, 3, 4].flatMap((stair) => {
    const [x, y] = [-0.8 + stair * 0.32, 0.55 - stair * 0.26];
    return [...getLine(x, y, x + 0.32, y, 14), ...getLine(x + 0.32, y, x + 0.32, y - 0.26, 11)];
  }),
  rise: [
    ...getLine(-0.85, 0.6, 0.85, 0.6, 72),
    ...getLine(-0.85, 0.6, -0.85, -0.65, 53),
    ...getCurve((progress) => [-0.8 + 1.6 * progress, 0.55 - 1.15 * progress ** 2.4], 90),
  ],
} satisfies Record<string, DotPoint[]>;
