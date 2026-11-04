import type { AxisRange } from '../plot/axis-ticks.ts';
import type { Box, Branch, Point } from './figure-marks.ts';

export interface FigureView {
  xRange: AxisRange;
  yRange: AxisRange;
  rect: Box;
  toPixel(point: Point): Point;
}

interface ViewRequest {
  xRange: AxisRange;
  yRange: AxisRange;
  rect: Box;
}

export function createStretchedView({ xRange, yRange, rect }: ViewRequest): FigureView {
  const xScale = (rect.right - rect.left) / (xRange[1] - xRange[0]);
  const yScale = (rect.bottom - rect.top) / (yRange[1] - yRange[0]);
  return { xRange, yRange, rect, toPixel: ({ x, y }) => ({ x: rect.left + (x - xRange[0]) * xScale, y: rect.bottom - (y - yRange[0]) * yScale }) };
}

const widenAroundMiddle = ([low, high]: AxisRange, width: number): AxisRange => [(low + high) / 2 - width / 2, (low + high) / 2 + width / 2];

const widenFromLow = ([low]: AxisRange, width: number): AxisRange => [low, low + width];

/** One unit is the same length both ways, so a circle is round and an angle is true. */
export function createEqualView({ xRange, yRange, rect, keepsLowEnds = false }: ViewRequest & { keepsLowEnds?: boolean }): FigureView {
  const scale = Math.min((rect.right - rect.left) / (xRange[1] - xRange[0]), (rect.bottom - rect.top) / (yRange[1] - yRange[0]));
  const widen = keepsLowEnds ? widenFromLow : widenAroundMiddle;
  return createStretchedView({ xRange: widen(xRange, (rect.right - rect.left) / scale), yRange: widen(yRange, (rect.bottom - rect.top) / scale), rect });
}

const pixelBranchesByCurve = new WeakMap<readonly Branch[], { key: string; branches: readonly Branch[] }>();

/** Keeps the same arrays while the view stands still, so a resting curve costs no work and no writes. */
export function getPixelBranches(branches: readonly Branch[], view: FigureView): readonly Branch[] {
  const key = `${view.xRange.join()}|${view.yRange.join()}|${view.rect.left}|${view.rect.top}|${view.rect.right}|${view.rect.bottom}`;
  const known = pixelBranchesByCurve.get(branches);
  if (known?.key === key) return known.branches;
  const converted = branches.map((branch) => branch.map(view.toPixel));
  pixelBranchesByCurve.set(branches, { key, branches: converted });
  return converted;
}
