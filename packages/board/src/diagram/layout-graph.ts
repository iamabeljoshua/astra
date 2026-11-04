import type { InkPosition } from '../ink/ink-stroke.ts';
import type { MarkBox } from '../ink/marks.ts';
import { type Axes, findLabelSpot, type LabelGap, type LabelRect } from './edge-label-spots.ts';

export interface GraphNode {
  name: string;
  width: number;
  height: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: { width: number; height: number };
}

export interface GraphRequest {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  maxWidth: number;
  nodeGap: number;
  smallestRankGap: number;
  /** The clear space between a box and the arrow that points at it. */
  arrowGap: number;
}

export interface GraphRoute {
  points: readonly InkPosition[];
  labelAt: InkPosition | null;
}

export interface GraphLayout {
  boxes: ReadonlyMap<string, MarkBox>;
  /** One per edge, in the order given, running from `from` to `to`. */
  routes: readonly GraphRoute[];
}

interface Slot {
  /** A slot with no node lets a long edge pass through a rank between two nodes. */
  name: string | null;
  width: number;
  height: number;
}

interface Span {
  fromRank: number;
  toRank: number;
  isBackward: boolean;
}

const LANE_WIDTH = 10;
const LABEL_ROOM = 4;
const MOST_LABEL_LANES = 2;

/** How far a loop on one node stands off its box, and how wide it is. */
const LOOP = { reach: 16, halfWidth: 12 };

// An edge that would close a loop counts as going backward, so every rank sits after the ranks that feed it.
function getForwardEdges(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Set<GraphEdge> {
  const onPath = new Set<string>();
  const done = new Set<string>();
  const forward = new Set<GraphEdge>();
  const visit = (name: string) => {
    onPath.add(name);
    for (const edge of edges) {
      if (edge.from !== name || edge.from === edge.to || onPath.has(edge.to)) continue;
      forward.add(edge);
      if (!done.has(edge.to)) visit(edge.to);
    }
    onPath.delete(name);
    done.add(name);
  };
  for (const { name } of nodes) if (!done.has(name)) visit(name);
  return forward;
}

function getSpread(row: readonly GraphNode[], nodeGap: number): number {
  return row.reduce((sum, node) => sum + node.width, 0) + Math.max(0, row.length - 1) * nodeGap;
}

// Longest path from a source. A rank too wide for the board hands its last node on to the next, and what follows moves down with it.
function getRanks({ nodes, edges, maxWidth, nodeGap }: GraphRequest, forward: ReadonlySet<GraphEdge>, canWiden: boolean): Map<string, number> {
  const ranks = new Map<string, number>();
  const rows: GraphNode[][] = [];
  const pending = new Set(nodes.map(({ name }) => name));
  const fits = (rank: number, node: GraphNode) => canWiden || (rows[rank] ?? []).length === 0 || getSpread([...(rows[rank] ?? []), node], nodeGap) <= maxWidth;
  while (pending.size > 0) {
    const isReady = (name: string) => edges.every((edge) => edge.to !== name || !forward.has(edge) || !pending.has(edge.from));
    const nextName = nodes.find(({ name }) => pending.has(name) && isReady(name))?.name as string;
    let rank = Math.max(0, ...edges.filter((edge) => edge.to === nextName && forward.has(edge)).map((edge) => (ranks.get(edge.from) as number) + 1));
    const node = nodes.find(({ name }) => name === nextName) as GraphNode;
    while (!fits(rank, node)) rank += 1;
    ranks.set(nextName, rank);
    (rows[rank] ??= []).push(node);
    pending.delete(nextName);
  }
  return ranks;
}

function getSpan(edge: GraphEdge, ranks: ReadonlyMap<string, number>): Span {
  const from = ranks.get(edge.from) as number;
  const to = ranks.get(edge.to) as number;
  return { fromRank: Math.min(from, to), toRank: Math.max(from, to), isBackward: from > to };
}

function getSlots(request: GraphRequest, ranks: ReadonlyMap<string, number>): Slot[][] {
  const rankCount = Math.max(0, ...ranks.values()) + 1;
  const rows: Slot[][] = Array.from({ length: rankCount }, () => []);
  for (const node of request.nodes) (rows[ranks.get(node.name) as number] as Slot[]).push({ name: node.name, width: node.width, height: node.height });
  for (const edge of request.edges) {
    const { fromRank, toRank } = getSpan(edge, ranks);
    for (let rank = fromRank + 1; rank < toRank; rank += 1) (rows[rank] as Slot[]).push({ name: null, width: LANE_WIDTH, height: LANE_WIDTH });
  }
  return rows;
}

const DOWN: Axes = { across: 'x', along: 'y', acrossSize: 'width', alongSize: 'height' };
const SIDEWAYS: Axes = { across: 'y', along: 'x', acrossSize: 'height', alongSize: 'width' };

interface LaidSlot extends Slot {
  across: number;
  along: number;
}

function getRowSpread(row: readonly Slot[], axes: Axes, nodeGap: number): number {
  return row.reduce((sum, slot) => sum + slot[axes.acrossSize], 0) + Math.max(0, row.length - 1) * nodeGap;
}

// Rows are centred on the widest, so a small rank sits under the middle of a large one.
function placeAcross(rows: readonly Slot[][], axes: Axes, nodeGap: number): LaidSlot[][] {
  const widest = Math.max(0, ...rows.map((row) => getRowSpread(row, axes, nodeGap)));
  return rows.map((row) => {
    let across = (widest - getRowSpread(row, axes, nodeGap)) / 2;
    return row.map((slot) => {
      const laid = { ...slot, across, along: 0 };
      across += slot[axes.acrossSize] + nodeGap;
      return laid;
    });
  });
}

const getRankThickness = (row: readonly LaidSlot[], axes: Axes) => Math.max(0, ...row.map((slot) => slot[axes.alongSize]));

const isLoopAtEnd = (edge: GraphEdge, ranks: ReadonlyMap<string, number>, rankCount: number) => edge.from === edge.to && ranks.get(edge.from) === rankCount - 1;

// Lanes stack a crowded gap's labels along it, which only helps going down the board. Across a chain, a label sits above or below its line.
function getGapPlans({ request, ranks, axes, rankCount }: { request: GraphRequest; ranks: ReadonlyMap<string, number>; axes: Axes; rankCount: number }): LabelGap[] {
  const hasRoomAtEnd = request.edges.some((edge) => isLoopAtEnd(edge, ranks, rankCount));
  return Array.from({ length: rankCount }, (_, rank) => {
    const inGap = request.edges.filter((edge) => edge.label && getSpan(edge, ranks).fromRank === rank);
    const lanes = Math.min(inGap.length, axes === DOWN ? MOST_LABEL_LANES : 1);
    const laneSize = Math.max(0, ...inGap.map((edge) => (edge.label as NonNullable<GraphEdge['label']>)[axes.alongSize] + LABEL_ROOM));
    const size = rank === rankCount - 1 && !hasRoomAtEnd ? 0 : Math.max(request.smallestRankGap, lanes * laneSize + 2 * request.arrowGap);
    return { start: 0, size, lanes, laneSize };
  });
}

function placeAlong(rows: LaidSlot[][], gaps: LabelGap[], axes: Axes): void {
  let along = 0;
  rows.forEach((row, rank) => {
    const thickness = getRankThickness(row, axes);
    for (const slot of row) slot.along = along + (thickness - slot[axes.alongSize]) / 2;
    along += thickness;
    const gap = gaps[rank] as LabelGap;
    gap.start = along;
    along += gap.size;
  });
}

const toPoint = (axes: Axes, across: number, along: number): InkPosition => (axes === DOWN ? { x: across, y: along } : { x: along, y: across });

function takeLane(rows: readonly LaidSlot[][], rank: number, used: Set<LaidSlot>): LaidSlot {
  const lane = (rows[rank] as LaidSlot[]).find((slot) => slot.name === null && !used.has(slot)) as LaidSlot;
  used.add(lane);
  return lane;
}

function getBand(row: readonly LaidSlot[], axes: Axes): { start: number; end: number } {
  return { start: Math.min(...row.map((slot) => slot.along)), end: Math.max(...row.map((slot) => slot.along + slot[axes.alongSize])) };
}

const isSamePoint = (first: InkPosition, second: InkPosition) => first.x === second.x && first.y === second.y;

const withoutRepeats = (points: readonly InkPosition[]) => points.filter((point, index) => index === 0 || !isSamePoint(point, points[index - 1] as InkPosition));

function getLoopRoute(slot: LaidSlot, axes: Axes, arrowGap: number): InkPosition[] {
  const middle = slot.across + slot[axes.acrossSize] / 2;
  const leaving = slot.along + slot[axes.alongSize] + arrowGap;
  return [toPoint(axes, middle - LOOP.halfWidth, leaving), toPoint(axes, middle - LOOP.halfWidth, leaving + LOOP.reach), toPoint(axes, middle + LOOP.halfWidth, leaving + LOOP.reach), toPoint(axes, middle + LOOP.halfWidth, leaving)];
}

// A line changes direction only in the gaps between ranks. Inside a rank it runs straight, past its neighbours, so it never crosses a box.
function getRoute({ edge, ranks, rows, axes, arrowGap, usedLanes, backwardShift }: { edge: GraphEdge; ranks: ReadonlyMap<string, number>; rows: readonly LaidSlot[][]; axes: Axes; arrowGap: number; usedLanes: Set<LaidSlot>; backwardShift: number }): InkPosition[] {
  const { fromRank, toRank, isBackward } = getSpan(edge, ranks);
  const [topName, bottomName] = isBackward ? [edge.to, edge.from] : [edge.from, edge.to];
  const top = (rows[fromRank] as LaidSlot[]).find((slot) => slot.name === topName) as LaidSlot;
  if (edge.from === edge.to) return getLoopRoute(top, axes, arrowGap);
  const bottom = (rows[toRank] as LaidSlot[]).find((slot) => slot.name === bottomName) as LaidSlot;
  const centre = (slot: LaidSlot) => slot.across + slot[axes.acrossSize] / 2 + backwardShift;
  const points = [toPoint(axes, centre(top), top.along + top[axes.alongSize] + arrowGap), toPoint(axes, centre(top), getBand(rows[fromRank] as LaidSlot[], axes).end + arrowGap)];
  for (let rank = fromRank + 1; rank < toRank; rank += 1) {
    const row = rows[rank] as LaidSlot[];
    const lane = takeLane(rows, rank, usedLanes);
    const band = getBand(row, axes);
    points.push(toPoint(axes, centre(lane), band.start - arrowGap), toPoint(axes, centre(lane), band.end + arrowGap));
  }
  points.push(toPoint(axes, centre(bottom), getBand(rows[toRank] as LaidSlot[], axes).start - arrowGap), toPoint(axes, centre(bottom), bottom.along - arrowGap));
  const route = withoutRepeats(points);
  return isBackward ? route.reverse() : route;
}

function placeEdgeLabels({ request, ranks, lines, gaps, axes }: { request: GraphRequest; ranks: ReadonlyMap<string, number>; lines: readonly InkPosition[][]; gaps: readonly LabelGap[]; axes: Axes }): (InkPosition | null)[] {
  const taken: LabelRect[] = [];
  return request.edges.map((edge, index) => {
    if (!edge.label) return null;
    const rect = findLabelSpot({ size: edge.label, ownLine: lines[index] as InkPosition[], allLines: lines, taken, gap: gaps[getSpan(edge, ranks).fromRank] as LabelGap, axes });
    taken.push(rect);
    return { x: rect.left, y: rect.top };
  });
}

function layOut(request: GraphRequest, axes: Axes, ranks: ReadonlyMap<string, number>): GraphLayout {
  const rows = placeAcross(getSlots(request, ranks), axes, request.nodeGap);
  const gaps = getGapPlans({ request, ranks, axes, rankCount: rows.length });
  placeAlong(rows, gaps, axes);
  const usedLanes = new Set<LaidSlot>();
  const boxes = new Map(rows.flat().flatMap((slot) => (slot.name === null ? [] : [[slot.name, { ...toPoint(axes, slot.across, slot.along), width: slot.width, height: slot.height }] as const])));
  const lines = request.edges.map((edge) => {
    const isReturning = request.edges.some((other) => other !== edge && other.from === edge.to && other.to === edge.from);
    return getRoute({ edge, ranks, rows, axes, arrowGap: request.arrowGap, usedLanes, backwardShift: isReturning ? (getSpan(edge, ranks).isBackward ? request.arrowGap : -request.arrowGap) : 0 });
  });
  const labelSpots = placeEdgeLabels({ request, ranks, lines, gaps, axes });
  return { boxes, routes: lines.map((points, index) => ({ points, labelAt: labelSpots[index] as InkPosition | null })) };
}

function getLayoutWidth({ boxes, routes }: GraphLayout, edges: readonly GraphEdge[]): number {
  const boxRight = Math.max(0, ...[...boxes.values()].map((box) => box.x + box.width));
  const lineSpots = routes.flatMap((route) => route.points.map((point) => point.x));
  const labelLeft = routes.flatMap((route) => (route.labelAt ? [route.labelAt.x] : []));
  const labelRight = routes.map((route, index) => (route.labelAt ? route.labelAt.x + (edges[index]?.label?.width ?? 0) : 0));
  return Math.max(boxRight, ...lineSpots, ...labelRight) - Math.min(0, ...lineSpots, ...labelLeft);
}

/** Layered, so no arrow runs through a box. A chain that fits runs across the board and anything else runs down it, and a rank wider than the board hands nodes on to the next rank. */
export function layoutGraph(request: GraphRequest): GraphLayout {
  const forward = getForwardEdges(request.nodes, request.edges);
  if (request.edges.length > 0) {
    const sideways = layOut(request, SIDEWAYS, getRanks(request, forward, true));
    if (getLayoutWidth(sideways, request.edges) <= request.maxWidth) return sideways;
  }
  return layOut(request, DOWN, getRanks(request, forward, false));
}
