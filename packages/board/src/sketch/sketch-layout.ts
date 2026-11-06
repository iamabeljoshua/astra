import type { DrawShape, ElementId, SketchAnchor, SketchDirection, SketchGap, SketchSide, SketchSize, SketchSpot, SketchStroke } from '@astra/contracts';
import type { Point } from '../figure/figure-marks.ts';
import { STAMP_SHEETS, type StampName } from './stamp-sheets.ts';

export const PAD = { width: 12, height: 8, floorY: 7.4, metresPerSquare: 4 / 12 } as const;

export interface PieceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedPiece {
  box: PieceBox;
  restsOn: ElementId | null;
}

export type StrokeCommand = Extract<DrawShape, { shape: SketchStroke | 'curve' }>;
type SolidCommand = Exclude<DrawShape, StrokeCommand>;

const SIZE_SHARE: Record<SketchSize, number> = { small: 0.6, medium: 1, large: 1.7 };
const MEDIUM_SIZES: Record<string, { width: number; height: number }> = {
  ball: { width: 1, height: 1 },
  dot: { width: 0.35, height: 0.35 },
  box: { width: 2, height: 1.4 },
  bar: { width: 7, height: 0.3 },
  triangle: { width: 1.6, height: 1.4 },
  phase: { width: 1.4, height: 1.4 },
};
const STAMP_LONGEST_SIDE = 3.2;
const LABEL = { height: 0.6, squaresPerCharacter: 0.3 };
const GAPS: Record<SketchGap, number> = { none: 0, near: 0.5, far: 2 };
const SPOT_COLUMNS = [2, 6, 10];
const SPOT_ROWS = [1.6, 4];
const EDGE_ROOM = 0.15;
const AUTO_SPOTS: readonly SketchSpot[] = ['center', 'left', 'right', 'top', 'top-left', 'top-right', 'bottom', 'bottom-left', 'bottom-right'];
export const STROKE_LENGTHS = { short: 1.3, medium: 2.2, long: 3.4 } as const;

const DIRECTIONS: Record<SketchDirection, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  'up-left': { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  'up-right': { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  'down-left': { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  'down-right': { x: Math.SQRT1_2, y: Math.SQRT1_2 },
};

export const getDirection = (direction: SketchDirection): Point => DIRECTIONS[direction];

export const isStamp = (shape: string): shape is StampName => Object.hasOwn(STAMP_SHEETS, shape);

export function getSolidSize(piece: SolidCommand): { width: number; height: number } {
  if (piece.shape === 'label') return { width: Math.max(1, piece.text.length * LABEL.squaresPerCharacter), height: LABEL.height };
  if (piece.shape === 'ground') return { width: PAD.width, height: 0 };
  const share = SIZE_SHARE['size' in piece && piece.size ? piece.size : 'medium'];
  if (isStamp(piece.shape)) {
    const { height } = STAMP_SHEETS[piece.shape];
    const scale = (STAMP_LONGEST_SIDE * share) / Math.max(100, height);
    return { width: 100 * scale, height: height * scale };
  }
  const medium = MEDIUM_SIZES[piece.shape] ?? { width: 1, height: 1 };
  return { width: medium.width * share, height: medium.height * share };
}

const getLeft = (box: PieceBox) => box.x - box.width / 2;
const getRight = (box: PieceBox) => box.x + box.width / 2;
const getTop = (box: PieceBox) => box.y - box.height / 2;
const getBottom = (box: PieceBox) => box.y + box.height / 2;

export function getSurfaceY(support: { shape: string; box: PieceBox }, x: number): number {
  const { box, shape } = support;
  if (!isStamp(shape)) return getTop(box);
  const sheet = STAMP_SHEETS[shape];
  const scale = box.width / 100;
  const local = (x - getLeft(box)) / scale;
  const points = sheet.surface;
  const after = points.findIndex((point) => point.x >= local);
  const right = points[Math.max(0, after)] ?? points.at(-1);
  const left = points[Math.max(0, (after < 0 ? points.length : after) - 1)] ?? right;
  if (!left || !right) return getTop(box);
  const share = right.x === left.x ? 0 : (local - left.x) / (right.x - left.x);
  return getTop(box) + (left.y + (right.y - left.y) * Math.min(1, Math.max(0, share))) * scale;
}

function getAlongX(box: PieceBox, width: number, side: SketchSide | undefined): number {
  if (side === 'left') return getLeft(box) + width / 2;
  if (side === 'right') return getRight(box) - width / 2;
  return box.x;
}

function getSpotCenter(spot: SketchSpot, size: { width: number; height: number }): Point {
  const column = spot.endsWith('left') ? 0 : spot.endsWith('right') ? 2 : 1;
  if (spot.startsWith('bottom')) return { x: SPOT_COLUMNS[column] as number, y: PAD.floorY - size.height / 2 };
  return { x: SPOT_COLUMNS[column] as number, y: SPOT_ROWS[spot.startsWith('top') ? 0 : 1] as number };
}

const overlaps = (first: PieceBox, second: PieceBox) => Math.abs(first.x - second.x) * 2 < first.width + second.width && Math.abs(first.y - second.y) * 2 < first.height + second.height;

function keepInside(box: PieceBox): PieceBox {
  const halfWidth = Math.min(box.width, PAD.width - 2 * EDGE_ROOM) / 2;
  const halfHeight = Math.min(box.height, PAD.height - 2 * EDGE_ROOM) / 2;
  return { ...box, x: Math.min(PAD.width - EDGE_ROOM - halfWidth, Math.max(EDGE_ROOM + halfWidth, box.x)), y: Math.min(PAD.height - EDGE_ROOM - halfHeight, Math.max(EDGE_ROOM + halfHeight, box.y)) };
}

export interface EarlierPiece {
  shape: string;
  box: PieceBox;
}

export function placeSolid(piece: SolidCommand, earlier: ReadonlyMap<string, EarlierPiece>): PlacedPiece {
  const size = getSolidSize(piece);
  if (piece.shape === 'ground') return { box: { x: PAD.width / 2, y: PAD.floorY, ...size }, restsOn: null };
  const at = (center: Point, restsOn: ElementId | null = null): PlacedPiece => ({ box: keepInside({ ...center, ...size }), restsOn });
  if ('on' in piece) {
    const support = earlier.get(piece.on);
    if (!support) return at({ x: PAD.width / 2, y: PAD.floorY - size.height / 2 });
    const x = getAlongX(support.box, size.width, piece.side);
    return at({ x, y: getSurfaceY(support, x) - size.height / 2 }, piece.on);
  }
  if ('above' in piece || 'below' in piece) {
    const isAbove = 'above' in piece;
    const other = earlier.get(isAbove ? piece.above : piece.below);
    if (!other) return at(getSpotCenter('center', size));
    const gap = GAPS[piece.gap ?? 'near'];
    const x = getAlongX(other.box, size.width, piece.side);
    return at({ x, y: isAbove ? getTop(other.box) - gap - size.height / 2 : getBottom(other.box) + gap + size.height / 2 });
  }
  if ('leftOf' in piece || 'rightOf' in piece) {
    const isLeft = 'leftOf' in piece;
    const other = earlier.get(isLeft ? piece.leftOf : piece.rightOf);
    if (!other) return at(getSpotCenter('center', size));
    const gap = GAPS[piece.gap ?? 'near'];
    const restsOnFloor = Math.abs(getBottom(other.box) - PAD.floorY) < 0.05;
    const y = restsOnFloor ? PAD.floorY - size.height / 2 : other.box.y;
    return at({ x: isLeft ? getLeft(other.box) - gap - size.width / 2 : getRight(other.box) + gap + size.width / 2, y });
  }
  if ('inside' in piece) {
    const other = earlier.get(piece.inside);
    if (!other) return at(getSpotCenter('center', size));
    const shrink = Math.min(1, (other.box.width * 0.7) / size.width, (other.box.height * 0.7) / size.height);
    return { box: { x: other.box.x, y: other.box.y, width: size.width * shrink, height: size.height * shrink }, restsOn: null };
  }
  if ('at' in piece && piece.at) return at(getSpotCenter(piece.at, size));
  const taken = [...earlier.values()].map(({ box }) => box);
  const free = AUTO_SPOTS.find((spot) => !taken.some((box) => overlaps(box, { ...getSpotCenter(spot, size), ...size })));
  return at(getSpotCenter(free ?? 'center', size));
}

const ANCHOR_OFFSETS: Record<SketchAnchor, Point> = {
  center: { x: 0, y: 0 },
  top: { x: 0, y: -0.5 },
  bottom: { x: 0, y: 0.5 },
  left: { x: -0.5, y: 0 },
  right: { x: 0.5, y: 0 },
  'top-left': { x: -0.5, y: -0.5 },
  'top-right': { x: 0.5, y: -0.5 },
  'bottom-left': { x: -0.5, y: 0.5 },
  'bottom-right': { x: 0.5, y: 0.5 },
};

export interface PiecePose {
  at: Point;
  turn: number;
  scale: number;
  opacity: number;
}

export const restingPose = (box: PieceBox): PiecePose => ({ at: { x: box.x, y: box.y }, turn: 0, scale: 1, opacity: 1 });

const rotate = (point: Point, turn: number): Point => ({ x: point.x * Math.cos(turn) - point.y * Math.sin(turn), y: point.x * Math.sin(turn) + point.y * Math.cos(turn) });

export function getPosedPoint(box: PieceBox, pose: PiecePose, local: Point): Point {
  const turned = rotate({ x: local.x * pose.scale, y: local.y * pose.scale }, pose.turn);
  return { x: pose.at.x + turned.x, y: pose.at.y + turned.y };
}

export function getAnchorPoint(box: PieceBox, pose: PiecePose, anchor: SketchAnchor): Point {
  const offset = ANCHOR_OFFSETS[anchor];
  return getPosedPoint(box, pose, { x: offset.x * box.width, y: offset.y * box.height });
}

export function getEdgeToward(shape: string, box: PieceBox, pose: PiecePose, toward: Point): Point {
  const dx = toward.x - pose.at.x;
  const dy = toward.y - pose.at.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9 || shape === 'dot') return pose.at;
  const ux = dx / distance;
  const uy = dy / distance;
  if (shape === 'ball' || shape === 'phase' || shape === 'sun') {
    const radius = (Math.min(box.width, box.height) / 2) * pose.scale;
    return { x: pose.at.x + ux * radius, y: pose.at.y + uy * radius };
  }
  const local = rotate({ x: ux, y: uy }, -pose.turn);
  const reach = Math.min(Math.abs(local.x) > 1e-9 ? (box.width * pose.scale) / 2 / Math.abs(local.x) : Infinity, Math.abs(local.y) > 1e-9 ? (box.height * pose.scale) / 2 / Math.abs(local.y) : Infinity);
  return { x: pose.at.x + ux * reach, y: pose.at.y + uy * reach };
}

export const getBoxEdges = (box: PieceBox) => ({ left: getLeft(box), right: getRight(box), top: getTop(box), bottom: getBottom(box) });
