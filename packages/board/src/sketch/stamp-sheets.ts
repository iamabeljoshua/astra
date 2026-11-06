import { closeCurve, makeCornered, makeDot, makeEllipse, makeLine, part, type DrawingSheet, type Pair } from '../diagram/drawing-sheets.ts';
import type { InkPosition } from '../ink/ink-stroke.ts';

export const STAMP_NAMES = ['person', 'car', 'table', 'ramp', 'hill', 'house', 'tree', 'sun'] as const;

export type StampName = (typeof STAMP_NAMES)[number];

export interface StampSheet extends DrawingSheet {
  base: { x: number; y: number };
  surface: readonly { x: number; y: number }[];
}

const QUARTER_TURN = Math.PI / 2;
const CROWN = { x: 50, y: 46, radius: 38, puff: 6, bumps: 8, trunkHalfWidth: 7, stepsPerBump: 8 };
const HILL = { left: 2, right: 98, foot: 36, peak: 4, roundness: 0.15, steps: 32 };

const toPairs = (points: readonly InkPosition[]) => points.map(({ x, y }): Pair => [x, y]);

const makeArc = (x: number, y: number, radius: number, from: number, to: number) => toPairs(makeEllipse({ x, y, width: radius, from, to, steps: 8 }));

function makeCapsule([fromX, fromY]: Pair, [toX, toY]: Pair, width: number): InkPosition[] {
  const heading = Math.atan2(toY - fromY, toX - fromX);
  const ends = [
    ...makeEllipse({ x: toX, y: toY, width: width / 2, from: heading - QUARTER_TURN, to: heading + QUARTER_TURN, steps: 10 }),
    ...makeEllipse({ x: fromX, y: fromY, width: width / 2, from: heading + QUARTER_TURN, to: heading + 3 * QUARTER_TURN, steps: 10 }),
  ];
  return closeCurve([...ends, ends[0] as InkPosition]);
}

function makeStamp({ height, strokes, parts }: DrawingSheet, { base, surface }: Partial<Pick<StampSheet, 'base' | 'surface'>> = {}): StampSheet {
  const points = strokes.flat();
  const left = Math.min(...points.map(({ x }) => x));
  const right = Math.max(...points.map(({ x }) => x));
  const top = Math.min(...points.map(({ y }) => y));
  const bottom = Math.max(...points.map(({ y }) => y));
  return { height, strokes, parts, base: base ?? { x: (left + right) / 2, y: bottom }, surface: surface ?? [{ x: left, y: top }, { x: right, y: top }] };
}

function drawPerson(): StampSheet {
  return makeStamp({
    height: 218,
    strokes: [
      makeEllipse({ x: 50, y: 19, width: 15 }),
      makeCornered([34, 118], ...makeArc(40, 49, 9, Math.PI, 3 * QUARTER_TURN), ...makeArc(60, 49, 9, 3 * QUARTER_TURN, 4 * QUARTER_TURN), [66, 118], [34, 118]),
      makeCapsule([23, 53], [17, 110], 11),
      makeCapsule([77, 53], [83, 110], 11),
      makeCapsule([41.5, 128], [39, 208], 15),
      makeCapsule([58.5, 128], [61, 208], 15),
    ],
    parts: { head: part(50, 19, 8), hand: part(17, 110, 5), foot: part(39, 208, 6) },
  });
}

function drawCar(): StampSheet {
  return makeStamp({
    height: 52,
    strokes: [
      makeCornered([6, 40], [3, 37], [3, 27], [6, 24], [24, 23], [36, 7], [60, 7], [75, 22], [93, 25], [97, 29], [97, 37], [94, 40], ...makeArc(76, 40, 13, 0, -Math.PI), ...makeArc(24, 40, 13, 0, -Math.PI), [6, 40]),
      makeCornered([29.5, 21], [37.5, 10], [47, 10], [47, 21], [29.5, 21]),
      makeCornered([51, 21], [51, 10], [59, 10], [69.5, 21], [51, 21]),
      makeEllipse({ x: 24, y: 40, width: 10 }),
      makeDot(24, 40, 3),
      makeEllipse({ x: 76, y: 40, width: 10 }),
      makeDot(76, 40, 3),
    ],
    parts: { body: part(50, 32, 5), 'front-wheel': part(76, 40, 10), 'back-wheel': part(24, 40, 10) },
  });
}

function drawTable(): StampSheet {
  return makeStamp({
    height: 56,
    strokes: [makeCornered([3, 4], [97, 4], [97, 11], [3, 11], [3, 4]), makeCornered([10, 11], [10, 54], [16, 54], [16, 11]), makeCornered([84, 11], [84, 54], [90, 54], [90, 11])],
    parts: { top: part(50, 7.5, 3), leg: part(13, 34, 4) },
  });
}

function drawRamp(): StampSheet {
  return makeStamp(
    { height: 52, strokes: [makeCornered([2, 50], [98, 50], [98, 4], [2, 50]), makeCornered([91, 50], [91, 43], [98, 43])], parts: { slope: part(50, 27, 4), top: part(95, 7, 3) } },
    { surface: [{ x: 2, y: 50 }, { x: 98, y: 4 }] },
  );
}

function drawHill(): StampSheet {
  const { left, right, foot, peak, roundness, steps } = HILL;
  const hump = Array.from({ length: steps + 1 }, (_, step): Pair => {
    const along = Math.sin((Math.PI * step) / steps);
    return [left + ((right - left) * step) / steps, foot - (foot - peak) * ((1 - roundness) * along + roundness * along ** 2)];
  });
  return makeStamp({ height: 38, strokes: [makeCornered(...hump, [left, foot])], parts: { top: part(50, 7, 3), slope: part(78, 18, 3) } }, { surface: hump.map(([x, y]) => ({ x, y })) });
}

function drawHouse(): StampSheet {
  return makeStamp({
    height: 90,
    strokes: [
      makeCornered([12, 42], [12, 88], [88, 88], [88, 42]),
      makeCornered([4, 42], [50, 5], [96, 42], [4, 42]),
      makeCornered([24, 88], [24, 62], [40, 62], [40, 88]),
      makeDot(36, 76, 1),
      makeCornered([58, 54], [76, 54], [76, 72], [58, 72], [58, 54]),
      makeLine([67, 54], [67, 72]),
      makeLine([58, 63], [76, 63]),
    ],
    parts: { roof: part(50, 26, 5), door: part(32, 75, 5), wall: part(49, 78, 4) },
  });
}

function drawTree(): StampSheet {
  const { x, y, radius, puff, bumps, trunkHalfWidth, stepsPerBump } = CROWN;
  const gap = Math.asin(trunkHalfWidth / radius);
  const steps = bumps * stepsPerBump;
  const crown = Array.from({ length: steps + 1 }, (_, step): Pair => {
    const angle = QUARTER_TURN + gap + ((4 * QUARTER_TURN - 2 * gap) * step) / steps;
    const reach = radius + puff * Math.sin((Math.PI * (step % stepsPerBump)) / stepsPerBump);
    return [x + reach * Math.cos(angle), y + reach * Math.sin(angle)];
  });
  const trunkTop = y + radius * Math.cos(gap);
  return makeStamp({
    height: 132,
    strokes: [
      makeCornered(...crown),
      makeCornered([x - trunkHalfWidth, trunkTop], [x - trunkHalfWidth - 1, 123], [x - trunkHalfWidth - 6, 130], [x + trunkHalfWidth + 6, 130], [x + trunkHalfWidth + 1, 123], [x + trunkHalfWidth, trunkTop]),
      makeLine([x - 3, trunkTop], [x - 5, 72], [x - 14, 62]),
      makeLine([x + 1, 74], [x + 12, 64]),
    ],
    parts: { top: part(50, 40, 8), trunk: part(50, 108, 4) },
  });
}

function drawSun(): StampSheet {
  const rays = Array.from({ length: 8 }, (_, index) => {
    const angle = -QUARTER_TURN + (index * Math.PI) / 4;
    return makeLine([50 + 30 * Math.cos(angle), 50 + 30 * Math.sin(angle)], [50 + 44 * Math.cos(angle), 50 + 44 * Math.sin(angle)]);
  });
  return makeStamp({ height: 100, strokes: [makeEllipse({ x: 50, y: 50, width: 22 }), ...rays], parts: { sun: part(50, 50, 10) } }, { base: { x: 50, y: 50 } });
}

export const STAMP_SHEETS: Readonly<Record<StampName, StampSheet>> = {
  person: drawPerson(),
  car: drawCar(),
  table: drawTable(),
  ramp: drawRamp(),
  hill: drawHill(),
  house: drawHouse(),
  tree: drawTree(),
  sun: drawSun(),
};
