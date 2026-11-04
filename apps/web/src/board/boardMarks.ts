import { type BoardElement, type BoardState, getMotionValue } from '@astra/board';
import { createInkPainter, drawMark, type InkPainter, type MarkBox, type MovingPlacement, type TermBoxes, type TermQuery, writeStyle } from '@astra/board/drawing';
import type { AnnotationMark, ElementRef } from '@astra/contracts';
import type { BoardItem } from './boardItems';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FOCUS_DOT = { radius: 3.5, inset: 8 };

type MarkContent = Extract<BoardElement['content'], { kind: 'highlight' | 'annotate' }>;

interface PaintedMark {
  group: SVGGElement;
  key: string;
  painter: InkPainter;
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
  getItem(id: string): BoardItem | undefined;
  atMs: number;
  isReducedMotion: boolean;
}

const getTargetParts = (target: ElementRef) => target.split('.') as [string, string | undefined];

const isMark = (content: BoardElement['content']): content is MarkContent => content.kind === 'highlight' || content.kind === 'annotate';

const NOTE_FONT_SIZE = 18;
const NOTE_GAP = 44;

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

// Marks follow the term they name through a rearrangement, and fade if it goes.
export function createBoardMarks(overlay: SVGSVGElement, onMarkWithoutTarget?: (problem: MarkWithoutTarget) => void) {
  const marks = new Map<string, PaintedMark>();
  const drawnOnce = new Set<string>();
  const reported = new Set<string>();
  const focusDot = createFocusDot(overlay);

  // A mark that once had a box and lost it went with its term through a rearrangement, which is no problem. A scene draws its own marks.
  const reportIfNeverDrawn = (mark: BoardElement, content: MarkContent, frame: MarksFrame) => {
    const isOnScene = frame.elements.find((element) => element.id === getTargetParts(content.target)[0])?.content.kind === 'simulate';
    if (drawnOnce.has(mark.id) || reported.has(mark.id) || isOnScene) return;
    reported.add(mark.id);
    const tex = content.kind === 'highlight' ? content.tex : undefined;
    onMarkWithoutTarget?.({ kind: 'markWithoutTarget', markId: mark.id, target: content.target, ...(tex === undefined ? {} : { tex }) });
  };

  const getPaintedMark = ({ id, kind, box, existing, isStudents }: { id: string; kind: AnnotationMark; box: MarkBox; existing: PaintedMark | undefined; isStudents: boolean }): PaintedMark => {
    const key = `${kind}|${box.x.toFixed(1)}|${box.y.toFixed(1)}|${box.width.toFixed(1)}|${box.height.toFixed(1)}`;
    if (existing?.key === key) return existing;
    existing?.painter.remove();
    const group = existing?.group ?? document.createElementNS(SVG_NAMESPACE, 'g');
    group.classList.toggle('board-mark-student', isStudents);
    if (!existing) overlay.append(group);
    const painted = { group, key, painter: createInkPainter(group, drawMark({ mark: kind, box, seed: id })) };
    marks.set(id, painted);
    return painted;
  };

  const paintMark = (mark: BoardElement, content: MarkContent, frame: MarksFrame) => {
    const [targetId] = getTargetParts(content.target);
    const placement = frame.placements.get(targetId);
    const item = frame.getItem(targetId);
    const boxes = placement && item ? getMarkBoxes(content, placement, item) : null;
    const target = frame.elements.find((element) => element.id === targetId);
    const isRearranging = Boolean(target?.morphFrom) && !item?.getRefusedTex?.();
    const rearranged = isRearranging && target ? getMotionValue(target.entrance, frame.atMs) : 1;
    const box = boxes && getMarkBox(boxes, rearranged, frame.isReducedMotion);
    if (!placement || !boxes || !box) {
      const existing = marks.get(mark.id);
      if (existing) writeStyle(existing.group, 'visibility', 'hidden');
      reportIfNeverDrawn(mark, content, frame);
      return;
    }
    drawnOnce.add(mark.id);
    const painted = getPaintedMark({ id: mark.id, kind: getMarkKind(content), box, existing: marks.get(mark.id), isStudents: mark.isStudents === true });
    const drawn = getMotionValue(mark.entrance, frame.atMs);
    const move = boxes.flightOffset;
    writeStyle(painted.group, 'visibility', placement.isVisible ? '' : 'hidden');
    writeStyle(painted.group, 'transform', `translate(${Math.round(placement.x)}px, ${Math.round(placement.y)}px) scale(${placement.scale.toFixed(4)}) translate(${move.x.toFixed(2)}px, ${move.y.toFixed(2)}px)`);
    const opacity = getMarkOpacity({ boxes, drawn, rearranged, isReducedMotion: frame.isReducedMotion });
    writeStyle(painted.group, 'opacity', opacity < 1 ? opacity.toFixed(3) : '');
    painted.painter.paint(frame.isReducedMotion && drawn > 0 ? 1 : drawn);
  };

  const notes = new Map<string, SVGTextElement>();

  // Text nodes only, so a note has no way to become markup. It sits to the right of its line, or under it if there is no room.
  const paintNote = (element: BoardElement, frame: MarksFrame, boardWidth: number) => {
    if (element.content.kind !== 'note') return;
    const placement = frame.placements.get(element.content.target);
    let note = notes.get(element.id);
    if (!note) {
      note = document.createElementNS(SVG_NAMESPACE, 'text');
      note.classList.add('board-note');
      note.setAttribute('font-size', String(NOTE_FONT_SIZE));
      note.textContent = element.content.text;
      overlay.append(note);
      notes.set(element.id, note);
    }
    writeStyle(note, 'visibility', placement?.isVisible ? '' : 'hidden');
    if (!placement) return;
    const width = note.getComputedTextLength();
    const fitsBeside = placement.x + placement.width + NOTE_GAP + width <= boardWidth;
    note.setAttribute('x', String(Math.round(fitsBeside ? placement.x + placement.width + NOTE_GAP : placement.x)));
    note.setAttribute('y', String(Math.round(fitsBeside ? placement.y + NOTE_FONT_SIZE : placement.y + placement.height - NOTE_FONT_SIZE / 3)));
    writeStyle(note, 'opacity', frame.isReducedMotion ? '' : getMotionValue(element.entrance, frame.atMs).toFixed(3));
  };

  const paintNotes = (frame: MarksFrame) => {
    const live = frame.elements.filter((element) => element.content.kind === 'note');
    for (const [id, note] of notes) {
      if (live.some((element) => element.id === id)) continue;
      note.remove();
      notes.delete(id);
    }
    const boardWidth = overlay.clientWidth || overlay.getBoundingClientRect().width;
    for (const element of live) paintNote(element, frame, boardWidth);
  };

  const removeGone = (live: ReadonlySet<string>) => {
    for (const [id, painted] of marks) {
      if (live.has(id)) continue;
      painted.group.remove();
      marks.delete(id);
    }
  };

  const paintFocus = ({ focus, placements, elements }: MarksFrame) => {
    const targetId = focus ? getTargetParts(focus)[0] : '';
    const placement = placements.get(targetId);
    const target = elements.find((element) => element.id === targetId);
    const isOnLine = placement?.isVisible === true && target?.content.kind !== 'simulate';
    writeStyle(focusDot, 'visibility', isOnLine ? '' : 'hidden');
    const dotY = isOnLine ? String(Math.round(placement.y + placement.height / 2)) : null;
    if (dotY !== null && dotY !== focusDot.getAttribute('cy')) focusDot.setAttribute('cy', dotY);
  };

  return {
    paint(frame: MarksFrame) {
      const allMarks = frame.elements.filter((element) => isMark(element.content));
      const onMath = allMarks.filter((element) => frame.getItem(getTargetParts((element.content as MarkContent).target)[0]));
      removeGone(new Set(onMath.map((element) => element.id as string)));
      for (const mark of allMarks) {
        if (onMath.includes(mark)) paintMark(mark, mark.content as MarkContent, frame);
        else reportIfNeverDrawn(mark, mark.content as MarkContent, frame);
      }
      paintNotes(frame);
      paintFocus(frame);
    },
  };
}
