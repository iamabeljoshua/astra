import type { MarkValue, Plot, ShadeArea } from '@astra/contracts';
import { FIGURE_LIMITS, type FigureFrame, getAttachedElements, getDrawnShare, getPartMark, getShownValue, keepNewestOnFigure } from '../figure/figure-input.ts';
import { addArrow, addAxes, addLabel, addPartMark, addSoftLine, createFigureDraft, type FigureDraft, finishFigure, getFixedVectorTip, getWidestYTick } from '../figure/figure-draft.ts';
import { type Branch, type FigureMark, interpolate, type Point } from '../figure/figure-marks.ts';
import { createStretchedView, type FigureView, getPixelBranches } from '../figure/figure-view.ts';
import type { BoardElement } from '../player/board-state.ts';
import { getReshapedValues } from '../player/board-state.ts';
import { PLANNED_SCENES } from '../player/planned-scenes.ts';
import { formatNumber } from './axis-ticks.ts';
import type { PlotFrame } from './plot-scene.ts';
import { type CurveDrawing, getBranchesUpTo } from './sample-curve.ts';

const PLOT_MARGIN = { left: 42, right: 14, top: 14, bottom: 26 };
const AXES_SHARE_OF_ENTRANCE = 1 / 3;
const MARK_DOT_RADIUS = 4;
const WIDEST_LEFT_MARGIN_SHARE = 0.3;
const TICK_ROOM = 8;
const TOO_FINE_KEY = 'too-fine';

type PlotElement = BoardElement & { content: Plot };

function getPlotFrame(element: PlotElement, frame: Pick<FigureFrame, 'atMs' | 'isReducedMotion'>): PlotFrame | null {
  const placed = element.placedScene;
  if (!placed) return null;
  const isReshaping = placed.reshapingFrom !== null && !frame.isReducedMotion && getDrawnShare(element, frame) < 1;
  const scene = isReshaping ? (PLANNED_SCENES(element.content, getReshapedValues(element, frame.atMs)) ?? placed.scene) : placed.scene;
  return scene.getFrame(0) as PlotFrame;
}

function getAxesShare(element: BoardElement, frame: FigureFrame): number {
  if (element.placedScene?.reshapingFrom) return 1;
  return Math.min(1, getDrawnShare(element, frame) / AXES_SHARE_OF_ENTRANCE);
}

function getDrawnUpToX(element: PlotElement, frame: FigureFrame): number {
  const { domain } = element.content;
  if (element.revealedUpTo) return getShownValue(element.revealedUpTo, frame);
  if (element.placedScene?.reshapingFrom) return domain[1];
  const curveShare = Math.max(0, (getDrawnShare(element, frame) - AXES_SHARE_OF_ENTRANCE) / (1 - AXES_SHARE_OF_ENTRANCE));
  return domain[0] + (domain[1] - domain[0]) * curveShare;
}

function getCurveDrawing(element: PlotElement, frame: FigureFrame, { xRange, yRange }: FigureView): CurveDrawing {
  return getPlotFrame(element, frame)?.getCurve(yRange, xRange) ?? { branches: [], isTooFine: false };
}

const getCurvePoints = (element: PlotElement, frame: FigureFrame, view: FigureView) => getCurveDrawing(element, frame, view).branches;

// Sits in the margin above the axes and is placed first, so a solid band cannot cover it and no later label lands on it.
function addTooFineNote(draft: FigureDraft, element: PlotElement, { frame, view }: { frame: FigureFrame; view: FigureView }): void {
  frame.onCurveTooFine?.(element);
  if (getAxesShare(frame.element, frame) < 1 || draft.labels.some(({ key }) => key === TOO_FINE_KEY)) return;
  draft.labels.unshift({ key: TOO_FINE_KEY, text: frame.words.tooFine, anchor: { x: view.rect.right, y: 0 }, gap: 0, sides: ['below-left'], tone: 'ink', isFixed: true });
}

function addCurve(draft: FigureDraft, element: PlotElement, { frame, view, isFirst }: { frame: FigureFrame; view: FigureView; isFirst: boolean }): void {
  const { branches: world, isTooFine } = getCurveDrawing(element, frame, view);
  if (isTooFine) addTooFineNote(draft, element, { frame, view });
  const upToX = getDrawnUpToX(element, frame);
  const isWhole = upToX >= element.content.domain[1];
  const drawn = isWhole ? getPixelBranches(world, view) : getBranchesUpTo(world, upToX).map((branch) => branch.map(view.toPixel));
  draft.marks.push({ kind: 'path', key: `curve-${element.id}`, tone: isFirst ? 'ink' : 'ink-2', weight: 'bold', branches: drawn });
  addSoftLine(draft, drawn);
  // A curve with no values to draw still keeps its name, in the middle of the empty plot.
  const anchor = drawn.at(-1)?.at(-1) ?? (isWhole ? { x: (view.rect.left + view.rect.right) / 2, y: (view.rect.top + view.rect.bottom) / 2 } : null);
  if (element.content.label && anchor) addLabel(draft, { key: `label-${element.id}`, text: element.content.label, anchor, sides: ['above-left', 'left', 'below-left', 'above', 'below', 'above-right', 'right', 'below-right'] });
}

function getShadePolygons(world: readonly Branch[], { from, to, view }: { from: number; to: number; view: FigureView }): Branch[] {
  const baseline = Math.min(view.yRange[1], Math.max(view.yRange[0], 0));
  return getBranchesUpTo(world, to).flatMap((branch): Branch[] => {
    const start = branch.findIndex((point) => point.x >= from);
    if (start === -1) return [];
    const before = branch[start - 1];
    const first = branch[start] as Point;
    const entry: Point[] = before ? [{ x: from, y: interpolate(before.y, first.y, (from - before.x) / (first.x - before.x)) }] : [];
    const kept = [...entry, ...branch.slice(start)];
    if (kept.length < 2) return [];
    const ends: Point[] = [{ x: (kept.at(-1) as Point).x, y: baseline }, { x: (kept[0] as Point).x, y: baseline }];
    return [[...kept, ...ends].map(view.toPixel)];
  });
}

function addShade(draft: FigureDraft, element: BoardElement & { content: ShadeArea }, { curve, frame, view }: { curve: PlotElement; frame: FigureFrame; view: FigureView }): void {
  const { from, to, label, target } = element.content;
  const share = getDrawnShare(element, frame);
  const shownTo = interpolate(from, to, share);
  const polygons = getShadePolygons(getCurvePoints(curve, frame, view), { from, to: shownTo, view });
  draft.marks.unshift({ kind: 'area', key: `shade-${element.id}-${target}`, tone: 'line', polygons });
  const middle = polygons[0] && polygons.flat().reduce((sum, point) => ({ x: sum.x + point.x / polygons.flat().length, y: sum.y + point.y / polygons.flat().length }), { x: 0, y: 0 });
  if (label && middle && share >= 1) addLabel(draft, { key: `label-${element.id}`, text: label, anchor: middle, gap: 0, sides: ['above', 'below', 'right', 'left'] });
}

function addMark(draft: FigureDraft, element: BoardElement & { content: MarkValue }, { curve, frame, view }: { curve: PlotElement; frame: FigureFrame; view: FigureView }): void {
  const { at, label } = element.content;
  const value = getPlotFrame(curve, frame)?.getValue(at);
  if (value === undefined || !Number.isFinite(value) || at < view.xRange[0] || at > view.xRange[1] || value < view.yRange[0] || value > view.yRange[1]) {
    frame.onMarkWithoutPart?.(element);
    return;
  }
  frame.onMarkDrawn?.(element);
  const share = getDrawnShare(element, frame);
  const point = view.toPixel({ x: at, y: value });
  draft.marks.push({ kind: 'dot', key: `mark-${element.id}`, at: point, radius: MARK_DOT_RADIUS * share, tone: 'ink' });
  const computed = `(${formatNumber(at)}, ${formatNumber(value)})`;
  if (share >= 1) addLabel(draft, { key: `label-${element.id}`, text: label ? `${label} ${computed}` : computed, anchor: point, gap: 8 });
}

function getMiddleOfCurve(root: PlotElement, { frame, view }: { frame: FigureFrame; view: FigureView }): Point {
  const longest = getCurvePoints(root, frame, view).reduce<Branch>((best, branch) => (branch.length > best.length ? branch : best), []);
  const middle = longest[Math.floor(longest.length / 2)];
  return middle ? view.toPixel(middle) : { x: (view.rect.left + view.rect.right) / 2, y: (view.rect.top + view.rect.bottom) / 2 };
}

function addAttachment(draft: FigureDraft, element: BoardElement, { root, frame, view }: { root: PlotElement; frame: FigureFrame; view: FigureView }): void {
  const { board } = frame;
  const { content } = element;
  const center = { x: (view.rect.left + view.rect.right) / 2, y: (view.rect.top + view.rect.bottom) / 2 };
  if (content.kind === 'plot') addCurve(draft, element as PlotElement, { frame, view, isFirst: false });
  if (content.kind === 'shadeArea') addShade(draft, element as BoardElement & { content: ShadeArea }, { curve: (board.elements.get(content.target) as PlotElement | undefined) ?? root, frame, view });
  if (content.kind === 'markValue') addMark(draft, element as BoardElement & { content: MarkValue }, { curve: (board.elements.get(content.target) as PlotElement | undefined) ?? root, frame, view });
  if (content.kind === 'vector') addArrow(draft, { key: `vector-${element.id}`, from: center, to: getFixedVectorTip(center, content, frame), share: getDrawnShare(element, frame), tone: 'ink', label: content.label });
  const partMark = getPartMark(element);
  if (!partMark || !('target' in content)) return;
  if (content.target.split('.')[1] !== 'curve') {
    frame.onMarkWithoutPart?.(element);
    return;
  }
  frame.onMarkDrawn?.(element);
  addPartMark(draft, { key: `note-${element.id}`, at: getMiddleOfCurve(root, { frame, view }), share: getDrawnShare(element, frame), ...partMark });
}

export function getPlotMarks(frame: FigureFrame): FigureMark[] {
  const root = frame.element as PlotElement;
  const { domain, xLabel, yLabel, yRange: askedRange } = root.content;
  const yRange = getPlotFrame(root, frame)?.yRange ?? askedRange ?? [-1, 1];
  const left = Math.min(frame.width * WIDEST_LEFT_MARGIN_SHARE, Math.max(PLOT_MARGIN.left, getWidestYTick(yRange, frame.height - PLOT_MARGIN.top - PLOT_MARGIN.bottom) + TICK_ROOM));
  const rect = { left, top: PLOT_MARGIN.top, right: frame.width - PLOT_MARGIN.right, bottom: frame.height - PLOT_MARGIN.bottom };
  const view = createStretchedView({ xRange: domain, yRange, rect });
  const draft = createFigureDraft(frame.width, frame.height);
  addAxes(draft, view, { share: getAxesShare(root, frame), xLabel, yLabel });
  addCurve(draft, root, { frame, view, isFirst: true });
  const attached = keepNewestOnFigure(getAttachedElements(frame.board, root.id));
  const curves = attached.filter(({ content }) => content.kind === 'plot');
  const curvesLeftOut = new Set(curves.slice(0, -FIGURE_LIMITS.curves));
  for (const element of attached) if (!curvesLeftOut.has(element)) addAttachment(draft, element, { root, frame, view });
  return finishFigure(draft, frame.onLabelWithoutRoom);
}
