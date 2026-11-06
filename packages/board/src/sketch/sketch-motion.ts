import { type Animate, type DrawShape, type ElementId, isSketchLine } from '@astra/contracts';
import type { BoardElement } from '../player/board-state.ts';
import type { Point } from '../figure/figure-marks.ts';
import type { Scene } from '../player/scene.ts';
import { getAlongPath, getFallPath, getOrbitPath, getRollOffPath, getSpinPath, getSwingPath, getTiltPath, type SketchPath } from './sketch-paths.ts';
import { getAnchorPoint, getBoxEdges, PAD, type PiecePose, type PlacedPiece, restingPose } from './sketch-layout.ts';
import { type Elements, getPiecePose, getSketchPieces, getStrokePoints, isPiece, type PieceFrame } from './sketch-pieces.ts';

/** Squares a second squared, from real gravity at the sketch's own scale. */
export const SKETCH_GRAVITY = 9.8 / PAD.metresPerSquare;
const SWING_RADIANS = (25 * Math.PI) / 180;
const SECONDS = { orbitTurn: 6, spinTurn: 1.6, tilt: 1.2, grow: 0.8, pulse: 1.2, fade: 0.8, alongSquaresPerSecond: 3 };
const LONGEST_TILT_RADIANS = (50 * Math.PI) / 180;
const LAND_SHARE_OF_ROOM = 0.55;
/** A line has no place of its own, so it turns about its first end and changes how it looks from where it is. */
const STILL: PiecePose = { at: { x: 0, y: 0 }, turn: 0, scale: 1, opacity: 1 };

type Motion = Animate extends infer Each ? (Each extends Animate ? Each : never) : never;

const asFrames = (path: SketchPath, start: PiecePose, { carries = false, leavesTrail = true }: { carries?: boolean; leavesTrail?: boolean } = {}): Scene<PieceFrame> => ({
  parts: [],
  moments: path.moments,
  durationSeconds: path.durationSeconds,
  getFrame(seconds) {
    const { at, turn } = path.getPoint(seconds);
    return { at, turn: start.turn + turn, scale: start.scale, opacity: start.opacity, carries: carries ? turn : 0, leavesTrail };
  },
});

function getLook(start: PiecePose, durationSeconds: number, look: (share: number) => { scale: number; opacity: number }): Scene<PieceFrame> {
  return {
    parts: [],
    moments: { done: durationSeconds },
    durationSeconds,
    getFrame(seconds) {
      const share = Math.min(1, Math.max(0, seconds / durationSeconds));
      const { scale, opacity } = look(share);
      return { ...start, scale: start.scale * scale, opacity: start.opacity * opacity, carries: 0, leavesTrail: false };
    },
  };
}

/** The floor under a point: the top of the highest piece below it there, or the ground. */
function getFloorBelow(elements: Elements, sketchId: ElementId, point: Point, except: ElementId): number {
  const below = getSketchPieces(elements, sketchId).flatMap((element) => {
    if (element.id === except || !element.piece || element.content.shape === 'label') return [];
    const edges = getBoxEdges(element.piece.box);
    return point.x >= edges.left && point.x <= edges.right && edges.top >= point.y ? [edges.top] : [];
  });
  return Math.min(PAD.floorY, ...below);
}

function getRollOff(elements: Elements, id: ElementId, start: PiecePose): Scene<PieceFrame> | null {
  const element = elements.get(id);
  const supportId = element?.piece?.restsOn;
  const support = supportId ? elements.get(supportId) : undefined;
  if (!element?.piece || !support?.piece || !isPiece(element)) return null;
  const edges = getBoxEdges(support.piece.box);
  const goesRight = PAD.width - edges.right >= edges.left;
  const radius = element.piece.box.height / 2;
  const edgeX = goesRight ? edges.right : edges.left;
  const room = goesRight ? PAD.width - edgeX : edgeX;
  const floorY = getFloorBelow(elements, element.content.target, { x: edgeX + (goesRight ? radius * 2 : -radius * 2), y: start.at.y }, id);
  const path = getRollOffPath({ start: start.at, edgeX, floorY, radius, landsAfter: Math.max(radius * 2, room * LAND_SHARE_OF_ROOM), gravity: SKETCH_GRAVITY });
  return asFrames(path, start);
}

function getTilt(elements: Elements, id: ElementId, start: PiecePose, motion: Extract<Motion, { motion: 'tilt' }>): Scene<PieceFrame> | null {
  const bar = elements.get(id)?.piece;
  const fulcrum = elements.get(motion.around)?.piece;
  if (!bar || !fulcrum) return null;
  const pivot = getAnchorPoint(fulcrum.box, getPiecePose(elements, motion.around, 0) ?? restingPose(fulcrum.box), 'top');
  const isRight = motion.toward === 'right';
  const corner = getAnchorPoint(bar.box, start, isRight ? 'bottom-right' : 'bottom-left');
  const reach = Math.hypot(corner.x - pivot.x, corner.y - pivot.y);
  const startAngle = Math.atan2(corner.y - pivot.y, corner.x - pivot.x);
  const reachDown = Math.asin(Math.min(1, (PAD.floorY - pivot.y) / reach));
  const touchingAngle = isRight ? reachDown : Math.PI - reachDown;
  const radians = Math.max(-LONGEST_TILT_RADIANS, Math.min(LONGEST_TILT_RADIANS, Math.atan2(Math.sin(touchingAngle - startAngle), Math.cos(touchingAngle - startAngle))));
  return asFrames(getTiltPath({ start: start.at, pivot, radians, seconds: SECONDS.tilt }), start, { carries: true, leavesTrail: false });
}

/** Works out a piece's motion from where everything is now and real physics, so the model names the motion and never the numbers. */
export function createPieceMotion(elements: Elements, command: Animate, atMs: number): Scene<PieceFrame> | null {
  const element = elements.get(command.target);
  if (!isPiece(element)) return null;
  const start = element.piece ? (getPiecePose(elements, command.target, atMs) ?? restingPose(element.piece.box)) : STILL;
  switch (command.motion) {
    case 'grow':
      return getLook(start, SECONDS.grow, (share) => ({ scale: 1 + 0.5 * (0.5 - Math.cos(Math.PI * share) / 2), opacity: 1 }));
    case 'pulse':
      return getLook(start, SECONDS.pulse, (share) => ({ scale: 1 + 0.22 * Math.sin(share * 2 * Math.PI) ** 2, opacity: 1 }));
    case 'fade':
      return getLook(start, SECONDS.fade, (share) => ({ scale: 1, opacity: 1 - 0.85 * share }));
    case 'spin':
      return asFrames(getSpinPath({ start: start.at, turns: command.turns ?? 1, secondsPerTurn: SECONDS.spinTurn }), start, { leavesTrail: false });
    default:
      return element.piece ? getPath(elements, { ...element, piece: element.piece }, command, start, atMs) : null;
  }
}

function getPath(elements: Elements, element: BoardElement & { content: DrawShape; piece: PlacedPiece }, command: Exclude<Motion, { motion: 'grow' | 'pulse' | 'fade' | 'spin' }>, start: PiecePose, atMs: number): Scene<PieceFrame> | null {
  const radius = element.piece.box.height / 2;
  const sketchId = element.content.target;
  switch (command.motion) {
    case 'rollOff':
      return getRollOff(elements, command.target, start);
    case 'fall':
      return asFrames(getFallPath({ start: start.at, floorY: getFloorBelow(elements, sketchId, { x: start.at.x, y: start.at.y + radius }, command.target), radius, gravity: SKETCH_GRAVITY }), start);
    case 'along': {
      const path = elements.get(command.path);
      if (!isPiece(path) || !isSketchLine(path.content)) return null;
      const points = getStrokePoints(elements, path.content, atMs, false);
      return points.length < 2 ? null : asFrames(getAlongPath({ points, speed: SECONDS.alongSquaresPerSecond }), start);
    }
    case 'orbit': {
      const center = getPiecePose(elements, command.around, atMs);
      return center ? asFrames(getOrbitPath({ start: start.at, center: center.at, turns: command.turns ?? 1, secondsPerTurn: SECONDS.orbitTurn }), start) : null;
    }
    case 'swing': {
      const pivot = getPiecePose(elements, command.around, atMs);
      return pivot ? asFrames(getSwingPath({ start: start.at, pivot: pivot.at, amplitudeRadians: SWING_RADIANS, swings: command.swings ?? 2, gravity: SKETCH_GRAVITY }), start) : null;
    }
    case 'tilt':
      return getTilt(elements, command.target, start, command);
  }
}
