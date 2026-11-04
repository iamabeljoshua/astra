import type { InkPosition } from '../ink/ink-stroke.ts';
import type { MarkBox } from '../ink/marks.ts';

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

const getNode = (nodes: ReadonlyMap<string, GraphNode>, name: string) => nodes.get(name) as GraphNode;

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

interface Axes {
  across: 'x' | 'y';
  along: 'y' | 'x';
  acrossSize: 'width' | 'height';
  alongSize: 'height' | 'width';
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

function getCentreAcross(rows: readonly LaidSlot[][], name: string, ranks: ReadonlyMap<string, number>, axes: Axes): number {
  const slot = (rows[ranks.get(name) as number] as LaidSlot[]).find((candidate) => candidate.name === name) as LaidSlot;
  return slot.across + slot[axes.acrossSize] / 2;
}

interface PlacedLabel {
  edge: GraphEdge;
  rank: number;
  from: number;
  to: number;
  lane: number;
}

// Labels in one gap take the first lane where they clear the others, and the gap grows to hold its lanes.
function placeLabelsInGaps({ edges, ranks, rows, axes, request }: { edges: readonly GraphEdge[]; ranks: ReadonlyMap<string, number>; rows: readonly LaidSlot[][]; axes: Axes; request: GraphRequest }): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const edge of edges) {
    if (!edge.label) continue;
    const { fromRank } = getSpan(edge, ranks);
    const size = edge.label[axes.acrossSize];
    const middle = (getCentreAcross(rows, edge.from, ranks, axes) + getCentreAcross(rows, edge.to, ranks, axes)) / 2;
    const from = Math.max(0, middle - size / 2);
    const to = from + size;
    let lane = 0;
    while (placed.some((other) => other.rank === fromRank && other.lane === lane && from < other.to + LABEL_ROOM && other.from < to + LABEL_ROOM)) lane += 1;
    placed.push({ edge, rank: fromRank, from, to, lane });
  }
  return placed.length > 0 ? placed : [];
}

function getGapSizes({ labels, axes, rankCount, request }: { labels: readonly PlacedLabel[]; axes: Axes; rankCount: number; request: GraphRequest }): number[] {
  return Array.from({ length: Math.max(0, rankCount - 1) }, (_, rank) => {
    const inGap = labels.filter((label) => label.rank === rank);
    const laneCount = Math.max(0, ...inGap.map((label) => label.lane + 1));
    const laneSize = Math.max(0, ...inGap.map((label) => (label.edge.label as NonNullable<GraphEdge['label']>)[axes.alongSize]));
    return Math.max(request.smallestRankGap, laneCount * (laneSize + LABEL_ROOM) + 2 * request.arrowGap);
  });
}

function placeAlong(rows: LaidSlot[][], gaps: readonly number[], axes: Axes): void {
  let along = 0;
  rows.forEach((row, rank) => {
    const thickness = getRankThickness(row, axes);
    for (const slot of row) slot.along = along + (thickness - slot[axes.alongSize]) / 2;
    along += thickness + (gaps[rank] ?? 0);
  });
}

const toPoint = (axes: Axes, across: number, along: number): InkPosition => (axes === DOWN ? { x: across, y: along } : { x: along, y: across });

function takeLane(rows: readonly LaidSlot[][], rank: number, used: Set<LaidSlot>): LaidSlot {
  const lane = (rows[rank] as LaidSlot[]).find((slot) => slot.name === null && !used.has(slot)) as LaidSlot;
  used.add(lane);
  return lane;
}

function getRoute({ edge, ranks, rows, axes, arrowGap, usedLanes, backwardShift }: { edge: GraphEdge; ranks: ReadonlyMap<string, number>; rows: readonly LaidSlot[][]; axes: Axes; arrowGap: number; usedLanes: Set<LaidSlot>; backwardShift: number }): InkPosition[] {
  const { fromRank, toRank, isBackward } = getSpan(edge, ranks);
  const [topName, bottomName] = isBackward ? [edge.to, edge.from] : [edge.from, edge.to];
  const top = (rows[fromRank] as LaidSlot[]).find((slot) => slot.name === topName) as LaidSlot;
  const bottom = (rows[toRank] as LaidSlot[]).find((slot) => slot.name === bottomName) as LaidSlot;
  const centre = (slot: LaidSlot) => slot.across + slot[axes.acrossSize] / 2 + backwardShift;
  const points = [toPoint(axes, centre(top), top.along + top[axes.alongSize] + arrowGap)];
  for (let rank = fromRank + 1; rank < toRank; rank += 1) {
    const lane = takeLane(rows, rank, usedLanes);
    points.push(toPoint(axes, centre(lane), lane.along + lane[axes.alongSize] / 2));
  }
  points.push(toPoint(axes, centre(bottom), bottom.along - arrowGap));
  return isBackward ? points.reverse() : points;
}

function getLabelSpot(label: PlacedLabel, { rows, gaps, axes }: { rows: readonly LaidSlot[][]; gaps: readonly number[]; axes: Axes }): InkPosition {
  const row = rows[label.rank] as LaidSlot[];
  const rankEnd = Math.max(0, ...row.map((slot) => slot.along + slot[axes.alongSize]));
  const size = (label.edge.label as NonNullable<GraphEdge['label']>)[axes.alongSize];
  const laneTotal = (size + LABEL_ROOM) * (label.lane + 1);
  const along = rankEnd + ((gaps[label.rank] ?? 0) - laneTotal) / 2 + label.lane * (size + LABEL_ROOM);
  return toPoint(axes, label.from, along);
}

function layOut(request: GraphRequest, axes: Axes, ranks: ReadonlyMap<string, number>): GraphLayout {
  const rows = placeAcross(getSlots(request, ranks), axes, request.nodeGap);
  const labels = placeLabelsInGaps({ edges: request.edges, ranks, rows, axes, request });
  const gaps = getGapSizes({ labels, axes, rankCount: rows.length, request });
  placeAlong(rows, gaps, axes);
  const usedLanes = new Set<LaidSlot>();
  const slots = rows.flat();
  const boxes = new Map(slots.flatMap((slot) => (slot.name === null ? [] : [[slot.name, { ...toPoint(axes, slot.across, slot.along), width: slot.width, height: slot.height }] as const])));
  const routes = request.edges.map((edge): GraphRoute => {
    const isReturning = request.edges.some((other) => other !== edge && other.from === edge.to && other.to === edge.from);
    const label = labels.find((candidate) => candidate.edge === edge);
    return { points: getRoute({ edge, ranks, rows, axes, arrowGap: request.arrowGap, usedLanes, backwardShift: isReturning ? (getSpan(edge, ranks).isBackward ? request.arrowGap : -request.arrowGap) : 0 }), labelAt: label ? getLabelSpot(label, { rows, gaps, axes }) : null };
  });
  return { boxes, routes };
}

function getLayoutWidth({ boxes, routes }: GraphLayout, edges: readonly GraphEdge[]): number {
  const boxRight = Math.max(0, ...[...boxes.values()].map((box) => box.x + box.width));
  const laneRight = Math.max(0, ...routes.flatMap((route) => route.points.map((point) => point.x)));
  const labelRight = Math.max(0, ...routes.map((route, index) => (route.labelAt ? route.labelAt.x + (edges[index]?.label?.width ?? 0) : 0)));
  return Math.max(boxRight, laneRight, labelRight);
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
