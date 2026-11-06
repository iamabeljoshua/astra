import { type DrawShape, type ElementId, isSketchLine } from '@astra/contracts';
import { type FigureFrame, getAttachedElements, getDrawnShare, getPartMark } from '../figure/figure-input.ts';
import { addLabel, addPartMark, createFigureDraft, type FigureDraft, finishFigure } from '../figure/figure-draft.ts';
import { type Branch, type FigureMark, getDistance, getLeadingShare, type MarkTone, type Point } from '../figure/figure-marks.ts';
import { writeByHand } from '../ink/handwriting.ts';
import { makeSeededRandom } from '../ink/ink-stroke.ts';
import type { BoardElement } from '../player/board-state.ts';
import { getMotionValue } from '../player/motion.ts';
import { getArrowHead, getBracket, getCurveThrough, getPenLine, getPenPolygon, getPenRing, getSpring, getWave } from './sketch-ink.ts';
import { getPosedPoint, isStamp, PAD, type PieceBox, type PiecePose, restingPose, type StrokeCommand } from './sketch-layout.ts';
import { getPiecePose, getStrokePoints, isPiece, type PieceFrame } from './sketch-pieces.ts';
import { STAMP_SHEETS } from './stamp-sheets.ts';

const MARGIN = 10;
const HATCH = { spacingPx: 4.5, stepPx: 1.5, inset: 1.5 };
const GROUND_HATCH = { every: 0.55, reach: 0.3 };
const TRAIL_STEPS = 48;
const LABEL_EMS = 0.8;
const PEN_RING_ROOM = 6;
const CURVED_ARROW_BEND = 0.28;
const WAVE_HEIGHT = 0.22;
const SPRING = { width: 0.28, squaresPerCoil: 0.35 };
const BRACKET_DEPTH = 0.32;

type Piece = BoardElement & { content: DrawShape };

interface SketchView {
  scale: number;
  toPixel(point: Point): Point;
}

function getView(width: number, height: number): SketchView {
  const scale = Math.min((width - 2 * MARGIN) / PAD.width, (height - 2 * MARGIN) / PAD.height);
  const left = (width - PAD.width * scale) / 2;
  const top = (height - PAD.height * scale) / 2;
  return { scale, toPixel: ({ x, y }) => ({ x: left + x * scale, y: top + y * scale }) };
}

/** How much of each stroke is drawn when `share` of the piece is, so the pen moves at one speed through all of them. */
function getDrawnBranches(branches: readonly Branch[], share: number): Branch[] {
  if (share >= 1) return [...branches];
  const lengths = branches.map((branch) => branch.slice(1).reduce((sum, point, index) => sum + getDistance(branch[index] as Point, point), 0));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, share);
  return branches.flatMap((branch, index) => {
    const length = lengths[index] as number;
    const drawn = length === 0 ? (remaining > 0 ? 1 : 0) : Math.min(1, remaining / length);
    remaining = Math.max(0, remaining - length);
    return drawn > 0 ? [getLeadingShare(branch, drawn)] : [];
  });
}

/** Short slanted lines filling the part of a disc `isShaded` picks, the way a teacher shades a dark side. */
function getHatching(center: Point, radius: number, isShaded: (local: Point) => boolean): Branch[] {
  const lines: Branch[] = [];
  const inner = radius - HATCH.inset;
  for (let offset = -inner * 1.5; offset <= inner * 1.5; offset += HATCH.spacingPx) {
    let run: Point[] = [];
    for (let along = -inner * 1.5; along <= inner * 1.5; along += HATCH.stepPx) {
      const local = { x: (along + offset) * Math.SQRT1_2, y: (along - offset) * Math.SQRT1_2 };
      if (Math.hypot(local.x, local.y) <= inner && isShaded(local)) run.push({ x: center.x + local.x, y: center.y + local.y });
      else if (run.length > 0) {
        if (run.length > 1) lines.push(run);
        run = [];
      }
    }
    if (run.length > 1) lines.push(run);
  }
  return lines;
}

/** The dark part of a moon as seen from `viewer`: its phase angle sets how far the shadow's edge reaches across the disc. */
function getPhaseShading(elements: FigureFrame['board']['elements'], phase: Extract<DrawShape, { shape: 'phase' }>, frame: FigureFrame): ((local: Point) => boolean) | null {
  const moon = elements.get(phase.of);
  const lightId = moon && isPiece(moon) && moon.content.shape === 'ball' ? moon.content.lit : undefined;
  const moonPose = getPiecePose(elements, phase.of, frame.atMs, frame.isReducedMotion);
  const viewerPose = getPiecePose(elements, phase.seenFrom, frame.atMs, frame.isReducedMotion);
  const lightPose = lightId ? getPiecePose(elements, lightId, frame.atMs, frame.isReducedMotion) : null;
  if (!moonPose || !viewerPose || !lightPose) return null;
  const toLight = { x: lightPose.at.x - moonPose.at.x, y: lightPose.at.y - moonPose.at.y };
  const toViewer = { x: viewerPose.at.x - moonPose.at.x, y: viewerPose.at.y - moonPose.at.y };
  const phaseAngle = Math.atan2(toLight.x * toViewer.y - toLight.y * toViewer.x, toLight.x * toViewer.x + toLight.y * toViewer.y);
  const facing = { x: -toViewer.x, y: -toViewer.y };
  const isLitOnRight = -toLight.x * facing.y + toLight.y * facing.x > 0;
  const reach = -Math.cos(Math.abs(phaseAngle));
  return ({ x, y }) => {
    const across = isLitOnRight ? x : -x;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    return across < reach * radius;
  };
}

function getStampBranches(shape: string, box: PieceBox): Branch[] {
  if (!isStamp(shape)) return [];
  const sheet = STAMP_SHEETS[shape];
  const scale = box.width / 100;
  return sheet.strokes.map((stroke) => stroke.map((point) => ({ x: (point.x - 50) * scale, y: (point.y - sheet.height / 2) * scale })));
}

/** A solid's strokes around its own centre, in squares, before it is moved to where it is now. */
function getSolidBranches(piece: Piece, box: PieceBox): Branch[] {
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const corners = [{ x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight }, { x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight }];
  switch (piece.content.shape) {
    case 'box':
    case 'bar':
      return [[...corners, corners[0] as Point]];
    case 'triangle':
      return [[{ x: 0, y: -halfHeight }, { x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight }, { x: 0, y: -halfHeight }]];
    default:
      return getStampBranches(piece.content.shape, box);
  }
}

const MOST_POLYGON_CORNERS = 5;

/** Straight sides get a hand's drift. A stamp's curves are already drawn by hand, so they stay as they are. */
function toPenStrokes(branches: readonly Branch[], random: () => number): Branch[] {
  return branches.map((branch) => {
    if (branch.length === 2) return getPenLine(branch[0] as Point, branch[1] as Point, random);
    const isPolygon = branch.length <= MOST_POLYGON_CORNERS && getDistance(branch[0] as Point, branch.at(-1) as Point) < 1;
    return isPolygon ? getPenPolygon(branch.slice(0, -1), random) : branch;
  });
}

function getStrokeBranches(piece: Piece, points: readonly Point[], scale: number): Branch[] {
  const [from, to] = [points[0], points.at(-1)];
  if (!from || !to) return [];
  switch (piece.content.shape) {
    case 'line':
      return [[from, to]];
    case 'arrow':
      return [[from, to], getArrowHead([from, to])];
    case 'curvedArrow': {
      const middle = { x: (from.x + to.x) / 2 - (to.y - from.y) * CURVED_ARROW_BEND, y: (from.y + to.y) / 2 + (to.x - from.x) * CURVED_ARROW_BEND };
      const curve = getCurveThrough([from, middle, to]);
      return [curve, getArrowHead(curve)];
    }
    case 'wave':
      return [getWave(from, to, { height: WAVE_HEIGHT * scale, cycles: Math.max(2, Math.round(getDistance(from, to) / scale / 0.9)) })];
    case 'spring':
      return [getSpring(from, to, { width: SPRING.width * scale, coils: Math.max(3, Math.round(getDistance(from, to) / scale / SPRING.squaresPerCoil)) })];
    case 'bracket':
      return [getBracket(from, to, BRACKET_DEPTH * scale)];
    default:
      return [getCurveThrough(points)];
  }
}

function getOwnFrame(element: BoardElement, frame: FigureFrame): PieceFrame | null {
  const placed = element.placedScene;
  if (!placed) return null;
  return placed.scene.getFrame(frame.isReducedMotion ? placed.playhead.to : getMotionValue(placed.playhead, frame.atMs)) as PieceFrame;
}

function getTrail(element: BoardElement, frame: FigureFrame, view: SketchView): Branch {
  const placed = element.placedScene;
  if (!placed) return [];
  const now = frame.isReducedMotion ? placed.playhead.to : getMotionValue(placed.playhead, frame.atMs);
  return Array.from({ length: TRAIL_STEPS + 1 }, (_, step) => view.toPixel((placed.scene.getFrame((step / TRAIL_STEPS) * now) as PieceFrame).at));
}

function turnAbout(points: readonly Point[], turn: number): Point[] {
  const [origin] = points;
  if (!origin || turn === 0) return [...points];
  return points.map((point) => ({ x: origin.x + (point.x - origin.x) * Math.cos(turn) - (point.y - origin.y) * Math.sin(turn), y: origin.y + (point.x - origin.x) * Math.sin(turn) + (point.y - origin.y) * Math.cos(turn) }));
}

function scaleAbout(branches: readonly Branch[], origin: Point, scale: number): Branch[] {
  if (scale === 1) return [...branches];
  return branches.map((branch) => branch.map((point) => ({ x: origin.x + (point.x - origin.x) * scale, y: origin.y + (point.y - origin.y) * scale })));
}

interface Drawn {
  center: Point;
  radius: number;
}

function addSolid(draft: FigureDraft, piece: Piece & { piece: NonNullable<BoardElement['piece']> }, { frame, view, tone, share }: { frame: FigureFrame; view: SketchView; tone: MarkTone; share: number }): Drawn {
  const { board } = frame;
  const { box } = piece.piece;
  const pose: PiecePose = getPiecePose(board.elements, piece.id, frame.atMs, frame.isReducedMotion) ?? restingPose(box);
  const random = makeSeededRandom(piece.id);
  const center = view.toPixel(pose.at);
  const radius = (Math.max(box.width, box.height) / 2) * view.scale * pose.scale;
  const opacity = pose.opacity < 1 ? pose.opacity : undefined;
  if (piece.content.shape === 'dot') {
    draft.marks.push({ kind: 'dot', key: `piece-${piece.id}`, at: center, radius: Math.max(3, radius) * Math.min(1, share * 2), tone });
    return { center, radius };
  }
  if (piece.content.shape === 'ground') {
    const y = view.toPixel({ x: 0, y: PAD.floorY }).y;
    const hatches = Array.from({ length: Math.floor(PAD.width / GROUND_HATCH.every) }, (_, index) => {
      const x = view.toPixel({ x: (index + 0.5) * GROUND_HATCH.every, y: PAD.floorY }).x;
      return [{ x, y }, { x: x - GROUND_HATCH.reach * view.scale, y: y + GROUND_HATCH.reach * view.scale }];
    });
    const branches = [getPenLine(view.toPixel({ x: 0.1, y: PAD.floorY }), view.toPixel({ x: PAD.width - 0.1, y: PAD.floorY }), random), ...hatches];
    draft.marks.push({ kind: 'path', key: `piece-${piece.id}`, tone, weight: 'thin', branches: getDrawnBranches(branches, share) });
    return { center: { x: center.x, y }, radius: 0 };
  }
  if (piece.content.shape === 'label') {
    const fontSize = LABEL_EMS * view.scale;
    const written = writeByHand({ text: piece.content.text, fontSize, maxWidth: PAD.width * view.scale, seed: piece.id });
    if (!written) {
      if (share >= 1) draft.marks.push({ kind: 'text', key: `piece-${piece.id}`, at: center, lines: [piece.content.text], anchor: 'middle', tone });
      return { center, radius: 0 };
    }
    const origin = { x: center.x - written.width / 2, y: center.y - written.height / 2 };
    const branches = written.strokes.map((stroke) => stroke.points.map((point) => ({ x: origin.x + point.x, y: origin.y + point.y })));
    draft.marks.push({ kind: 'path', key: `piece-${piece.id}`, tone, weight: 'thin', branches: getDrawnBranches(branches, share), opacity });
    return { center, radius: Math.max(written.width, written.height) / 2 };
  }
  const isRound = piece.content.shape === 'ball' || piece.content.shape === 'phase';
  const local = isRound ? [getPenRing(center, (box.width / 2) * view.scale * pose.scale, random)] : toPenStrokes(getSolidBranches(piece, box).map((branch) => branch.map((point) => view.toPixel(getPosedPoint(box, pose, point)))), random);
  draft.marks.push({ kind: 'path', key: `piece-${piece.id}`, tone, weight: 'bold', branches: getDrawnBranches(local, share), opacity });
  const shading = getShading(board.elements, piece, frame, pose);
  if (shading && share >= 1) draft.marks.push({ kind: 'path', key: `shade-${piece.id}`, tone, weight: 'hair', branches: getHatching(center, radius, shading), opacity });
  return { center, radius };
}

function getShading(elements: FigureFrame['board']['elements'], piece: Piece, frame: FigureFrame, pose: PiecePose): ((local: Point) => boolean) | null {
  const { content } = piece;
  if (content.shape === 'phase') return getPhaseShading(elements, content, frame);
  if (content.shape !== 'ball' || !content.lit) return null;
  const light = getPiecePose(elements, content.lit, frame.atMs, frame.isReducedMotion);
  if (!light) return null;
  const toLight = { x: light.at.x - pose.at.x, y: light.at.y - pose.at.y };
  return ({ x, y }) => x * toLight.x + y * toLight.y < 0;
}

function addStroke(draft: FigureDraft, piece: Piece & { content: StrokeCommand }, { frame, view, tone, share }: { frame: FigureFrame; view: SketchView; tone: MarkTone; share: number }): Drawn | null {
  const look = getOwnFrame(piece, frame);
  const points = turnAbout(getStrokePoints(frame.board.elements, piece.content, frame.atMs, frame.isReducedMotion).map(view.toPixel), look?.turn ?? 0);
  if (points.length < 2) return null;
  const random = makeSeededRandom(piece.id);
  const branches = scaleAbout(getStrokeBranches(piece, points, view.scale), points[0] as Point, look?.scale ?? 1).map((branch) => (branch.length === 2 ? getPenLine(branch[0] as Point, branch[1] as Point, random) : branch));
  draft.marks.push({ kind: 'path', key: `piece-${piece.id}`, tone, weight: 'bold', branches: getDrawnBranches(branches, share), opacity: look && look.opacity < 1 ? look.opacity : undefined });
  const tip = branches[0]?.at(-1) ?? (points.at(-1) as Point);
  return { center: tip, radius: 4 };
}

function addOnPiece(draft: FigureDraft, mark: BoardElement, drawn: Drawn, frame: FigureFrame): void {
  const share = getDrawnShare(mark, frame);
  const partMark = getPartMark(mark) ?? (mark.content.kind === 'annotate' ? { mark: mark.content.mark, label: mark.content.label } : mark.content.kind === 'highlight' ? { mark: 'circle' as const } : null);
  if (!partMark) return;
  frame.onMarkDrawn?.(mark);
  if (partMark.mark !== 'circle') {
    addPartMark(draft, { key: `note-${mark.id}`, at: drawn.center, share, ...partMark });
    return;
  }
  const ring = getPenRing(drawn.center, drawn.radius + PEN_RING_ROOM, makeSeededRandom(mark.id));
  draft.marks.push({ kind: 'path', key: `note-${mark.id}`, tone: 'pen', weight: 'thin', branches: [getLeadingShare(ring, share)] });
  if (partMark.label && share >= 1) addLabel(draft, { key: `note-${mark.id}-label`, text: partMark.label, anchor: drawn.center, gap: drawn.radius + PEN_RING_ROOM + 4, tone: 'pen' });
}

/** Everything a sketch shows at this moment, from the board alone, so a live board, a replay, and a seek draw the same picture. */
export function getSketchMarks(frame: FigureFrame): FigureMark[] {
  const draft = createFigureDraft(frame.width, frame.height);
  const view = getView(frame.width, frame.height);
  const attached = getAttachedElements(frame.board, frame.element.id);
  const drawnPieces = new Map<ElementId, Drawn>();
  for (const element of attached) {
    if (!isPiece(element)) continue;
    const tone: MarkTone = element.content.pen ? 'pen' : 'ink';
    const share = getDrawnShare(element, frame);
    if (getOwnFrame(element, frame)?.leavesTrail && share >= 1) draft.marks.push({ kind: 'path', key: `trail-${element.id}`, tone: 'pen', weight: 'thin', isDashed: true, branches: [getTrail(element, frame, view)] });
    const { content } = element;
    const drawn = isSketchLine(content) ? addStroke(draft, { ...element, content }, { frame, view, tone, share }) : element.piece ? addSolid(draft, { ...element, piece: element.piece }, { frame, view, tone, share }) : null;
    if (!drawn) continue;
    drawnPieces.set(element.id, drawn);
    if (element.content.label && share >= 1) addLabel(draft, { key: `label-${element.id}`, text: element.content.label, anchor: drawn.center, gap: drawn.radius + 5, tone });
  }
  for (const element of attached) {
    const target = 'target' in element.content ? (element.content.target.split('.')[0] as ElementId) : null;
    const drawn = target ? drawnPieces.get(target) : undefined;
    if (drawn && !isPiece(element)) addOnPiece(draft, element, drawn, frame);
  }
  const focused = frame.board.focus ? drawnPieces.get(frame.board.focus.split('.')[0] as ElementId) : undefined;
  if (focused) draft.marks.push({ kind: 'dot', key: 'focus-dot', at: { x: focused.center.x, y: focused.center.y - focused.radius - 9 }, radius: 3.5, tone: 'pen' });
  return finishFigure(draft, frame.onLabelWithoutRoom);
}
