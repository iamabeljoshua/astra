import type { Branch, Point } from '../figure/figure-marks.ts';
import type { AxisRange } from './axis-ticks.ts';

export const CURVE_LIMITS = { baseIntervals: 240, evaluations: 4000, passes: 26 };

/** A corner this sharp leaves a smooth curve under a pixel off on a figure 500 px tall, once its steps are halved. */
const BEND_SHARE_OF_VIEW = 1 / 200;
/** A step this tall gets looked inside even if it looks straight, because two samples can straddle a pole by chance. */
const TALL_SHARE_OF_VIEW = 1 / 8;
/** The taller half of a halved step keeps this share of its height or more if halving did not shrink it. */
const STUCK_SHARE = 0.9;
/** On a base step of about 3 px, this many halvings reach a hundredth of a pixel. */
const HALVINGS_TO_PROVE_A_BREAK = 8;
/** The budget always covers this many halvings of every step, so a tall step still stuck after them is hardly a wave seen too coarsely. */
const HALVINGS_TO_SUSPECT_A_BREAK = 4;
/** A step stuck this long is probably a break, so a corner beside it is not a reason to spend samples there. */
const HALVINGS_TO_STOP_SMOOTHING = 2;
const GOLDEN_RATIO = 0.618033988749895;
const BASE_UNEVENNESS = 0.25;

export interface CurveRequest {
  evaluate(x: number): number;
  domain: AxisRange;
  yRange: AxisRange;
}

/** `stuckHalvings` counts how many halvings in a row left the step ending here as tall as it was. */
type Sample = Point & { stuckHalvings: number };

const isAbove = (point: Point, yRange: AxisRange) => point.y > yRange[1];
const isBelow = (point: Point, yRange: AxisRange) => point.y < yRange[0];
const getViewHeight = ([low, high]: AxisRange) => high - low;
const getHeight = (first: Point, second: Point) => Math.abs(second.y - first.y);
const isReal = (point: Point) => Number.isFinite(point.y);

function isWholeStepOutside(first: Point, second: Point, yRange: AxisRange): boolean {
  return (isAbove(first, yRange) && isAbove(second, yRange)) || (isBelow(first, yRange) && isBelow(second, yRange));
}

const isTall = (first: Point, second: Point, yRange: AxisRange) => getHeight(first, second) > getViewHeight(yRange) * TALL_SHARE_OF_VIEW;

const leavesView = (first: Point, second: Point, yRange: AxisRange) => isAbove(first, yRange) || isBelow(first, yRange) || isAbove(second, yRange) || isBelow(second, yRange);

// A continuous curve shrinks when halved and a jump or a pole does not, so this is the only thing that leaves a gap between two real values. If the budget ran out first, a step that is still tall and did not shrink stays a gap.
function isBreak(first: Sample, second: Sample, yRange: AxisRange): boolean {
  if (second.stuckHalvings >= HALVINGS_TO_PROVE_A_BREAK) return true;
  if (!isTall(first, second, yRange)) return false;
  return second.stuckHalvings >= (leavesView(first, second, yRange) ? 1 : HALVINGS_TO_SUSPECT_A_BREAK);
}

function isOnTheLine(first: Sample, second: Sample, yRange: AxisRange): boolean {
  return isReal(first) && isReal(second) && !isWholeStepOutside(first, second, yRange) && second.stuckHalvings < HALVINGS_TO_PROVE_A_BREAK;
}

function getBend(before: Point, at: Point, after: Point): number {
  const straightY = before.y + ((after.y - before.y) * (at.x - before.x)) / (after.x - before.x);
  return Math.abs(at.y - straightY);
}

function needsLookInside(first: Sample, second: Sample, yRange: AxisRange): boolean {
  if (isReal(first) !== isReal(second)) return !isWholeStepOutside(first, second, yRange);
  return isOnTheLine(first, second, yRange) && (isTall(first, second, yRange) || second.stuckHalvings > 0);
}

/** Marks each step by the index of its end: where it is too tall to trust, or where the line bends enough to see the corner. */
function getStepsToHalve(samples: readonly Sample[], { yRange }: CurveRequest): Set<number> {
  const steps = new Set<number>();
  const bendLimit = getViewHeight(yRange) * BEND_SHARE_OF_VIEW;
  const isSmoothStep = (index: number) => isOnTheLine(samples[index - 1] as Sample, samples[index] as Sample, yRange) && (samples[index] as Sample).stuckHalvings < HALVINGS_TO_STOP_SMOOTHING;
  for (let index = 1; index < samples.length; index += 1) {
    if (needsLookInside(samples[index - 1] as Sample, samples[index] as Sample, yRange)) steps.add(index);
    if (index + 1 === samples.length || !isSmoothStep(index) || !isSmoothStep(index + 1)) continue;
    if (getBend(samples[index - 1] as Sample, samples[index] as Sample, samples[index + 1] as Sample) <= bendLimit) continue;
    steps.add(index);
    steps.add(index + 1);
  }
  return steps;
}

// Uneven on purpose, because an even grid can meet a fast wave at the same phase every time and draw it slow or flat.
function getBasePlace(index: number): number {
  if (index === 0 || index === CURVE_LIMITS.baseIntervals) return index / CURVE_LIMITS.baseIntervals;
  return (index + ((index * GOLDEN_RATIO) % 1 - 1 / 2) * BASE_UNEVENNESS) / CURVE_LIMITS.baseIntervals;
}

function getBaseSamples({ evaluate, domain: [low, high] }: CurveRequest): Sample[] {
  return Array.from({ length: CURVE_LIMITS.baseIntervals + 1 }, (_, index) => {
    const x = low + (high - low) * getBasePlace(index);
    return { x, y: evaluate(x), stuckHalvings: 0 };
  });
}

function halve(first: Sample, second: Sample, { evaluate, yRange }: CurveRequest): [Sample, Sample] {
  const x = (first.x + second.x) / 2;
  const y = evaluate(x);
  const whole = getHeight(first, second);
  const bendLimit = getViewHeight(yRange) * BEND_SHARE_OF_VIEW;
  const before = Math.abs(y - first.y);
  const after = Math.abs(second.y - y);
  const stuck = whole > bendLimit && Math.max(before, after) >= whole * STUCK_SHARE ? second.stuckHalvings + 1 : 0;
  return [{ x, y, stuckHalvings: before >= after ? stuck : 0 }, { ...second, stuckHalvings: after > before ? stuck : 0 }];
}

function addDetail(samples: readonly Sample[], steps: ReadonlySet<number>, request: CurveRequest): Sample[] {
  const refined: Sample[] = [samples[0] as Sample];
  for (let index = 1; index < samples.length; index += 1) {
    if (steps.has(index)) refined.push(...halve(samples[index - 1] as Sample, samples[index] as Sample, request));
    else refined.push(samples[index] as Sample);
  }
  return refined;
}

function getRefinedSamples(request: CurveRequest): Sample[] {
  let samples = getBaseSamples(request);
  for (let pass = 0; pass < CURVE_LIMITS.passes; pass += 1) {
    const steps = getStepsToHalve(samples, request);
    if (steps.size === 0 || samples.length + steps.size > CURVE_LIMITS.evaluations) break;
    samples = addDetail(samples, steps, request);
  }
  return samples;
}

function clipToView(first: Point, second: Point, [low, high]: AxisRange): [Point, Point] {
  const getInside = (point: Point, other: Point): Point => {
    const edge = point.y > high ? high : point.y < low ? low : null;
    return edge === null ? { x: point.x, y: point.y } : { x: point.x + (other.x - point.x) * ((edge - point.y) / (other.y - point.y)), y: edge };
  };
  return [getInside(first, second), getInside(second, first)];
}

/** A line stops only where halving a step could not shrink it, or where it leaves the view or has no value. */
export function sampleCurve(request: CurveRequest): Branch[] {
  const { yRange } = request;
  const samples = getRefinedSamples(request);
  const branches: Point[][] = [];
  let current: Point[] = [];
  const closeBranch = () => {
    if (current.length > 1) branches.push(current);
    current = [];
  };
  for (let index = 1; index < samples.length; index += 1) {
    const first = samples[index - 1] as Sample;
    const second = samples[index] as Sample;
    if (!isOnTheLine(first, second, yRange) || isBreak(first, second, yRange)) {
      closeBranch();
      continue;
    }
    const [start, end] = clipToView(first, second, yRange);
    if (current.length === 0) current.push(start);
    current.push(end);
    if (isAbove(second, yRange) || isBelow(second, yRange)) closeBranch();
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
