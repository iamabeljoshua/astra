import type { Branch, Point } from '../figure/figure-marks.ts';
import type { AxisRange } from './axis-ticks.ts';

export const CURVE_LIMITS = { baseIntervals: 240, evaluations: 4000, passes: 26 };

/** A corner this sharp leaves a smooth curve under a pixel off on a figure 500 px tall, once its steps are halved. */
const BEND_SHARE_OF_VIEW = 1 / 200;
/** A step this tall gets looked inside even if it looks straight, because two samples can straddle a pole by chance. */
const TALL_SHARE_OF_VIEW = 1 / 8;
const TALLER_HALF_STUCK_SHARE = 0.9;
const HALVINGS_TO_PROVE_A_BREAK = 8;
/** The budget always covers this many halvings of every step, so a tall step still stuck after them is hardly a wave seen too coarsely. */
const HALVINGS_TO_SUSPECT_A_BREAK = Math.floor(Math.log2(CURVE_LIMITS.evaluations / CURVE_LIMITS.baseIntervals));
const HALVINGS_TO_SUSPECT_A_POLE = 1;
/** A step stuck this long is probably a break, so a corner beside it is not a reason to spend samples there. */
const HALVINGS_TO_STOP_SMOOTHING = 2;
const GOLDEN_RATIO = 0.618033988749895;
const BASE_UNEVENNESS = 0.25;
/** Past the budget a line may not cross a height this tall that no sample nearby reached, because a wave passes through its heights and a jump or a pole does not. */
const UNSEEN_SHARE_OF_VIEW = 1 / 32;
/** Enough samples that a wave's heights all show, at any speed past the budget, and few enough to stay near the step. */
const SAMPLES_SEEN_TOGETHER = 1024;
/** The tallest steps near a step, and how many of them must have shrunk when halved for those steps to be a wave. A jump found late never shrank. */
const TALLEST_STEPS_SHARE = 1 / 2;
const WAVE_SHRUNK_SHARE = 1 / 32;
/** Up and down steps both this tall mean about 6 samples or fewer for each wave, so this is a band and no longer a wave. */
const ZIGZAG_SHARE_OF_VIEW = 1 / 4;
/** A few zigzags are a grid meeting a wave at an unlucky phase. This many are the whole curve. */
const ZIGZAGS_IN_A_BAND_SHARE = 1 / 64;

export interface CurveRequest {
  evaluate(x: number): number;
  domain: AxisRange;
  yRange: AxisRange;
}

/** `isTooFine` says the budget ran out with heights left unproven, so `branches` holds only what was proven and the figure must say so. */
export interface CurveDrawing {
  branches: Branch[];
  isTooFine: boolean;
}

/** A continuous curve shrinks when halved and a jump or a pole does not, so `stuckHalvings` counts how many halvings in a row left the step ending here as tall as it was, and `didShrink` says its last halving made it shorter, which a jump found late never shows. */
type Sample = Point & { stuckHalvings: number; didShrink: boolean };

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

// A tall step still stuck when the budget ran out stays a gap, because a line through a pole is worse than a hole in a curve too fine to see.
function isLeftUnsure(first: Sample, second: Sample, yRange: AxisRange): boolean {
  return isTall(first, second, yRange) && second.stuckHalvings >= (leavesView(first, second, yRange) ? HALVINGS_TO_SUSPECT_A_POLE : HALVINGS_TO_SUSPECT_A_BREAK);
}

type Height = readonly [low: number, high: number];

interface NearbySamples {
  unseen: readonly Height[];
  tallestStep: number;
  isWave: boolean;
}

function getUnseenHeights(samples: readonly Sample[], [viewLow, viewHigh]: AxisRange): Height[] {
  const heights = samples.filter(isReal).map(({ y }) => Math.min(viewHigh, Math.max(viewLow, y))).sort((first, second) => first - second);
  const tallestUnseen = (viewHigh - viewLow) * UNSEEN_SHARE_OF_VIEW;
  return heights.flatMap((height, index): Height[] => (index > 0 && height - (heights[index - 1] as number) > tallestUnseen ? [[heights[index - 1] as number, height]] : []));
}

const getHeightInView = (first: Point, second: Point, [low, high]: AxisRange) => Math.abs(Math.min(high, Math.max(low, second.y)) - Math.min(high, Math.max(low, first.y)));

function getNearbySamples(samples: readonly Sample[], yRange: AxisRange): NearbySamples {
  const steps = samples.slice(1).map((second, index) => ({ second, height: isOnTheLine(samples[index] as Sample, second, yRange) ? getHeightInView(samples[index] as Sample, second, yRange) : 0 }));
  const tallestStep = Math.max(0, ...steps.map(({ height }) => height));
  const tallest = steps.filter(({ height }) => height > tallestStep * TALLEST_STEPS_SHARE);
  const shrunk = tallest.filter(({ second }) => second.didShrink).length;
  return { unseen: getUnseenHeights(samples, yRange), tallestStep, isWave: shrunk >= tallest.length * WAVE_SHRUNK_SHARE };
}

function isUnproven(first: Sample, second: Sample, { unseen, tallestStep, isWave }: NearbySamples, yRange: AxisRange): boolean {
  const [low, high] = [Math.min(first.y, second.y), Math.max(first.y, second.y)];
  if (unseen.some(([from, to]) => low <= from && high >= to)) return true;
  return !isWave && !second.didShrink && getHeightInView(first, second, yRange) > tallestStep * TALLEST_STEPS_SHARE;
}

function isZigzag(before: Sample, at: Sample, after: Sample, yRange: AxisRange): boolean {
  const tall = getViewHeight(yRange) * ZIGZAG_SHARE_OF_VIEW;
  const [up, next] = [at.y - before.y, after.y - at.y];
  return up * next < 0 && Math.abs(up) > tall && Math.abs(next) > tall;
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

function getStepEndsToHalve(samples: readonly Sample[], { yRange }: CurveRequest): Set<number> {
  const steps = new Set<number>();
  const bendLimit = getViewHeight(yRange) * BEND_SHARE_OF_VIEW;
  const isSmoothStep = (index: number) => isOnTheLine(samples[index - 1] as Sample, samples[index] as Sample, yRange) && (samples[index] as Sample).stuckHalvings < HALVINGS_TO_STOP_SMOOTHING;
  for (let index = 1; index < samples.length; index += 1) {
    if (needsLookInside(samples[index - 1] as Sample, samples[index] as Sample, yRange)) steps.add(index);
    if (index + 1 === samples.length || !isSmoothStep(index) || !isSmoothStep(index + 1)) continue;
    if (getBend(samples[index - 1] as Sample, samples[index] as Sample, samples[index + 1] as Sample) > bendLimit) {
      steps.add(index);
      steps.add(index + 1);
    }
  }
  return steps;
}

// Uneven on purpose, because an even grid can meet a fast wave at the same phase every time and draw it slow or flat.
function getUnevenBasePlace(index: number): number {
  if (index === 0 || index === CURVE_LIMITS.baseIntervals) return index / CURVE_LIMITS.baseIntervals;
  return (index + ((index * GOLDEN_RATIO) % 1 - 1 / 2) * BASE_UNEVENNESS) / CURVE_LIMITS.baseIntervals;
}

function getBaseSamples({ evaluate, domain: [low, high] }: CurveRequest): Sample[] {
  return Array.from({ length: CURVE_LIMITS.baseIntervals + 1 }, (_, index) => {
    const x = low + (high - low) * getUnevenBasePlace(index);
    return { x, y: evaluate(x), stuckHalvings: 0, didShrink: false };
  });
}

function halve(first: Sample, second: Sample, { evaluate, yRange }: CurveRequest): [Sample, Sample] {
  const x = (first.x + second.x) / 2;
  const y = evaluate(x);
  const whole = getHeight(first, second);
  const bendLimit = getViewHeight(yRange) * BEND_SHARE_OF_VIEW;
  const before = Math.abs(y - first.y);
  const after = Math.abs(second.y - y);
  const stuck = whole > bendLimit && Math.max(before, after) >= whole * TALLER_HALF_STUCK_SHARE ? second.stuckHalvings + 1 : 0;
  const stillTall = whole * TALLER_HALF_STUCK_SHARE;
  return [{ x, y, stuckHalvings: before >= after ? stuck : 0, didShrink: before < stillTall }, { ...second, stuckHalvings: after > before ? stuck : 0, didShrink: after < stillTall }];
}

function addDetail(samples: readonly Sample[], steps: ReadonlySet<number>, request: CurveRequest): Sample[] {
  const refined: Sample[] = [samples[0] as Sample];
  for (let index = 1; index < samples.length; index += 1) {
    if (steps.has(index)) refined.push(...halve(samples[index - 1] as Sample, samples[index] as Sample, request));
    else refined.push(samples[index] as Sample);
  }
  return refined;
}

// What is left of the budget goes evenly across the curve, because a band only gets more honest with more samples anywhere in it.
function getEvenShare(steps: ReadonlySet<number>, room: number): Set<number> {
  const every = [...steps];
  return new Set(Array.from({ length: room }, (_, index) => every[Math.floor((index * every.length) / room)] as number));
}

function getRefinedSamples(request: CurveRequest): { samples: Sample[]; isUnfinished: boolean } {
  let samples = getBaseSamples(request);
  for (let pass = 0; pass < CURVE_LIMITS.passes; pass += 1) {
    const steps = getStepEndsToHalve(samples, request);
    if (steps.size === 0) break;
    const room = CURVE_LIMITS.evaluations - samples.length;
    if (steps.size > room) return { samples: addDetail(samples, getEvenShare(steps, room), request), isUnfinished: true };
    samples = addDetail(samples, steps, request);
  }
  return { samples, isUnfinished: false };
}

function clipToView(first: Point, second: Point, [low, high]: AxisRange): [Point, Point] {
  const getInside = (point: Point, other: Point): Point => {
    const edge = point.y > high ? high : point.y < low ? low : null;
    return edge === null ? { x: point.x, y: point.y } : { x: point.x + (other.x - point.x) * ((edge - point.y) / (other.y - point.y)), y: edge };
  };
  return [getInside(first, second), getInside(second, first)];
}

/** A line stops only where halving a step could not shrink it, or where it leaves the view or has no value. Past the budget it also stops where nothing proves it, and the drawing says so. */
export function sampleCurve(request: CurveRequest): CurveDrawing {
  const { yRange } = request;
  const { samples, isUnfinished } = getRefinedSamples(request);
  const branches: Point[][] = [];
  let current: Point[] = [];
  let nearby: NearbySamples = { unseen: [], tallestStep: 0, isWave: true };
  let isTooFine = false;
  let zigzags = 0;
  const closeBranch = () => {
    if (current.length > 1) branches.push(current);
    current = [];
  };
  for (let index = 1; index < samples.length; index += 1) {
    const first = samples[index - 1] as Sample;
    const second = samples[index] as Sample;
    if (isUnfinished && (index - 1) % SAMPLES_SEEN_TOGETHER === 0) nearby = getNearbySamples(samples.slice(index - 1, index + SAMPLES_SEEN_TOGETHER), yRange);
    if (!isOnTheLine(first, second, yRange)) {
      closeBranch();
      continue;
    }
    if (isLeftUnsure(first, second, yRange) || (isUnfinished && isUnproven(first, second, nearby, yRange))) {
      if (second.stuckHalvings < HALVINGS_TO_SUSPECT_A_BREAK) isTooFine = true;
      closeBranch();
      continue;
    }
    if (isUnfinished && index + 1 < samples.length && isZigzag(first, second, samples[index + 1] as Sample, yRange)) zigzags += 1;
    const [start, end] = clipToView(first, second, yRange);
    if (current.length === 0) current.push(start);
    current.push(end);
    if (isAbove(second, yRange) || isBelow(second, yRange)) closeBranch();
  }
  closeBranch();
  return { branches, isTooFine: isTooFine || zigzags > samples.length * ZIGZAGS_IN_A_BAND_SHARE };
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
