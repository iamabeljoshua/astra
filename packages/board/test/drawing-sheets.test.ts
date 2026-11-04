import { describe, expect, it } from 'vitest';
import { drawLabeledSheet } from '../src/diagram/label-drawing.ts';
import { getStrokePath, type InkPosition, type InkStroke } from '../src/ink/ink-stroke.ts';

const LAPTOP_REQUEST = { fontSize: 16, maxWidth: 760, seed: 'corners' };
const PHONE_REQUEST = { fontSize: 16, maxWidth: 326, seed: 'corners' };
const BOARD_SCALE = 4.6;
const CURVE_SAMPLES = 16;

type Pair = readonly [number, number];

function getDrawnPoints(path: string): InkPosition[] {
  const points: InkPosition[] = [];
  let at: InkPosition = { x: 0, y: 0 };
  for (const [, command, numbers] of path.matchAll(/([MQL])([^MQLh]*)/g)) {
    const values = (numbers as string).trim().split(/\s+/).map(Number);
    if (command === 'Q') {
      const [controlX, controlY, toX, toY] = values as [number, number, number, number];
      const from = at;
      for (let step = 1; step <= CURVE_SAMPLES; step += 1) {
        const share = step / CURVE_SAMPLES;
        const rest = 1 - share;
        points.push({ x: rest * rest * from.x + 2 * rest * share * controlX + share * share * toX, y: rest * rest * from.y + 2 * rest * share * controlY + share * share * toY });
      }
      at = { x: toX, y: toY };
      continue;
    }
    at = { x: values[0] as number, y: values[1] as number };
    points.push(at);
  }
  return points;
}

function getDistanceToSegment(point: InkPosition, from: InkPosition, to: InkPosition): number {
  const acrossX = to.x - from.x;
  const acrossY = to.y - from.y;
  const lengthSquared = acrossX * acrossX + acrossY * acrossY;
  const share = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * acrossX + (point.y - from.y) * acrossY) / lengthSquared));
  return Math.hypot(point.x - (from.x + acrossX * share), point.y - (from.y + acrossY * share));
}

function getDistanceToStroke(point: InkPosition, stroke: InkStroke): number {
  const drawn = getDrawnPoints(getStrokePath(stroke));
  return Math.min(...drawn.slice(1).map((to, index) => getDistanceToSegment(point, drawn[index] as InkPosition, to)));
}

function getBodyStrokes(name: 'piano-keys' | 'lever'): readonly InkStroke[] {
  return drawLabeledSheet({ name }, LAPTOP_REQUEST)?.steps[0]?.strokes ?? [];
}

const toBoard = ([x, y]: Pair): InkPosition => ({ x: x * BOARD_SCALE, y: y * BOARD_SCALE });

// Keys share their sides, so each shape is read from its own stroke, the one that starts at its first corner.
function getStrokeStartingAt(strokes: readonly InkStroke[], start: InkPosition): InkStroke {
  const found = strokes.find(({ points }) => Math.hypot((points[0]?.x ?? 0) - start.x, (points[0]?.y ?? 0) - start.y) < 2);
  if (!found) throw new Error(`no stroke starts at ${start.x}, ${start.y}`);
  return found;
}

const getLargestCornerMiss = (strokes: readonly InkStroke[], corners: readonly Pair[]) => {
  const stroke = getStrokeStartingAt(strokes, toBoard(corners[0] as Pair));
  return Math.max(...corners.map((corner) => getDistanceToStroke(toBoard(corner), stroke)));
};

const WHITE_WIDTH = 96 / 7;
const BLACK_KEYS_AFTER = [1, 2, 4, 5, 6];
const BLACK_HALF_WIDTH = 4;
const BLACK_BOTTOM = 28;

function getWhiteKeyCorners(index: number): Pair[] {
  const left = 2 + index * WHITE_WIDTH;
  const right = left + WHITE_WIDTH;
  const hasLeftNotch = BLACK_KEYS_AFTER.includes(index);
  const hasRightNotch = BLACK_KEYS_AFTER.includes(index + 1);
  const topLeft = hasLeftNotch ? left + BLACK_HALF_WIDTH : left;
  const topRight = hasRightNotch ? right - BLACK_HALF_WIDTH : right;
  return [[topLeft, 2], [topRight, 2], ...(hasRightNotch ? ([[topRight, BLACK_BOTTOM], [right, BLACK_BOTTOM]] as Pair[]) : []), [right, 44], [left, 44], ...(hasLeftNotch ? ([[left, BLACK_BOTTOM], [topLeft, BLACK_BOTTOM]] as Pair[]) : [])];
}

const WHITE_KEYS = Array.from({ length: 7 }, (_, index): [string, Pair[]] => [`white key ${index + 1}`, getWhiteKeyCorners(index)]);
const BLACK_KEYS = BLACK_KEYS_AFTER.map((index): [string, Pair[]] => {
  const middle = 2 + index * WHITE_WIDTH;
  return [`black key after white ${index}`, [[middle - BLACK_HALF_WIDTH, 2], [middle + BLACK_HALF_WIDTH, 2], [middle + BLACK_HALF_WIDTH, BLACK_BOTTOM], [middle - BLACK_HALF_WIDTH, BLACK_BOTTOM]]];
});

describe('the corners of a drawing', () => {
  it.each([...WHITE_KEYS, ...BLACK_KEYS])('draws the %s with true corners', (_name, corners) => {
    expect(getLargestCornerMiss(getBodyStrokes('piano-keys'), corners)).toBeLessThan(2);
  });

  it('draws the lever load as a box and not a D', () => {
    expect(getLargestCornerMiss(getBodyStrokes('lever'), [[8, 10], [22, 10], [22, 22], [8, 22]])).toBeLessThan(2);
  });

  it('draws the lever fulcrum as a triangle and not a teardrop', () => {
    expect(getLargestCornerMiss(getBodyStrokes('lever'), [[34, 22], [26, 40], [42, 40]])).toBeLessThan(2);
  });

  it('keeps a piano key true at phone width', () => {
    const scale = PHONE_REQUEST.maxWidth / 100;
    const strokes = drawLabeledSheet({ name: 'piano-keys' }, PHONE_REQUEST)?.steps[0]?.strokes ?? [];
    const corners = getWhiteKeyCorners(0);
    const stroke = strokes.find(({ points }) => Math.hypot((points[0]?.x ?? 0) - 2 * scale, (points[0]?.y ?? 0) - 2 * scale) < 2) as InkStroke;
    expect(Math.max(...corners.map(([x, y]) => getDistanceToStroke({ x: x * scale, y: y * scale }, stroke)))).toBeLessThan(2);
  });

  it('runs no white key through a black key', () => {
    const whites = WHITE_KEYS.map(([, corners]) => getStrokeStartingAt(getBodyStrokes('piano-keys'), toBoard(corners[0] as Pair)));
    const inside = whites.flatMap((stroke) => getDrawnPoints(getStrokePath(stroke))).filter(({ x, y }) => BLACK_KEYS.some(([, corners]) => {
      const { x: left, y: top } = toBoard(corners[0] as Pair);
      const { x: right, y: bottom } = toBoard(corners[2] as Pair);
      return x > left + 2 && x < right - 2 && y > top + 2 && y < bottom - 2;
    }));
    expect(inside).toEqual([]);
  });
});

describe('a closed curve', () => {
  it.each([['globe', 0], ['atom', 0], ['animal-cell', 0]] as const)('meets itself with no nib on the %s', (name, strokeIndex) => {
    const stroke = drawLabeledSheet({ name }, LAPTOP_REQUEST)?.steps[0]?.strokes[strokeIndex] as InkStroke;
    const drawn = getDrawnPoints(getStrokePath(stroke));
    const start = drawn[0] as InkPosition;
    const end = drawn.at(-1) as InkPosition;
    const after = drawn[3] as InkPosition;
    const before = drawn.at(-4) as InkPosition;
    const turn = Math.abs(Math.atan2(after.y - start.y, after.x - start.x) - Math.atan2(end.y - before.y, end.x - before.x));
    expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeLessThan(0.01);
    expect(Math.min(turn, 2 * Math.PI - turn)).toBeLessThan(0.35);
  });
});
