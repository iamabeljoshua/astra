export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type MarkTone = 'ink' | 'ink-2' | 'line';
export type MarkWeight = 'hair' | 'thin' | 'bold';
export type TextAnchor = 'start' | 'middle';
export type Branch = readonly Point[];

/** One thing a figure paints, in the figure's own pixels. A key names it across frames, so an unchanged mark writes nothing to the page. */
export type FigureMark =
  | { kind: 'path'; key: string; branches: readonly Branch[]; tone: MarkTone; weight: MarkWeight; isDashed?: boolean }
  | { kind: 'area'; key: string; polygons: readonly Branch[]; tone: MarkTone }
  | { kind: 'dot'; key: string; at: Point; radius: number; tone: MarkTone; isHollow?: boolean }
  | { kind: 'text'; key: string; at: Point; lines: readonly string[]; anchor: TextAnchor; tone: MarkTone };

export const getDistance = (first: Point, second: Point) => Math.hypot(second.x - first.x, second.y - first.y);

export const interpolate = (from: number, to: number, share: number) => from + (to - from) * share;

export const interpolatePoint = (from: Point, to: Point, share: number): Point => ({ x: interpolate(from.x, to.x, share), y: interpolate(from.y, to.y, share) });

export function doBoxesOverlap(first: Box, second: Box): boolean {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
}

export function isBoxInside(box: Box, bounds: Box): boolean {
  return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
}

const ARROW_HEAD = { length: 9, spread: 0.45 };

/** A shaft and a head that opens back from the tip. */
export function getArrowBranches(from: Point, to: Point): Branch[] {
  if (getDistance(from, to) < 1) return [];
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const getBarb = (side: number): Point => ({ x: to.x - Math.cos(angle + side * ARROW_HEAD.spread) * ARROW_HEAD.length, y: to.y - Math.sin(angle + side * ARROW_HEAD.spread) * ARROW_HEAD.length });
  return [[from, to], [getBarb(1), to, getBarb(-1)]];
}

/** The start of a line, by the share of its length, so a stroke draws at one speed around its bends. */
export function getLeadingShare(points: Branch, share: number): Branch {
  if (share >= 1) return points;
  if (share <= 0 || points.length < 2) return [];
  const lengths = points.slice(1).map((point, index) => getDistance(points[index] as Point, point));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * share;
  const kept: Point[] = [points[0] as Point];
  for (const [index, length] of lengths.entries()) {
    const next = points[index + 1] as Point;
    if (length >= remaining) return [...kept, interpolatePoint(points[index] as Point, next, length === 0 ? 1 : remaining / length)];
    remaining -= length;
    kept.push(next);
  }
  return kept;
}

function clipSegment(first: Point, second: Point, box: Box): [Point, Point] | null {
  let enter = 0;
  let leave = 1;
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  const edges = [[-deltaX, first.x - box.left], [deltaX, box.right - first.x], [-deltaY, first.y - box.top], [deltaY, box.bottom - first.y]] as const;
  for (const [direction, room] of edges) {
    if (direction === 0 && room < 0) return null;
    if (direction === 0) continue;
    const crossing = room / direction;
    if (direction < 0) enter = Math.max(enter, crossing);
    else leave = Math.min(leave, crossing);
    if (enter > leave) return null;
  }
  return [interpolatePoint(first, second, enter), interpolatePoint(first, second, leave)];
}

/** Cuts a line at a box, so what leaves is gone rather than drawn along the edge. */
export function clipBranch(points: Branch, box: Box): Branch[] {
  const branches: Point[][] = [];
  let current: Point[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const clipped = clipSegment(points[index - 1] as Point, points[index] as Point, box);
    if (!clipped) {
      if (current.length > 1) branches.push(current);
      current = [];
      continue;
    }
    if (current.length === 0 || getDistance(current.at(-1) as Point, clipped[0]) > 0) {
      if (current.length > 1) branches.push(current);
      current = [clipped[0]];
    }
    current.push(clipped[1]);
  }
  if (current.length > 1) branches.push(current);
  return branches;
}
