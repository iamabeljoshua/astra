import type { Diagram } from '@astra/contracts';
import { layoutGraph, type GraphRoute } from '../diagram/layout-graph.ts';
import { BASELINE_EMS, DESCENT_EMS, LINE_HEIGHT_EMS, wrapText, writeByHand } from './handwriting.ts';
import { type InkDrawing, type InkPosition, type InkStroke, getSpread, makeSeededRandom, makeStroke } from './ink-stroke.ts';
import type { MarkBox } from './marks.ts';

const BOX = { paddingX: 12, paddingY: 7, wobble: 1.2, sides: 4, stepsPerSide: 4 };
const ARROW = { gap: 6, headLength: 9, headAngle: 0.5, smallestSpan: 34, labelScale: 0.75, cornerReach: 8 };
const NODE_GAP_EMS = 1;
const LARGEST_EDGE_LABEL_EMS = 10;
const AVERAGE_CHARACTER_EMS = 0.6;
/** A font's box starts above its baseline's ascent, so a label at the top needs a little room. */
const FONT_BOX_ROOM_EMS = 0.2;

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
export interface LabelDrawing {
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

export function setPlainLabel(text: string, { fontSize, maxWidth, measureText = measureByAverage }: Pick<DiagramRequest, 'fontSize' | 'maxWidth' | 'measureText'>): LabelDrawing {
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
  return { ...stroke, ...makeStroke(stroke.points.map((point) => ({ x: point.x + by.x, y: point.y + by.y }))) };
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
  return { ...makeStroke(points), role: 'box' };
}

// The painter rounds a corner through the midpoints of its sides, so a point each side of it keeps the line on its route.
function holdCorners(points: readonly InkPosition[]): InkPosition[] {
  return points.flatMap((corner, index) => {
    const before = points[index - 1];
    const after = points[index + 1];
    if (!before || !after) return [corner];
    const pointToward = (other: InkPosition): InkPosition => {
      const distance = Math.hypot(other.x - corner.x, other.y - corner.y);
      const share = Math.min(ARROW.cornerReach, distance / 2) / (distance || 1);
      return { x: corner.x + (other.x - corner.x) * share, y: corner.y + (other.y - corner.y) * share };
    };
    return [pointToward(before), corner, pointToward(after)];
  });
}

function getArrow(points: readonly InkPosition[]): InkStroke[] {
  const end = points.at(-1) as InkPosition;
  const before = points.at(-2) as InkPosition;
  const angle = Math.atan2(end.y - before.y, end.x - before.x);
  const headPoint = (side: number): InkPosition => ({ x: end.x - Math.cos(angle + side * ARROW.headAngle) * ARROW.headLength, y: end.y - Math.sin(angle + side * ARROW.headAngle) * ARROW.headLength });
  return [{ ...makeStroke(holdCorners(points)), role: 'line' }, { ...makeStroke([headPoint(1), end, headPoint(-1)]), role: 'line' }];
}

function drawEdgeLabel(edge: Diagram['edges'][number], isHandwritten: boolean, request: DiagramRequest): LabelDrawing | null {
  if (!edge.label) return null;
  const smaller = request.fontSize * ARROW.labelScale;
  return drawLabel(edge.label, isHandwritten, { ...request, fontSize: smaller, maxWidth: Math.max(smaller * 4, Math.min(request.maxWidth / 2, smaller * LARGEST_EDGE_LABEL_EMS)), seed: `${request.seed}.${edge.from}.${edge.to}` });
}

function drawNodes(diagram: DrawableDiagram, request: DiagramRequest): (PlacedNode & { size: { width: number; height: number } })[] {
  return diagram.nodes.map((node) => {
    const label = drawLabel(node.label, diagram.handwritten !== false, { ...request, maxWidth: request.maxWidth - 2 * BOX.paddingX, seed: `${request.seed}.${node.name}` });
    return { name: node.name, label, box: { x: 0, y: 0, width: 0, height: 0 }, size: { width: label.width + 2 * BOX.paddingX, height: label.height + 2 * BOX.paddingY } };
  });
}

function getEdgeDrawing(route: GraphRoute, label: LabelDrawing | null): Pick<DiagramStep, 'strokes' | 'textLabels'> {
  const labelAt = route.labelAt ?? { x: 0, y: 0 };
  return { strokes: [...getArrow(route.points), ...(label?.strokes.map((stroke) => moveStroke(stroke, labelAt)) ?? [])], textLabels: label?.text ? [moveTextLabel(label.text, labelAt)] : [] };
}

function getBounds(nodes: readonly PlacedNode[], steps: readonly DiagramStep[]) {
  const labelCorners = steps.flatMap((step) => step.textLabels.flatMap(({ x, y, width, height, fontSize }) => [{ x, y: y - fontSize * FONT_BOX_ROOM_EMS }, { x: x + width, y: y + height }]));
  const points = [...steps.flatMap((step) => step.strokes.flatMap((stroke) => stroke.points)), ...labelCorners];
  const left = Math.min(0, ...points.map((point) => point.x));
  const top = Math.min(0, ...points.map((point) => point.y));
  const right = Math.max(...nodes.map((node) => node.box.x + node.box.width), ...points.map((point) => point.x));
  const bottom = Math.max(...nodes.map((node) => node.box.y + node.box.height), ...points.map((point) => point.y));
  return { left, top, width: right - left, height: bottom - top };
}

/** Draws a diagram by hand, a node at a time. An edge arrives once both of its ends are on the board. A label the strokes cannot write, or any label when `handwritten` is false, is set as plain text. */
export function drawDiagram(diagram: DrawableDiagram, request: DiagramRequest): DrawnDiagram {
  const { seed, fontSize, maxWidth } = request;
  const random = makeSeededRandom(seed);
  const isHandwritten = diagram.handwritten !== false;
  const drawnNodes = drawNodes(diagram, request);
  const edgeLabels = diagram.edges.map((edge) => drawEdgeLabel(edge, isHandwritten, request));
  const { boxes, routes } = layoutGraph({ nodes: drawnNodes.map(({ name, size }) => ({ name, ...size })), edges: diagram.edges.map(({ from, to }, index) => ({ from, to, ...(edgeLabels[index] ? { label: { width: (edgeLabels[index] as LabelDrawing).width, height: (edgeLabels[index] as LabelDrawing).height } } : {}) })), maxWidth, nodeGap: fontSize * NODE_GAP_EMS, smallestRankGap: ARROW.smallestSpan, arrowGap: ARROW.gap });
  const placed: PlacedNode[] = drawnNodes.map(({ name, label }) => ({ name, label, box: boxes.get(name) as MarkBox }));
  const orderOf = new Map(placed.map((node, index) => [node.name, index]));
  const rawSteps = placed.map((node, index): DiagramStep => {
    const labelAt = { x: node.box.x + BOX.paddingX, y: node.box.y + BOX.paddingY };
    const arriving = diagram.edges.flatMap((edge, edgeIndex) => (Math.max(orderOf.get(edge.from) ?? 0, orderOf.get(edge.to) ?? 0) === index ? [edgeIndex] : []));
    const edges = arriving.map((edgeIndex) => getEdgeDrawing(routes[edgeIndex] as GraphRoute, edgeLabels[edgeIndex] as LabelDrawing | null));
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
