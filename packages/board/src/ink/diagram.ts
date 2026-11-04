import type { Diagram } from '@astra/contracts';
import { writeByHand } from './handwriting.ts';
import { type InkDrawing, type InkPosition, type InkStroke, getSpread, makeSeededRandom, makeStroke } from './ink-stroke.ts';
import type { MarkBox } from './marks.ts';

const BOX = { paddingX: 12, paddingY: 7, wobble: 1.2, sides: 4, stepsPerSide: 4 };
const ARROW = { gap: 6, headLength: 9, headAngle: 0.5, smallestSpan: 34, labelScale: 0.75 };
const ROW_GAP_EMS = 1.6;

/** One node and the edges that arrive with it, so `reveal` can draw a diagram one node at a time. */
export interface DiagramStep {
  strokes: readonly InkStroke[];
}

export interface DrawnDiagram {
  steps: readonly DiagramStep[];
  width: number;
  height: number;
}

interface PlacedNode {
  name: string;
  box: MarkBox;
  label: InkDrawing;
}

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

function getColumnGap(diagram: Pick<Diagram, 'edges'>, { fontSize, maxWidth, seed }: { fontSize: number; maxWidth: number; seed: string }): number {
  const widest = diagram.edges.reduce((width, edge) => Math.max(width, edge.label ? (writeByHand({ text: edge.label, fontSize: fontSize * ARROW.labelScale, maxWidth, seed })?.width ?? 0) : 0), 0);
  return Math.max(ARROW.smallestSpan, Math.min(widest + 2 * ARROW.gap, maxWidth / 3));
}

function placeNodes(diagram: Pick<Diagram, 'nodes' | 'edges'>, { fontSize, maxWidth, seed }: { fontSize: number; maxWidth: number; seed: string }): PlacedNode[] {
  const columnGap = getColumnGap(diagram, { fontSize, maxWidth, seed });
  const rowGap = fontSize * ROW_GAP_EMS;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return diagram.nodes.map((node) => {
    const label = writeByHand({ text: node.label, fontSize, maxWidth: maxWidth - 2 * BOX.paddingX, seed: `${seed}.${node.name}` }) ?? { strokes: [], width: fontSize, height: fontSize };
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

function getEdgeStrokes(edge: Diagram['edges'][number], { from, to, fontSize, seed }: { from: MarkBox; to: MarkBox; fontSize: number; seed: string }): InkStroke[] {
  const [start, end] = getEdgeEnds(from, to);
  const label = edge.label ? writeByHand({ text: edge.label, fontSize: fontSize * ARROW.labelScale, maxWidth: Math.max(Math.abs(end.x - start.x), fontSize * 4), seed }) : null;
  const labelAt = { x: (start.x + end.x) / 2 - (label?.width ?? 0) / 2, y: Math.min(start.y, end.y) - (label?.height ?? 0) };
  return [...getArrow(start, end), ...(label?.strokes.map((stroke) => moveStroke(stroke, labelAt)) ?? [])];
}

function getBounds(nodes: readonly PlacedNode[], steps: readonly DiagramStep[]) {
  const points = steps.flatMap((step) => step.strokes.flatMap((stroke) => stroke.points));
  const left = Math.min(0, ...points.map((point) => point.x));
  const top = Math.min(0, ...points.map((point) => point.y));
  const right = Math.max(...nodes.map((node) => node.box.x + node.box.width), ...points.map((point) => point.x));
  const bottom = Math.max(...nodes.map((node) => node.box.y + node.box.height), ...points.map((point) => point.y));
  return { left, top, width: right - left, height: bottom - top };
}

/** Draws a diagram by hand, a node at a time. An edge arrives once both of its ends are on the board. */
export function drawDiagram(diagram: Pick<Diagram, 'nodes' | 'edges'>, { fontSize, maxWidth, seed }: { fontSize: number; maxWidth: number; seed: string }): DrawnDiagram {
  const random = makeSeededRandom(seed);
  const placed = placeNodes(diagram, { fontSize, maxWidth, seed });
  const boxes = new Map(placed.map((node) => [node.name, node.box]));
  const orderOf = new Map(placed.map((node, index) => [node.name, index]));
  const rawSteps = placed.map((node, index): DiagramStep => {
    const labelAt = { x: node.box.x + BOX.paddingX, y: node.box.y + BOX.paddingY };
    const arriving = diagram.edges.filter((edge) => Math.max(orderOf.get(edge.from) ?? 0, orderOf.get(edge.to) ?? 0) === index);
    return {
      strokes: [
        getRoughBox(node.box, random),
        ...node.label.strokes.map((stroke) => moveStroke(stroke, labelAt)),
        ...arriving.flatMap((edge) => getEdgeStrokes(edge, { from: boxes.get(edge.from) as MarkBox, to: boxes.get(edge.to) as MarkBox, fontSize, seed: `${seed}.${edge.from}.${edge.to}` })),
      ],
    };
  });
  const { left, top, width, height } = getBounds(placed, rawSteps);
  const steps = rawSteps.map((step) => ({ strokes: step.strokes.map((stroke) => moveStroke(stroke, { x: -left, y: -top })) }));
  return { steps, width, height };
}
