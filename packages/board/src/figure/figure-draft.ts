import { formatTick, getTickValues } from '../plot/axis-ticks.ts';
import { ALL_SIDES, estimateTextWidth, LABEL_FONT, type LabelRequest, type LabelSide, placeLabels } from './place-labels.ts';
import { type Box, type Branch, type FigureMark, getArrowBranches, getDistance, getLeadingShare, type MarkTone, type Point } from './figure-marks.ts';
import type { FigureView } from './figure-view.ts';

const SOFT_BOX_SPACING = 26;
const SOFT_BOX_RADIUS = 3;
const MOST_SOFT_BOXES = 80;
const TICK = { length: 4, labelGap: 6, xSpacing: 64, ySpacing: 40, atZeroOffset: 5 };
/** A plot is read for its values, so it numbers closer than a simulation's scale does. */
export const PLOT_Y_SPACING = 24;

export interface FigureDraft {
  marks: FigureMark[];
  ticks: LabelRequest[];
  labels: LabelRequest[];
  shouldAvoid: Box[];
  mustAvoid: Box[];
  linesAhead: Branch[];
  bounds: Box;
}

export const GRID_MARK = 'grid';

export function createFigureDraft(width: number, height: number): FigureDraft {
  return { marks: [], ticks: [], labels: [], shouldAvoid: [], mustAvoid: [], linesAhead: [], bounds: { left: 0, top: 0, right: width, bottom: height } };
}

/** Text goes on top of every line, in the order that lets a tutor's words win over tick numbers they would have covered. */
export function finishFigure({ marks, ticks, labels, shouldAvoid, mustAvoid, linesAhead, bounds }: FigureDraft, onNoRoom?: (text: string) => void): FigureMark[] {
  const linesToClear = [...linesAhead, ...marks.flatMap((mark) => (mark.kind === 'path' && mark.key !== GRID_MARK ? mark.branches : []))];
  return [...marks, ...placeLabels([...labels, ...ticks], { bounds, mustAvoid, shouldAvoid, linesToClear, onNoRoom })];
}

export function addSoftLine(draft: FigureDraft, branches: readonly Branch[]): void {
  const total = branches.reduce((sum, branch) => sum + branch.length, 0);
  const every = Math.max(1, Math.ceil(total / MOST_SOFT_BOXES));
  for (const branch of branches) {
    let lastBoxed: Point | null = null;
    branch.forEach((point, index) => {
      if (index % every !== 0 || (lastBoxed && getDistance(lastBoxed, point) < SOFT_BOX_SPACING)) return;
      lastBoxed = point;
      draft.shouldAvoid.push({ left: point.x - SOFT_BOX_RADIUS, top: point.y - SOFT_BOX_RADIUS, right: point.x + SOFT_BOX_RADIUS, bottom: point.y + SOFT_BOX_RADIUS });
    });
  }
}

export function addLabel(draft: FigureDraft, label: { key: string; text: string; anchor: Point; gap?: number; sides?: readonly LabelSide[]; tone?: MarkTone }): void {
  draft.labels.push({ gap: 6, sides: ALL_SIDES, tone: 'ink', ...label });
}

function addXTicks(draft: FigureDraft, view: FigureView, axisY: number, share: number): void {
  const { rect, xRange } = view;
  const tickCount = Math.max(2, Math.floor((rect.right - rect.left) / TICK.xSpacing));
  const values = getTickValues(xRange, tickCount);
  const axisAtZero = xRange[0] <= 0 && xRange[1] >= 0 && axisY < rect.bottom;
  const marks = values.map((value) => view.toPixel({ x: value, y: 0 }).x);
  draft.marks.push({ kind: 'path', key: 'x-ticks', tone: 'ink-2', weight: 'hair', branches: share < 1 ? [] : marks.map((x) => [{ x, y: axisY }, { x, y: axisY + TICK.length }]) });
  if (share < 1) return;
  values.forEach((value, index) => {
    if (value === 0 && axisAtZero) return;
    draft.ticks.push({ key: `tick-x-${value}`, text: formatTick(value, xRange, tickCount), anchor: { x: marks[index] as number, y: axisY + TICK.length }, gap: TICK.labelGap - TICK.length, sides: ['below'], tone: 'ink-2', isOptional: true, isFixed: true });
  });
}

function addYTicks(draft: FigureDraft, view: FigureView, { axisX, share, hideTicksBelow, ySpacing }: { axisX: number; share: number; hideTicksBelow: number; ySpacing: number }): void {
  const { rect, yRange } = view;
  const tickCount = Math.max(2, Math.floor((rect.bottom - rect.top) / ySpacing));
  const values = getTickValues(yRange, tickCount).filter((value) => value >= hideTicksBelow);
  const axisAtZero = yRange[0] <= 0 && yRange[1] >= 0 && axisX > rect.left;
  const marks = values.map((value) => view.toPixel({ x: 0, y: value }).y);
  draft.marks.push({ kind: 'path', key: 'y-ticks', tone: 'ink-2', weight: 'hair', branches: share < 1 ? [] : marks.map((y) => [{ x: axisX, y }, { x: axisX - TICK.length, y }]) });
  if (share < 1) return;
  values.forEach((value, index) => {
    if (value === 0 && axisAtZero) return;
    draft.ticks.push({ key: `tick-y-${value}`, text: formatTick(value, yRange, tickCount), anchor: { x: axisX - TICK.length, y: marks[index] as number }, gap: TICK.labelGap - TICK.length, sides: ['left'], tone: 'ink-2', isOptional: true, isFixed: true });
  });
}

/** How wide the numbers on a y axis of this height will be, so a figure can leave them room. */
/** Faint lines at each tick, for reading a place on a curve. A plot's own, since other figures have no scale to read. */
export function addGrid(draft: FigureDraft, view: FigureView, share: number): void {
  const { rect, xRange, yRange } = view;
  const xValues = getTickValues(xRange, Math.max(2, Math.floor((rect.right - rect.left) / TICK.xSpacing)));
  const yValues = getTickValues(yRange, Math.max(2, Math.floor((rect.bottom - rect.top) / PLOT_Y_SPACING)));
  const across = xValues.map((value): Branch => [{ x: view.toPixel({ x: value, y: 0 }).x, y: rect.top }, { x: view.toPixel({ x: value, y: 0 }).x, y: rect.bottom }]);
  const up = yValues.map((value): Branch => [{ x: rect.left, y: view.toPixel({ x: 0, y: value }).y }, { x: rect.right, y: view.toPixel({ x: 0, y: value }).y }]);
  draft.marks.push({ kind: 'path', key: GRID_MARK, tone: 'line', weight: 'hair', branches: share < 1 ? [] : [...across, ...up] });
}

export function getWidestYTick(yRange: readonly [number, number], height: number): number {
  const tickCount = Math.max(2, Math.floor(height / PLOT_Y_SPACING));
  return Math.max(0, ...getTickValues(yRange, tickCount).map((value) => estimateTextWidth(formatTick(value, yRange, tickCount))));
}

const getAxisPlace = ([low, high]: readonly [number, number]) => (low <= 0 && high >= 0 ? 0 : low);

export function addAxes(draft: FigureDraft, view: FigureView, { share, xLabel, yLabel, hideTicksBelow = Number.NEGATIVE_INFINITY, ySpacing = TICK.ySpacing }: { share: number; xLabel?: string; yLabel?: string; hideTicksBelow?: number; ySpacing?: number }): void {
  const origin = view.toPixel({ x: getAxisPlace(view.xRange), y: getAxisPlace(view.yRange) });
  const { rect } = view;
  const xAxis: Branch = [{ x: rect.left, y: origin.y }, { x: rect.right, y: origin.y }];
  const yAxisEnd = Number.isFinite(hideTicksBelow) ? view.toPixel({ x: 0, y: hideTicksBelow }).y : rect.bottom;
  const yAxis: Branch = [{ x: origin.x, y: yAxisEnd }, { x: origin.x, y: rect.top }];
  draft.marks.push({ kind: 'path', key: 'axes', tone: 'ink-2', weight: 'hair', branches: [getLeadingShare(xAxis, share), getLeadingShare(yAxis, share)] });
  addXTicks(draft, view, origin.y, share);
  addYTicks(draft, view, { axisX: origin.x, share, hideTicksBelow, ySpacing });
  if (share < 1) return;
  if (origin.x > rect.left && origin.y < rect.bottom && view.xRange[0] <= 0 && view.yRange[0] <= 0) draft.ticks.push({ key: 'tick-origin', text: '0', anchor: { x: origin.x - TICK.atZeroOffset, y: origin.y + TICK.atZeroOffset }, gap: 0, sides: ['below-left'], tone: 'ink-2', isOptional: true, isFixed: true });
  if (xLabel) addLabel(draft, { key: 'x-label', text: xLabel, anchor: { x: rect.right, y: origin.y }, sides: ['above-left', 'below-left'], tone: 'ink-2' });
  if (yLabel) addLabel(draft, { key: 'y-label', text: yLabel, anchor: { x: origin.x, y: rect.top }, sides: ['right', 'below-right', 'left'], tone: 'ink-2' });
}

const VECTOR_LENGTH_SHARES = { short: 0.13, medium: 0.2, long: 0.28 } as const;

/** A named arrow of a fixed length, cut short only so its head stays on the figure. */
export function getFixedVectorTip(anchor: Point, { angleDegrees, length }: { angleDegrees: number; length: keyof typeof VECTOR_LENGTH_SHARES }, { width, height }: { width: number; height: number }): Point {
  const radians = (angleDegrees * Math.PI) / 180;
  const direction = { x: Math.cos(radians), y: -Math.sin(radians) };
  const reach = VECTOR_LENGTH_SHARES[length] * Math.min(width, height);
  const room = Math.min(direction.x > 0 ? (width - anchor.x) / direction.x : direction.x < 0 ? -anchor.x / direction.x : reach, direction.y > 0 ? (height - anchor.y) / direction.y : direction.y < 0 ? -anchor.y / direction.y : reach);
  const shown = Math.min(reach, Math.max(0, room - LABEL_FONT.lineHeight / 2));
  return { x: anchor.x + direction.x * shown, y: anchor.y + direction.y * shown };
}

export function addArrow(draft: FigureDraft, { key, from, to, share, tone, label }: { key: string; from: Point; to: Point; share: number; tone: MarkTone; label?: string }): void {
  const tip = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  const branches = getArrowBranches(from, tip);
  draft.marks.push({ kind: 'path', key, tone, weight: 'bold', branches });
  addSoftLine(draft, branches);
  if (label && share >= 1) {
    const isMostlySideways = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const sides: readonly LabelSide[] = isMostlySideways ? (to.x >= from.x ? ['right', 'above-right', 'below-right'] : ['left', 'above-left', 'below-left']) : to.y < from.y ? ['above', 'above-right', 'above-left'] : ['below', 'below-right', 'below-left'];
    addLabel(draft, { key: `${key}-label`, text: label, anchor: tip, sides: [...sides, ...ALL_SIDES] });
  }
}

export function addPartMark(draft: FigureDraft, { key, at, mark, share, label }: { key: string; at: Point; mark: 'underline' | 'circle' | 'check' | 'cross'; share: number; label?: string }): void {
  const size = 14;
  const shapes: Record<typeof mark, Branch[]> = {
    circle: [Array.from({ length: 33 }, (_, step) => ({ x: at.x + Math.cos((step / 32) * 2 * Math.PI - Math.PI / 2) * size, y: at.y + Math.sin((step / 32) * 2 * Math.PI - Math.PI / 2) * size }))],
    underline: [[{ x: at.x - size, y: at.y + size }, { x: at.x + size, y: at.y + size }]],
    check: [[{ x: at.x - size / 2, y: at.y }, { x: at.x - size / 8, y: at.y + size / 2 }, { x: at.x + size * 0.7, y: at.y - size / 2 }]],
    cross: [[{ x: at.x - size / 2, y: at.y - size / 2 }, { x: at.x + size / 2, y: at.y + size / 2 }], [{ x: at.x + size / 2, y: at.y - size / 2 }, { x: at.x - size / 2, y: at.y + size / 2 }]],
  };
  draft.marks.push({ kind: 'path', key, tone: 'ink', weight: 'thin', branches: shapes[mark].map((branch) => getLeadingShare(branch, share)) });
  if (label && share >= 1) addLabel(draft, { key: `${key}-label`, text: label, anchor: at, gap: size + 4 });
}
