import type { BoardState, StudentLineContent } from '@astra/board';
import { canWriteByHand, preloadMathFonts, writeStyle } from '@astra/board/drawing';
import { getOpenDragOn } from '@astra/board/shared';
import { type ElementId, getInkLineId, type StudentWork } from '@astra/contracts';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { BoardProblem } from './boardPainting';
import { createBoardRowPainting } from './boardRowPainting';
import { type BoardRow, getBoardRows } from './boardRows';
import { BOARD_WORK_LABELS } from '../strings';
import { DragSurface } from './DragSurface';
import { GutterMark } from './GutterMark';
import { InkLine } from './InkLine';
import { type PickTarget, PickTargets } from './PickTargets';
import { PlaceTask } from './PlaceTask';
import { LineParts, ReadAs } from './StudentLine';
import { useReducedMotion } from './useReducedMotion';

interface SharedBoardProps {
  board: BoardState;
  atMs: number;
  onWork?: (work: StudentWork, startedMsAgo?: number) => void;
  onMovePoint?: (task: ElementId, x: number) => void;
  onBoardProblem?: (problem: BoardProblem) => void;
  liveRow?: ReactNode;
  lineInTheBand?: string | null;
  onFixReading?: (text: string) => void;
  /** Said where the board has nothing on it, because an empty panel on the dark theme reads as a broken black box. */
  emptyNote?: string;
}

const getRowId = ({ element }: BoardRow) => getInkLineId(element.id) ?? (element.id as string);

// A handwritten line keeps its key through the reading, so its strokes do not flicker.
const getRowKey = (row: BoardRow) => (row.inks.length > 0 ? `ink:${getRowId(row)}` : `${row.element.id}:${row.element.content.kind}`);

function getRowClass({ element, isStruck, inks }: BoardRow): string {
  const { content } = element;
  const owner = content.kind === 'studentLine' ? `board-row-student ${content.reading.kind === 'math' ? '' : 'board-row-words'}` : content.kind === 'writeMath' || content.kind === 'text' ? 'board-row-tutor' : '';
  return `board-row ${owner} ${inks.length > 0 ? 'board-row-ink' : ''} ${isStruck ? 'board-row-struck' : ''}`;
}

const isMathInReadAs = ({ inks, element }: BoardRow) => inks.length > 0 && element.math !== null;

function RowContent({ row, onWork }: { row: BoardRow; onWork?: (work: StudentWork) => void }) {
  const { element, inks } = row;
  const { content } = element;
  if (inks.length > 0) return <InkLine strokes={inks.flatMap(({ content: ink }) => (ink.kind === 'ink' ? [ink.points] : []))} />;
  if (content.kind === 'studentLine') return content.reading.kind === 'math' ? null : <LineParts reading={content.reading} />;
  if (content.kind === 'task' && content.way === 'place') return <PlaceTask task={content} progress={element.progress} onWork={onWork} />;
  if (content.kind === 'text' && !(content.handwritten && canWriteByHand(content.text))) return <p className="m-0 wrap-anywhere">{content.text}</p>;
  return null;
}

function RowGutter({ row, atMs, isReducedMotion, onFixReading, setWrapper }: { row: BoardRow; atMs: number; isReducedMotion: boolean; onFixReading?: (text: string) => void; setWrapper: (wrapper: HTMLElement | null) => void }) {
  const { element, marks, notes, isBeingRead } = row;
  const line = element.content.kind === 'studentLine' ? (element.content as StudentLineContent) : null;
  return (
    <div className="board-row-gutter">
      {marks.map((mark) => <GutterMark key={mark.id} element={mark} atMs={atMs} isReducedMotion={isReducedMotion} />)}
      {notes.map((note) => note.content.kind === 'note' && <span key={note.id} data-testid="board-note" className="board-row-note">{note.content.text}</span>)}
      {isBeingRead && <span data-testid="ink-reading" className="board-read-as-label board-read-as">{BOARD_WORK_LABELS.reading}</span>}
      {line && <ReadAs reading={line.reading} typed={line.isInk ? undefined : line.text} showsParts={line.isInk} isHeard={line.isHeard} mathHolder={isMathInReadAs(row) ? <span data-element={element.id} ref={setWrapper} className="board-read-as-math" /> : null} onFix={(line.isInk || line.isHeard) && onFixReading ? () => onFixReading(line.text) : undefined} />}
    </div>
  );
}

// The board as lines on a page, with each row's marks and notes in a gutter beside it.
export function SharedBoard({ board, atMs, onWork, onMovePoint, onBoardProblem, liveRow, lineInTheBand = null, onFixReading, emptyNote }: SharedBoardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const wrappers = useRef(new Map<string, HTMLElement>());
  const painting = useRef<ReturnType<typeof createBoardRowPainting> | null>(null);
  const problemListener = useRef(onBoardProblem);
  const pickTargets = useRef(new Map<string, PickTarget>());
  const isReducedMotion = useReducedMotion();
  const rows = getBoardRows(board).filter(({ element, isBeingRead }) => !(isBeingRead && getInkLineId(element.id) === lineInTheBand));
  const rowCount = rows.length;

  const setWrapper = useCallback((id: string, wrapper: HTMLElement | null) => {
    if (wrapper) wrappers.current.set(id, wrapper);
    else wrappers.current.delete(id);
  }, []);

  const setPickTarget = useCallback((part: string, target: PickTarget | null) => {
    if (target) pickTargets.current.set(part, target);
    else pickTargets.current.delete(part);
  }, []);

  useEffect(() => {
    void preloadMathFonts();
  }, []);

  useLayoutEffect(() => {
    problemListener.current = onBoardProblem;
    if (!overlayRef.current) return;
    painting.current ??= createBoardRowPainting({ overlay: overlayRef.current, getWrapper: (id) => wrappers.current.get(id), onBoardProblem: (problem) => problemListener.current?.(problem) });
    painting.current.paint({ board, atMs, isReducedMotion });
    for (const { button, query, on } of pickTargets.current.values()) {
      const box = painting.current.getPartBox(on, query);
      writeStyle(button, 'display', box ? '' : 'none');
      if (!box) continue;
      writeStyle(button, 'transform', `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`);
      button.style.width = `${Math.ceil(box.width)}px`;
      button.style.height = `${Math.ceil(box.height)}px`;
    }
  });

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [rowCount]);

  return (
    <div className="board-panel" data-testid="board">
      {emptyNote && rowCount === 0 && <p data-testid="board-empty" className="label pointer-events-none absolute inset-0 flex items-center justify-center text-ink-2">{emptyNote}</p>}
      <div ref={scrollRef} className="board-scroll">
        <div className="board-flow">
          {rows.map((row) => {
            const openDrag = onWork && onMovePoint ? getOpenDragOn(board, row.element.id) : null;
            return (
            <div key={getRowKey(row)} data-row={getRowId(row)} className={getRowClass(row)}>
              <div className="board-row-content">
                <div
                  {...(isMathInReadAs(row) ? {} : { 'data-element': row.element.id })}
                  className="board-row-wrapper"
                  ref={isMathInReadAs(row) ? undefined : (wrapper) => setWrapper(row.element.id, wrapper)}
                >
                  <RowContent row={row} onWork={onWork} />
                </div>
                {openDrag && onWork && onMovePoint && <DragSurface plot={row.element} task={openDrag} atMs={atMs} isReducedMotion={isReducedMotion} onMovePoint={(x) => onMovePoint(openDrag.id, x)} onWork={onWork} />}
              </div>
              <RowGutter row={row} atMs={atMs} isReducedMotion={isReducedMotion} onFixReading={onFixReading} setWrapper={(wrapper) => setWrapper(row.element.id, wrapper)} />
            </div>
            );
          })}
          {liveRow}
          <svg ref={overlayRef} aria-hidden="true" className="board-ink board-marks pointer-events-none absolute inset-0 h-full w-full overflow-visible" />
          {onWork && <PickTargets board={board} onTarget={setPickTarget} onWork={onWork} />}
        </div>
      </div>
    </div>
  );
}
