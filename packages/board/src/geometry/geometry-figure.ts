import type { Construct, Geometry, GeometryStep } from '@astra/contracts';
import { type FigureFrame, getAttachedElements, getDrawnShare, getPartMark, keepNewestOnFigure } from '../figure/figure-input.ts';
import { addArrow, addLabel, addPartMark, addSoftLine, createFigureDraft, type FigureDraft, finishFigure, getFixedVectorTip } from '../figure/figure-draft.ts';
import { type Branch, clipBranch, type FigureMark, getDistance, getLeadingShare, type Point } from '../figure/figure-marks.ts';
import { createEqualView, type FigureView } from '../figure/figure-view.ts';
import type { BoardElement } from '../player/board-state.ts';
import { formatNumber } from '../plot/axis-ticks.ts';

const MARGIN = 16;
const POINT_RADIUS = 4;
const CIRCLE_STEPS = 96;
const ARC = { radius: 26, steps: 24, labelGap: 8, shareOfShorterSide: 0.4 };
const DEGREES_PER_RADIAN = 180 / Math.PI;

type StepElement = BoardElement & { content: Construct };

function getPointsBefore(steps: readonly StepElement[]): Map<string, Point> {
  const points = new Map<string, Point>();
  for (const { content: { step } } of steps) if (step.shape === 'point') points.set(step.name, { x: step.x, y: step.y });
  return points;
}

function addPoint(draft: FigureDraft, element: StepElement, { step, view, share }: { step: GeometryStep & { shape: 'point' }; view: FigureView; share: number }): void {
  const at = view.toPixel({ x: step.x, y: step.y });
  const { rect } = view;
  if (at.x < rect.left || at.x > rect.right || at.y < rect.top || at.y > rect.bottom) return;
  draft.marks.push({ kind: 'dot', key: `point-${element.id}`, at, radius: POINT_RADIUS * share, tone: 'ink' });
  if (share >= 1) addLabel(draft, { key: `point-label-${element.id}`, text: step.name, anchor: at, gap: 7, sides: ['above-right', 'above-left', 'below-right', 'below-left', 'above', 'below', 'right', 'left'] });
}

function addLine(draft: FigureDraft, { key, points, view, share }: { key: string; points: Branch; view: FigureView; share: number }): void {
  const branches = clipBranch(points.map(view.toPixel), view.rect).map((branch) => getLeadingShare(branch, share));
  draft.marks.push({ kind: 'path', key, tone: 'ink', weight: 'thin', branches });
  addSoftLine(draft, branches);
}

function getCirclePoints(center: Point, through: Point): Point[] {
  const radius = getDistance(center, through);
  const start = Math.atan2(through.y - center.y, through.x - center.x);
  return Array.from({ length: CIRCLE_STEPS + 1 }, (_, step) => {
    const angle = start + (step / CIRCLE_STEPS) * 2 * Math.PI;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function addAngle(draft: FigureDraft, element: StepElement, { at, from, to, view, share, degreesWord }: { at: Point; from: Point; to: Point; view: FigureView; share: number; degreesWord: string }): void {
  const [vertex, startPoint, endPoint] = [at, from, to].map(view.toPixel) as [Point, Point, Point];
  const startAngle = Math.atan2(startPoint.y - vertex.y, startPoint.x - vertex.x);
  const rawSweep = Math.atan2(endPoint.y - vertex.y, endPoint.x - vertex.x) - startAngle;
  const sweep = Math.atan2(Math.sin(rawSweep), Math.cos(rawSweep));
  if (getDistance(vertex, startPoint) === 0 || getDistance(vertex, endPoint) === 0) return;
  const radius = Math.min(ARC.radius, ARC.shareOfShorterSide * Math.min(getDistance(vertex, startPoint), getDistance(vertex, endPoint)));
  const getArcPoint = (angle: number, distance = radius): Point => ({ x: vertex.x + Math.cos(angle) * distance, y: vertex.y + Math.sin(angle) * distance });
  const arc = Array.from({ length: ARC.steps + 1 }, (_, step) => getArcPoint(startAngle + (step / ARC.steps) * sweep));
  draft.marks.push({ kind: 'path', key: `angle-${element.id}`, tone: 'ink-2', weight: 'thin', branches: [getLeadingShare(arc, share)] });
  if (share >= 1) addLabel(draft, { key: `angle-label-${element.id}`, text: `${formatNumber(Math.abs(sweep) * DEGREES_PER_RADIAN, 3)}${degreesWord}`, anchor: getArcPoint(startAngle + sweep / 2, radius + ARC.labelGap), gap: 2 });
}

function addStep(draft: FigureDraft, element: StepElement, { points, view, frame }: { points: ReadonlyMap<string, Point>; view: FigureView; frame: FigureFrame }): void {
  const { step } = element.content;
  const share = getDrawnShare(element, frame);
  if (step.shape === 'point') addPoint(draft, element, { step, view, share });
  if (step.shape === 'segment' && points.get(step.from) && points.get(step.to)) addLine(draft, { key: `segment-${element.id}`, points: [points.get(step.from) as Point, points.get(step.to) as Point], view, share });
  if (step.shape === 'circle' && points.get(step.center) && points.get(step.through)) addLine(draft, { key: `circle-${element.id}`, points: getCirclePoints(points.get(step.center) as Point, points.get(step.through) as Point), view, share });
  if (step.shape === 'angle' && points.get(step.at) && points.get(step.from) && points.get(step.to)) addAngle(draft, element, { at: points.get(step.at) as Point, from: points.get(step.from) as Point, to: points.get(step.to) as Point, view, share, degreesWord: frame.words.degrees });
}

function getPartPixel(ref: string, { points, view }: { points: ReadonlyMap<string, Point>; view: FigureView }): Point | null {
  const [, part] = ref.split('.');
  const point = part === undefined ? null : points.get(part);
  if (point) return view.toPixel(point);
  if (part !== undefined) return null;
  return { x: (view.rect.left + view.rect.right) / 2, y: (view.rect.top + view.rect.bottom) / 2 };
}

function addOnFigure(draft: FigureDraft, element: BoardElement, { points, view, frame }: { points: ReadonlyMap<string, Point>; view: FigureView; frame: FigureFrame }): void {
  const { content } = element;
  const share = getDrawnShare(element, frame);
  if (content.kind === 'vector') {
    const from = getPartPixel(content.on, { points, view });
    if (from) addArrow(draft, { key: `vector-${element.id}`, from, to: getFixedVectorTip(from, content, frame), share, tone: 'ink', label: content.label });
  }
  const partMark = getPartMark(element);
  if (partMark && 'target' in content) {
    const at = getPartPixel(content.target, { points, view });
    if (at) {
      frame.onMarkDrawn?.(element);
      addPartMark(draft, { key: `note-${element.id}`, at, share, ...partMark });
    } else {
      frame.onMarkWithoutPart?.(element);
    }
  }
}

export function getGeometryMarks(frame: FigureFrame): FigureMark[] {
  const { element, width, height, board } = frame;
  const { xRange, yRange } = element.content as Geometry;
  const view = createEqualView({ xRange, yRange, rect: { left: MARGIN, top: MARGIN, right: width - MARGIN, bottom: height - MARGIN } });
  const draft = createFigureDraft(width, height);
  const attached = getAttachedElements(board, element.id);
  const steps = attached.filter((attachment): attachment is StepElement => attachment.content.kind === 'construct');
  const points = getPointsBefore(steps);
  for (const step of keepNewestOnFigure(steps)) addStep(draft, step, { points, view, frame });
  for (const attachment of keepNewestOnFigure(attached)) addOnFigure(draft, attachment, { points, view, frame });
  return finishFigure(draft, frame.onLabelWithoutRoom);
}
