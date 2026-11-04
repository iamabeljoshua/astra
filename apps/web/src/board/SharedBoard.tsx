import type { BoardElement, BoardState, StudentLineContent } from '@astra/board';
import { canWriteByHand, preloadMathFonts, writeStyle } from '@astra/board/drawing';
import type { StudentWork } from '@astra/contracts';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { MarkWithoutTarget } from './boardMarks';
import { createBoardRowPainting } from './boardRowPainting';
import { type BoardRow, getBoardRows } from './boardRows';
import { GutterMark } from './GutterMark';
import { type PickTarget, PickTargets } from './PickTargets';
import { PlaceTask } from './PlaceTask';
import { LineParts, ReadAs } from './StudentLine';
import { useReducedMotion } from './useReducedMotion';

interface SharedBoardProps {
  board: BoardState;
  atMs: number;
  /** Set on a live board, so the student can act on what is open. A replay shows the work and takes none. */
  onWork?: (work: StudentWork) => void;
  onMarkProblem?: (problem: MarkWithoutTarget) => void;
  /** The line being typed, as the board's next row. */
  liveRow?: ReactNode;
  flowRef?: (flow: HTMLDivElement | null) => void;
}

function getRowClass({ element, isStruck }: BoardRow): string {
  const { content } = element;
  const owner = content.kind === 'studentLine' ? `board-row-student ${content.reading.kind === 'math' ? '' : 'board-row-words'}` : content.kind === 'writeMath' || content.kind === 'text' ? 'board-row-tutor' : '';
  return `board-row ${owner} ${isStruck ? 'board-row-struck' : ''}`;
}

function RowContent({ element, onWork }: { element: BoardElement; onWork?: (work: StudentWork) => void }) {
  const { content } = element;
  if (content.kind === 'studentLine') return content.reading.kind === 'math' ? null : <LineParts reading={content.reading} />;
  if (content.kind === 'task' && content.way === 'place') return <PlaceTask task={content} progress={element.progress} onWork={onWork} />;
  if (content.kind === 'text' && !(content.handwritten && canWriteByHand(content.text))) return <p className="m-0 wrap-anywhere">{content.text}</p>;
  return null;
}

function RowGutter({ row, atMs, isReducedMotion }: { row: BoardRow; atMs: number; isReducedMotion: boolean }) {
  const { element, marks, notes } = row;
  const line = element.content.kind === 'studentLine' ? (element.content as StudentLineContent) : null;
  return (
    <div className="board-row-gutter">
      {marks.map((mark) => <GutterMark key={mark.id} element={mark} atMs={atMs} isReducedMotion={isReducedMotion} />)}
      {notes.map((note) => note.content.kind === 'note' && <span key={note.id} data-testid="board-note" className="board-row-note">{note.content.text}</span>)}
      {line && <ReadAs reading={line.reading} typed={line.text} />}
    </div>
  );
}

// The board as lines on a page: a row for each thing written, with its marks and notes in a gutter beside it, and the line being typed as the next row.
export function SharedBoard({ board, atMs, onWork, onMarkProblem, liveRow, flowRef }: SharedBoardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const wrappers = useRef(new Map<string, HTMLElement>());
  const painting = useRef<ReturnType<typeof createBoardRowPainting> | null>(null);
  const problemListener = useRef(onMarkProblem);
  const pickTargets = useRef(new Map<string, PickTarget>());
  const isReducedMotion = useReducedMotion();
  const rows = getBoardRows(board);
  const rowCount = rows.length;

  const setPickTarget = useCallback((part: string, target: PickTarget | null) => {
    if (target) pickTargets.current.set(part, target);
    else pickTargets.current.delete(part);
  }, []);

  useEffect(() => {
    void preloadMathFonts();
  }, []);

  useLayoutEffect(() => {
    problemListener.current = onMarkProblem;
    if (!overlayRef.current) return;
    painting.current ??= createBoardRowPainting({ overlay: overlayRef.current, getWrapper: (id) => wrappers.current.get(id), onMarkProblem: (problem) => problemListener.current?.(problem) });
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
      <div ref={scrollRef} className="board-scroll">
        <div ref={flowRef} className="board-flow">
          {rows.map((row) => (
            <div key={`${row.element.id}:${row.element.content.kind}`} data-row={row.element.id} className={getRowClass(row)}>
              <div className="board-row-content">
                <div
                  data-element={row.element.id}
                  className="board-row-wrapper"
                  ref={(wrapper) => {
                    if (wrapper) wrappers.current.set(row.element.id, wrapper);
                    else wrappers.current.delete(row.element.id);
                  }}
                >
                  <RowContent element={row.element} onWork={onWork} />
                </div>
              </div>
              <RowGutter row={row} atMs={atMs} isReducedMotion={isReducedMotion} />
            </div>
          ))}
          {liveRow}
          <svg ref={overlayRef} aria-hidden="true" className="board-ink board-marks pointer-events-none absolute inset-0 h-full w-full overflow-visible" />
          {onWork && <PickTargets board={board} onTarget={setPickTarget} onWork={onWork} />}
        </div>
      </div>
    </div>
  );
}
