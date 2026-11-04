import { type BoardElement, type BoardState, getMotionValue } from '@astra/board';
import { type Branch, createFigurePainter, createInkPainter, drawMark, type FigureMark, getMarkReach, type InkPainter, type InkStroke, type LabelRequest, type MarkBox, type MovingPlacement, placeLabels, type TermBoxes, type TermQuery, writeStyle } from '@astra/board/drawing';
import type { AnnotationMark, ElementRef } from '@astra/contracts';
import { type BoardItem, isFigure } from './boardItems';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FOCUS_DOT = { radius: 3.5, inset: 8 };
const NOTE_GAP = 3;
const BOARD_EDGE_ROOM = 2;

type MarkContent = Extract<BoardElement['content'], { kind: 'highlight' | 'annotate' }>;
type ReportedContent = MarkContent | Extract<BoardElement['content'], { kind: 'markValue' }>;

interface PaintedMark {
  group: SVGGElement;
  key: string;
  painter: InkPainter;
  strokes: readonly InkStroke[];
}

/** A mark with nothing to point at, so the tutor is talking about a ring the student cannot see. */
export interface MarkWithoutTarget {
  kind: 'markWithoutTarget';
  markId: string;
  target: string;
  tex?: string;
}

export interface MarksFrame {
  elements: readonly BoardElement[];
  focus: BoardState['focus'];
  placements: ReadonlyMap<string, MovingPlacement>;
  board: ReadonlyMap<string, BoardElement>;
  getItem(id: string): BoardItem | undefined;
  atMs: number;
  isReducedMotion: boolean;
  area: { width: number; height: number };
  onLabelWithoutRoom(text: string): void;
}

const getTargetParts = (target: ElementRef) => target.split('.') as [string, string | undefined];

const getPlacementKey = ({ id, placedAtMs }: BoardElement) => `${id}@${placedAtMs}`;

const isMark = (content: BoardElement['content']): content is MarkContent => content.kind === 'highlight' || content.kind === 'annotate';

const getMarkKind = (content: MarkContent): AnnotationMark => (content.kind === 'highlight' ? 'circle' : content.mark);

function getMarkQuery(content: MarkContent, part: string | undefined): TermQuery {
  if (content.kind === 'highlight' && content.tex !== undefined) return { tex: content.tex, occurrence: content.occurrence };
  return part === undefined ? null : { termId: part };
}

function getMarkBoxes(content: MarkContent, placement: MovingPlacement, item: BoardItem): TermBoxes {
  const [, part] = getTargetParts(content.target);
  if (item.getTermBoxes) return item.getTermBoxes(getMarkQuery(content, part));
  const isWholeElement = part === undefined && content.kind === 'annotate';
  return { from: null, to: isWholeElement || content.kind === 'highlight' ? { x: 0, y: 0, width: placement.width / placement.scale, height: placement.height / placement.scale } : null, flightOffset: { x: 0, y: 0 } };
}

function keepMarkOnBoard(mark: AnnotationMark, box: MarkBox, placement: MovingPlacement, area: MarksFrame['area']): MarkBox {
  if (placement.scale === 0) return box;
  const reach = getMarkReach(mark, box);
  const getOwnSpot = (onBoard: number, start: number) => (onBoard - start) / placement.scale;
  const left = Math.max(box.x, getOwnSpot(BOARD_EDGE_ROOM, placement.x) + reach.left);
  const top = Math.max(box.y, getOwnSpot(BOARD_EDGE_ROOM, placement.y) + reach.top);
  const right = Math.min(box.x + box.width, getOwnSpot(area.width - BOARD_EDGE_ROOM, placement.x) - reach.right);
  const bottom = Math.min(box.y + box.height, getOwnSpot(area.height - BOARD_EDGE_ROOM, placement.y) - reach.bottom);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

const isCrossFading = (boxes: TermBoxes, isReducedMotion: boolean) => isReducedMotion && boxes.from !== null && boxes.to !== null;

// With no motion allowed, a ring on a term in both trees leaves with the old tree and arrives with the new one, changing places while it cannot be seen.
function getMarkBox(boxes: TermBoxes, rearranged: number, isReducedMotion: boolean): MarkBox | null {
  if (isCrossFading(boxes, isReducedMotion) && rearranged < 1 / 2) return boxes.from;
  return boxes.to ?? boxes.from;
}

function getMarkOpacity({ boxes, drawn, rearranged, isReducedMotion }: { boxes: TermBoxes; drawn: number; rearranged: number; isReducedMotion: boolean }): number {
  const fade = isCrossFading(boxes, isReducedMotion) ? Math.abs(1 - 2 * rearranged) : boxes.to ? (boxes.from ? 1 : rearranged) : 1 - rearranged;
  return isReducedMotion ? Math.min(drawn, fade) : fade;
}

function createFocusDot(overlay: SVGSVGElement): SVGCircleElement {
  const dot = document.createElementNS(SVG_NAMESPACE, 'circle');
  dot.setAttribute('r', String(FOCUS_DOT.radius));
  dot.setAttribute('cx', String(FOCUS_DOT.inset));
  dot.classList.add('board-dot');
  writeStyle(dot, 'visibility', 'hidden');
  overlay.append(dot);
  return dot;
}

function getBoxOnBoard(box: MarkBox, { placement, move }: { placement: MovingPlacement; move: TermBoxes['flightOffset'] }): MarkBox {
  return { x: placement.x + (box.x + move.x) * placement.scale, y: placement.y + (box.y + move.y) * placement.scale, width: box.width * placement.scale, height: box.height * placement.scale };
}

function getNoteMarks(requests: readonly LabelRequest[], frame: MarksFrame, linesToClear: readonly Branch[]): FigureMark[] {
  const mustAvoid = [...frame.placements.values()].filter((placement) => placement.isVisible).map(({ x, y, width, height }) => ({ left: x, top: y, right: x + width, bottom: y + height }));
  return placeLabels(requests, { bounds: { left: 0, top: 0, right: frame.area.width, bottom: frame.area.height }, mustAvoid, shouldAvoid: [], linesToClear, onNoRoom: frame.onLabelWithoutRoom });
}

const getStrokesOnBoard = (strokes: readonly InkStroke[], { placement, move }: { placement: MovingPlacement; move: TermBoxes['flightOffset'] }): Branch[] => strokes.map(({ points }) => points.map(({ x, y }) => ({ x: placement.x + (x + move.x) * placement.scale, y: placement.y + (y + move.y) * placement.scale })));

// Marks follow the term they name through a rearrangement, and fade if it goes.
export function createBoardMarks(overlay: SVGSVGElement, onMarkWithoutTarget?: (problem: MarkWithoutTarget) => void) {
  const marks = new Map<string, PaintedMark>();
  const drawnOnce = new Set<string>();
  const reported = new Set<string>();
  const focusDot = createFocusDot(overlay);
  const noteGroup = document.createElementNS(SVG_NAMESPACE, 'g');
  noteGroup.classList.add('board-notes');
  overlay.append(noteGroup);
  const notePainter = createFigurePainter(noteGroup);

  // A mark that once had a box and lost it went with its term through a rearrangement, which is no problem.
  const reportIfNeverDrawn = (mark: BoardElement, content: ReportedContent) => {
    const placement = getPlacementKey(mark);
    if (drawnOnce.has(placement) || reported.has(placement)) return;
    reported.add(placement);
    const tex = content.kind === 'highlight' ? content.tex : undefined;
    onMarkWithoutTarget?.({ kind: 'markWithoutTarget', markId: mark.id, target: content.target, ...(tex === undefined ? {} : { tex }) });
  };

  const getPaintedMark = ({ id, kind, box, existing, isStudentMark }: { id: string; kind: AnnotationMark; box: MarkBox; existing: PaintedMark | undefined; isStudentMark: boolean }): PaintedMark => {
    const key = `${kind}|${box.x.toFixed(1)}|${box.y.toFixed(1)}|${box.width.toFixed(1)}|${box.height.toFixed(1)}`;
    if (existing?.key === key) return existing;
    existing?.painter.remove();
    const group = existing?.group ?? document.createElementNS(SVG_NAMESPACE, 'g');
    group.classList.toggle('board-mark-student', isStudentMark);
    if (!existing) noteGroup.before(group);
    const strokes = drawMark({ mark: kind, box, seed: id });
    const painted = { group, key, painter: createInkPainter(group, strokes), strokes };
    marks.set(id, painted);
    return painted;
  };

  const paintMark = (mark: BoardElement, content: MarkContent, frame: MarksFrame, inkLines: Branch[]) => {
    const [targetId] = getTargetParts(content.target);
    const placement = frame.placements.get(targetId);
    const item = frame.getItem(targetId);
    const boxes = placement && item ? getMarkBoxes(content, placement, item) : null;
    const target = frame.elements.find((element) => element.id === targetId);
    const isRearranging = Boolean(target?.morphFrom) && !item?.getRefusedTex?.();
    const rearranged = isRearranging && target ? getMotionValue(target.entrance, frame.atMs) : 1;
    const found = boxes && getMarkBox(boxes, rearranged, frame.isReducedMotion);
    const box = found && placement && keepMarkOnBoard(getMarkKind(content), found, placement, frame.area);
    if (!placement || !boxes || !box) {
      const existing = marks.get(mark.id);
      if (existing) writeStyle(existing.group, 'visibility', 'hidden');
      reportIfNeverDrawn(mark, content);
      return null;
    }
    drawnOnce.add(getPlacementKey(mark));
    const painted = getPaintedMark({ id: mark.id, kind: getMarkKind(content), box, existing: marks.get(mark.id), isStudentMark: mark.isStudentMark === true });
    const drawn = getMotionValue(mark.entrance, frame.atMs);
    const move = boxes.flightOffset;
    writeStyle(painted.group, 'visibility', placement.isVisible ? '' : 'hidden');
    writeStyle(painted.group, 'transform', `translate(${Math.round(placement.x)}px, ${Math.round(placement.y)}px) scale(${placement.scale.toFixed(4)}) translate(${move.x.toFixed(2)}px, ${move.y.toFixed(2)}px)`);
    const opacity = getMarkOpacity({ boxes, drawn, rearranged, isReducedMotion: frame.isReducedMotion });
    writeStyle(painted.group, 'opacity', opacity < 1 ? opacity.toFixed(3) : '');
    painted.painter.paint(frame.isReducedMotion && drawn > 0 ? 1 : drawn);
    if (placement.isVisible) inkLines.push(...getStrokesOnBoard(painted.strokes, { placement, move }));
    if (content.kind !== 'annotate' || !content.label || drawn < 1 || !placement.isVisible) return null;
    const onBoard = getBoxOnBoard(box, { placement, move });
    return { key: `note-${mark.id}`, text: content.label, anchor: { x: onBoard.x + onBoard.width / 2, y: onBoard.y + onBoard.height }, gap: NOTE_GAP, sides: ['below', 'below-right', 'below-left'], tone: 'ink' } satisfies LabelRequest;
  };

  const removeGone = (live: ReadonlySet<string>) => {
    for (const [id, painted] of marks) {
      if (live.has(id)) continue;
      painted.group.remove();
      marks.delete(id);
    }
  };

  const paintFocus = ({ focus, placements, elements }: MarksFrame) => {
    const [targetId, part] = focus ? getTargetParts(focus) : ['', undefined];
    const placement = placements.get(targetId);
    const isOnLine = placement?.isVisible === true && !(part !== undefined && isFigure(elements.find((element) => element.id === targetId)?.content));
    writeStyle(focusDot, 'visibility', isOnLine ? '' : 'hidden');
    const dotY = isOnLine ? String(Math.round(placement.y + placement.height / 2)) : null;
    if (dotY !== null && dotY !== focusDot.getAttribute('cy')) focusDot.setAttribute('cy', dotY);
  };

  return {
    reportMarkWithoutPart: (mark: BoardElement) => reportIfNeverDrawn(mark, mark.content as ReportedContent),
    noteMarkDrawn: (mark: BoardElement) => drawnOnce.add(getPlacementKey(mark)),
    paint(frame: MarksFrame) {
      const allMarks = frame.elements.filter((element) => {
        if (!isMark(element.content)) return false;
        const [targetId, part] = getTargetParts(element.content.target);
        return !(part !== undefined && isFigure(frame.board.get(targetId as never)?.content));
      });
      const onMath = allMarks.filter((element) => frame.getItem(getTargetParts((element.content as MarkContent).target)[0]));
      removeGone(new Set(onMath.map((element) => element.id as string)));
      const notes: LabelRequest[] = [];
      const inkLines: Branch[] = [];
      for (const mark of allMarks) {
        if (!onMath.includes(mark)) {
          reportIfNeverDrawn(mark, mark.content as MarkContent);
          continue;
        }
        const note = paintMark(mark, mark.content as MarkContent, frame, inkLines);
        if (note) notes.push(note);
      }
      notePainter.paint(getNoteMarks(notes, frame, inkLines));
      paintFocus(frame);
    },
  };
}
