import type { DrawShape, ElementId, SketchAnchor } from '@astra/contracts';
import type { Point } from '../figure/figure-marks.ts';
import type { BoardElement } from '../player/board-state.ts';
import { getMotionValue } from '../player/motion.ts';
import { getAnchorPoint, getDirection, getEdgeToward, PAD, type PieceBox, type PiecePose, restingPose, STROKE_LENGTHS, type StrokeCommand } from './sketch-layout.ts';

export type Elements = ReadonlyMap<ElementId, BoardElement>;

/** A motion's frame. `carries` is the turn riders take with it, so a load on a tipping plank tips too, while a rolling ball's spin is its own. */
export interface PieceFrame extends PiecePose {
  carries: number;
  /** A path a student should see traced, as a fall or an orbit is, and not a spin or a tip. */
  leavesTrail: boolean;
}

const MOST_RIDER_LEVELS = 8;

export const isPiece = (element: BoardElement | undefined): element is BoardElement & { content: DrawShape } => element?.content.kind === 'drawShape';

function getOwnFrame(element: BoardElement, atMs: number, isReducedMotion: boolean): PieceFrame | null {
  const placed = element.placedScene;
  if (!placed) return null;
  const seconds = isReducedMotion ? placed.playhead.to : getMotionValue(placed.playhead, atMs);
  return placed.scene.getFrame(seconds) as PieceFrame;
}

/** Where a solid piece is now: its own motion first, else carried by what it sits on, else where it was drawn. */
export function getPiecePose(elements: Elements, id: ElementId, atMs: number, isReducedMotion = false, depth = 0): PiecePose | null {
  const element = elements.get(id);
  const placed = element?.piece;
  if (!element || !placed) return null;
  const own = getOwnFrame(element, atMs, isReducedMotion);
  if (own) return own;
  const resting = restingPose(placed.box);
  const supportId = placed.restsOn;
  const support = supportId && depth < MOST_RIDER_LEVELS ? elements.get(supportId) : undefined;
  if (!support?.piece || !supportId) return resting;
  const supportPose = getPiecePose(elements, supportId, atMs, isReducedMotion, depth + 1);
  if (!supportPose) return resting;
  const turn = (getOwnFrame(support, atMs, isReducedMotion)?.carries ?? 0) + getCarriedTurn(elements, support, atMs, isReducedMotion, depth + 1);
  const from = { x: placed.box.x - support.piece.box.x, y: placed.box.y - support.piece.box.y };
  const turned = { x: from.x * Math.cos(turn) - from.y * Math.sin(turn), y: from.x * Math.sin(turn) + from.y * Math.cos(turn) };
  return { at: { x: supportPose.at.x + turned.x, y: supportPose.at.y + turned.y }, turn, scale: 1, opacity: 1 };
}

function getCarriedTurn(elements: Elements, element: BoardElement, atMs: number, isReducedMotion: boolean, depth: number): number {
  const supportId = element.piece?.restsOn;
  const support = supportId && depth < MOST_RIDER_LEVELS ? elements.get(supportId) : undefined;
  if (!support) return 0;
  return (getOwnFrame(support, atMs, isReducedMotion)?.carries ?? 0) + getCarriedTurn(elements, support, atMs, isReducedMotion, depth + 1);
}

const SPOT_POINTS: Record<string, Point> = {
  'top-left': { x: 2, y: 1.6 },
  top: { x: 6, y: 1.6 },
  'top-right': { x: 10, y: 1.6 },
  left: { x: 2, y: 4 },
  center: { x: 6, y: 4 },
  right: { x: 10, y: 4 },
  'bottom-left': { x: 2, y: PAD.floorY - 0.6 },
  bottom: { x: 6, y: PAD.floorY - 0.6 },
  'bottom-right': { x: 10, y: PAD.floorY - 0.6 },
};

interface EndPlace {
  point: Point;
  /** The piece the end sits on, when it names a piece with no anchor, so the line can stop at its edge. */
  edgeOf: { shape: string; box: PieceBox; pose: PiecePose } | null;
}

function getEndPlace(elements: Elements, end: string, atMs: number, isReducedMotion: boolean): EndPlace | null {
  const spot = SPOT_POINTS[end];
  if (spot) return { point: spot, edgeOf: null };
  const [pieceId, anchor] = end.split('.') as [ElementId, SketchAnchor | undefined];
  const element = elements.get(pieceId);
  if (!isPiece(element)) return null;
  if (!element.piece) {
    const points = getStrokePoints(elements, element.content as StrokeCommand, atMs, isReducedMotion);
    const point = anchor === 'left' || anchor === 'top' ? points[0] : points.at(-1);
    return point ? { point, edgeOf: null } : null;
  }
  const pose = getPiecePose(elements, pieceId, atMs, isReducedMotion) ?? restingPose(element.piece.box);
  if (anchor) return { point: getAnchorPoint(element.piece.box, pose, anchor), edgeOf: null };
  return { point: pose.at, edgeOf: { shape: element.content.shape, box: element.piece.box, pose } };
}

const toEdge = (end: EndPlace, toward: Point) => (end.edgeOf ? getEdgeToward(end.edgeOf.shape, end.edgeOf.box, end.edgeOf.pose, toward) : end.point);

/** The points a stroke runs through now, from the pieces it joins as they are this moment, so a string follows its bob. */
export function getStrokePoints(elements: Elements, piece: StrokeCommand, atMs: number, isReducedMotion: boolean): Point[] {
  if ('through' in piece) return piece.through.flatMap((end) => getEndPlace(elements, end, atMs, isReducedMotion)?.point ?? []);
  const length = 'toward' in piece ? STROKE_LENGTHS[piece.length ?? 'medium'] : 0;
  const direction = 'toward' in piece ? getDirection(piece.toward) : { x: 0, y: 0 };
  if ('from' in piece && 'to' in piece) {
    const from = getEndPlace(elements, piece.from, atMs, isReducedMotion);
    const to = getEndPlace(elements, piece.to, atMs, isReducedMotion);
    if (!from || !to) return [];
    return [toEdge(from, to.point), toEdge(to, from.point)];
  }
  if ('from' in piece) {
    const from = getEndPlace(elements, piece.from, atMs, isReducedMotion);
    if (!from) return [];
    const start = toEdge(from, { x: from.point.x + direction.x * 100, y: from.point.y + direction.y * 100 });
    return [start, { x: start.x + direction.x * length, y: start.y + direction.y * length }];
  }
  const to = getEndPlace(elements, piece.to, atMs, isReducedMotion);
  if (!to) return [];
  const end = toEdge(to, { x: to.point.x - direction.x * 100, y: to.point.y - direction.y * 100 });
  return [{ x: end.x - direction.x * length, y: end.y - direction.y * length }, end];
}

/** Every piece of one sketch, in the order they were drawn. */
export function getSketchPieces(elements: Elements, sketchId: ElementId): (BoardElement & { content: DrawShape })[] {
  return [...elements.values()].filter((element): element is BoardElement & { content: DrawShape } => isPiece(element) && element.content.target === sketchId);
}
