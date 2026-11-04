import type { Diagram } from '@astra/contracts';
import { BASELINE_EMS, DESCENT_EMS, LINE_HEIGHT_EMS, wrapText, writeByHand } from './handwriting.ts';
import { type InkDrawing, type InkPosition, type InkStroke, getSpread, makeSeededRandom, makeStroke } from './ink-stroke.ts';
import type { MarkBox } from './marks.ts';

const BOX = { paddingX: 12, paddingY: 7, wobble: 1.2, sides: 4, stepsPerSide: 4 };
const ARROW = { gap: 6, headLength: 9, headAngle: 0.5, smallestSpan: 34, labelScale: 0.75 };
const ROW_GAP_EMS = 1.6;
const AVERAGE_CHARACTER_EMS = 0.6;

/** A label the strokes cannot write, set as plain text. Each baseline is measured from the top of the label. */
export interface DiagramTextLabel {
  lines: readonly string[];
  baselines: readonly number[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

/** One node and the edges that arrive with it, so `reveal` can draw a diagram one node at a time. */
export interface DiagramStep {
  strokes: readonly InkStroke[];
  textLabels: readonly DiagramTextLabel[];
}

export type MeasureText = (text: string, fontSize: number) => number;

export interface DiagramRequest {
  fontSize: number;
  maxWidth: number;
  seed: string;
  /** The width of a line of plain text. With none, a character counts as an average width. */
  measureText?: MeasureText;
}

type DrawableDiagram = Pick<Diagram, 'nodes' | 'edges' | 'handwritten'>;

/** A label either way it can be drawn, at the top left of its own room. */
interface LabelDrawing {
  strokes: readonly InkStroke[];
  text: DiagramTextLabel | null;
  width: number;
  height: number;
}

export interface DrawnDiagram {
  steps: readonly DiagramStep[];
  width: number;
  height: number;
}

interface PlacedNode {
  name: string;
  box: MarkBox;
  label: LabelDrawing;
}

const measureByAverage: MeasureText = (text, fontSize) => [...text].length * fontSize * AVERAGE_CHARACTER_EMS;

function setPlainLabel(text: string, { fontSize, maxWidth, measureText = measureByAverage }: Pick<DiagramRequest, 'fontSize' | 'maxWidth' | 'measureText'>): LabelDrawing {
  const measure = (part: string) => measureText(part, fontSize);
  const lines = wrapText({ text, maxWidth, measure });
  const width = Math.max(0, ...lines.map(measure));
  const height = (BASELINE_EMS + (lines.length - 1) * LINE_HEIGHT_EMS + DESCENT_EMS) * fontSize;
  return { strokes: [], width, height, text: { lines, baselines: lines.map((_, index) => (BASELINE_EMS + index * LINE_HEIGHT_EMS) * fontSize), x: 0, y: 0, width, height, fontSize } };
}

function drawLabel(text: string, isHandwritten: boolean, request: DiagramRequest): LabelDrawing {
  const written: InkDrawing | null = isHandwritten ? writeByHand({ text, fontSize: request.fontSize, maxWidth: request.maxWidth, seed: request.seed }) : null;
  return written ? { strokes: written.strokes, text: null, width: written.width, height: written.height } : setPlainLabel(text, request);
}

const moveTextLabel = (label: DiagramTextLabel, by: InkPosition): DiagramTextLabel => ({ ...label, x: label.x + by.x, y: label.y + by.y });

function moveStroke(stroke: InkStroke, by: InkPosition): InkStroke {
  return makeStroke(stroke.points.map((point) => ({ x: point.x + by.x, y: point.y + by.y })));
}

function getRoughBox(box: MarkBox, random: () => number): InkStroke {
  const corners: InkPosition[] = [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y }, { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }, { x: box.x, y: box.y }];
  const points: InkPosition[] = [];
  for (let side = 0; side < BOX.sides; side += 1) {
    const from = corners[side] as InkPosition;
    const to = corners[side + 1] as InkPosition;
    for (let step = 0; step < BOX.stepsPerSide; step += 1) {
      const along = step / BOX.stepsPerSide;
      points.push({ x: from.x + (to.x - from.x) * along + getSpread(random, BOX.wobble), y: from.y + (to.y - from.y) * along + getSpread(random, BOX.wobble) });
    }
  }
  points.push({ x: box.x + getSpread(random, BOX.wobble), y: box.y + getSpread(random, BOX.wobble) });
  return makeStroke(points);
}

function getEdgeEnds(from: MarkBox, to: MarkBox): [InkPosition, InkPosition] {
  const isSameRow = from.y === to.y;
  if (isSameRow) {
    const goesRight = to.x >= from.x;
    return [
      { x: goesRight ? from.x + from.width + ARROW.gap : from.x - ARROW.gap, y: from.y + from.height / 2 },
      { x: goesRight ? to.x - ARROW.gap : to.x + to.width + ARROW.gap, y: to.y + to.height / 2 },
    ];
  }
  const goesDown = to.y > from.y;
  return [
    { x: from.x + from.width / 2, y: goesDown ? from.y + from.height + ARROW.gap : from.y - ARROW.gap },
    { x: to.x + to.width / 2, y: goesDown ? to.y - ARROW.gap : to.y + to.height + ARROW.gap },
  ];
}

function getArrow(start: InkPosition, end: InkPosition): InkStroke[] {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headPoint = (side: number): InkPosition => ({ x: end.x - Math.cos(angle + side * ARROW.headAngle) * ARROW.headLength, y: end.y - Math.sin(angle + side * ARROW.headAngle) * ARROW.headLength });
  return [makeStroke([start, end]), makeStroke([headPoint(1), end, headPoint(-1)])];
}

function getColumnGap(diagram: DrawableDiagram, request: DiagramRequest): number {
  const { fontSize, maxWidth } = request;
  const widest = diagram.edges.reduce((width, edge) => Math.max(width, edge.label ? drawLabel(edge.label, diagram.handwritten !== false, { ...request, fontSize: fontSize * ARROW.labelScale }).width : 0), 0);
  return Math.max(ARROW.smallestSpan, Math.min(widest + 2 * ARROW.gap, maxWidth / 3));
}

function placeNodes(diagram: DrawableDiagram, request: DiagramRequest): PlacedNode[] {
  const { fontSize, maxWidth, seed } = request;
  const columnGap = getColumnGap(diagram, request);
  const rowGap = fontSize * ROW_GAP_EMS;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return diagram.nodes.map((node) => {
    const label = drawLabel(node.label, diagram.handwritten !== false, { ...request, maxWidth: maxWidth - 2 * BOX.paddingX, seed: `${seed}.${node.name}` });
    const width = label.width + 2 * BOX.paddingX;
    const height = label.height + 2 * BOX.paddingY;
    if (x > 0 && x + width > maxWidth) {
      x = 0;
      y += rowHeight + rowGap;
      rowHeight = 0;
    }
    const box = { x, y, width, height };
    x += width + columnGap;
    rowHeight = Math.max(rowHeight, height);
    return { name: node.name, box, label };
  });
}

function getEdgeDrawing(edge: Diagram['edges'][number], { from, to, isHandwritten, request }: { from: MarkBox; to: MarkBox; isHandwritten: boolean; request: DiagramRequest }): Pick<DiagramStep, 'strokes' | 'textLabels'> {
  const [start, end] = getEdgeEnds(from, to);
  const { fontSize } = request;
  const label = edge.label ? drawLabel(edge.label, isHandwritten, { ...request, fontSize: fontSize * ARROW.labelScale, maxWidth: Math.max(Math.abs(end.x - start.x), fontSize * 4) }) : null;
  // Between two rows there is no room above the arrow, only a box.
  const labelY = from.y === to.y ? Math.min(start.y, end.y) - (label?.height ?? 0) : (start.y + end.y) / 2 - (label?.height ?? 0) / 2;
  const labelAt = { x: (start.x + end.x) / 2 - (label?.width ?? 0) / 2, y: labelY };
  return { strokes: [...getArrow(start, end), ...(label?.strokes.map((stroke) => moveStroke(stroke, labelAt)) ?? [])], textLabels: label?.text ? [moveTextLabel(label.text, labelAt)] : [] };
}

function getBounds(nodes: readonly PlacedNode[], steps: readonly DiagramStep[]) {
  const labelCorners = steps.flatMap((step) => step.textLabels.flatMap(({ x, y, width, height }) => [{ x, y }, { x: x + width, y: y + height }]));
  const points = [...steps.flatMap((step) => step.strokes.flatMap((stroke) => stroke.points)), ...labelCorners];
  const left = Math.min(0, ...points.map((point) => point.x));
  const top = Math.min(0, ...points.map((point) => point.y));
  const right = Math.max(...nodes.map((node) => node.box.x + node.box.width), ...points.map((point) => point.x));
  const bottom = Math.max(...nodes.map((node) => node.box.y + node.box.height), ...points.map((point) => point.y));
  return { left, top, width: right - left, height: bottom - top };
}

/** Draws a diagram by hand, a node at a time. An edge arrives once both of its ends are on the board. A label the strokes cannot write, or any label when `handwritten` is false, is set as plain text. */
export function drawDiagram(diagram: DrawableDiagram, request: DiagramRequest): DrawnDiagram {
  const { seed } = request;
  const random = makeSeededRandom(seed);
  const placed = placeNodes(diagram, request);
  const boxes = new Map(placed.map((node) => [node.name, node.box]));
  const orderOf = new Map(placed.map((node, index) => [node.name, index]));
  const isHandwritten = diagram.handwritten !== false;
  const rawSteps = placed.map((node, index): DiagramStep => {
    const labelAt = { x: node.box.x + BOX.paddingX, y: node.box.y + BOX.paddingY };
    const arriving = diagram.edges.filter((edge) => Math.max(orderOf.get(edge.from) ?? 0, orderOf.get(edge.to) ?? 0) === index);
    const edges = arriving.map((edge) => getEdgeDrawing(edge, { from: boxes.get(edge.from) as MarkBox, to: boxes.get(edge.to) as MarkBox, isHandwritten, request: { ...request, seed: `${seed}.${edge.from}.${edge.to}` } }));
    return {
      strokes: [getRoughBox(node.box, random), ...node.label.strokes.map((stroke) => moveStroke(stroke, labelAt)), ...edges.flatMap((edge) => edge.strokes)],
      textLabels: [...(node.label.text ? [moveTextLabel(node.label.text, labelAt)] : []), ...edges.flatMap((edge) => edge.textLabels)],
    };
  });
  const { left, top, width, height } = getBounds(placed, rawSteps);
  const toOrigin = { x: -left, y: -top };
  const steps = rawSteps.map((step) => ({ strokes: step.strokes.map((stroke) => moveStroke(stroke, toOrigin)), textLabels: step.textLabels.map((label) => moveTextLabel(label, toOrigin)) }));
  return { steps, width, height };
}
