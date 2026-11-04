import type { Branch, Point } from '../figure/figure-marks.ts';
import type { AxisRange } from './axis-ticks.ts';

export const CURVE_LIMITS = { baseIntervals: 240, evaluations: 4000, passes: 26 };

const STEP_SHARE_OF_VIEW = 1 / 120;

export interface CurveRequest {
  evaluate(x: number): number;
  domain: AxisRange;
  yRange: AxisRange;
}

const isAbove = (point: Point, yRange: AxisRange) => point.y > yRange[1];
const isBelow = (point: Point, yRange: AxisRange) => point.y < yRange[0];

function isWholeStepOutside(first: Point, second: Point, yRange: AxisRange): boolean {
  return (isAbove(first, yRange) && isAbove(second, yRange)) || (isBelow(first, yRange) && isBelow(second, yRange));
}

function needsDetail(first: Point, second: Point, { yRange }: CurveRequest): boolean {
  const isFirstReal = Number.isFinite(first.y);
  if (isFirstReal !== Number.isFinite(second.y)) return true;
  if (!isFirstReal || isWholeStepOutside(first, second, yRange)) return false;
  return Math.abs(second.y - first.y) > (yRange[1] - yRange[0]) * STEP_SHARE_OF_VIEW;
}

function getBaseSamples({ evaluate, domain: [low, high] }: CurveRequest): Point[] {
  return Array.from({ length: CURVE_LIMITS.baseIntervals + 1 }, (_, index) => {
    const x = low + ((high - low) * index) / CURVE_LIMITS.baseIntervals;
    return { x, y: evaluate(x) };
  });
}

function addDetail(samples: readonly Point[], request: CurveRequest): Point[] {
  const refined: Point[] = [samples[0] as Point];
  for (let index = 1; index < samples.length; index += 1) {
    const first = samples[index - 1] as Point;
    const second = samples[index] as Point;
    if (needsDetail(first, second, request)) {
      const x = (first.x + second.x) / 2;
      refined.push({ x, y: request.evaluate(x) });
    }
    refined.push(second);
  }
  return refined;
}

function countDetailWanted(samples: readonly Point[], request: CurveRequest): number {
  let wanted = 0;
  for (let index = 1; index < samples.length; index += 1) if (needsDetail(samples[index - 1] as Point, samples[index] as Point, request)) wanted += 1;
  return wanted;
}

// Doubles the samples only where the curve steps too far.
function getRefinedSamples(request: CurveRequest): Point[] {
  let samples = getBaseSamples(request);
  for (let pass = 0; pass < CURVE_LIMITS.passes; pass += 1) {
    const wanted = countDetailWanted(samples, request);
    if (wanted === 0 || samples.length + wanted > CURVE_LIMITS.evaluations) break;
    samples = addDetail(samples, request);
  }
  return samples;
}

function clipToView(first: Point, second: Point, [low, high]: AxisRange): [Point, Point] {
  const getInside = (point: Point, other: Point): Point => {
    const edge = point.y > high ? high : point.y < low ? low : null;
    return edge === null ? point : { x: point.x + ((other.x - point.x) * (edge - point.y)) / (other.y - point.y), y: edge };
  };
  return [getInside(first, second), getInside(second, first)];
}

/** A step that stays too tall after every refinement is left as a gap. */
export function sampleCurve(request: CurveRequest): Branch[] {
  const samples = getRefinedSamples(request);
  const branches: Point[][] = [];
  let current: Point[] = [];
  const closeBranch = () => {
    if (current.length > 1) branches.push(current);
    current = [];
  };
  for (let index = 1; index < samples.length; index += 1) {
    const first = samples[index - 1] as Point;
    const second = samples[index] as Point;
    if (!Number.isFinite(first.y) || !Number.isFinite(second.y) || isWholeStepOutside(first, second, request.yRange) || needsDetail(first, second, request)) {
      closeBranch();
      continue;
    }
    const [start, end] = clipToView(first, second, request.yRange);
    if (current.length === 0) current.push(start);
    current.push(end);
    if (end !== second) closeBranch();
  }
  closeBranch();
  return branches;
}

export function getBranchesUpTo(branches: readonly Branch[], x: number): Branch[] {
  return branches.flatMap((branch): Branch[] => {
    const first = branch[0] as Point;
    if (first.x >= x) return [];
    const endIndex = branch.findIndex((point) => point.x > x);
    if (endIndex === -1) return [branch];
    const before = branch[endIndex - 1] as Point;
    const after = branch[endIndex] as Point;
    const share = (x - before.x) / (after.x - before.x);
    return [[...branch.slice(0, endIndex), { x, y: before.y + (after.y - before.y) * share }]];
  });
}
