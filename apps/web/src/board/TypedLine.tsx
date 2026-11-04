import { getOpenTaskOnBoard, readLine, checkWorkOnBoard } from '@astra/board/shared';
import type { BoardState } from '@astra/board';
import type { ElementId, StudentWork } from '@astra/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_WORK_LABELS } from '../strings';
import { LineParts, ReadAs } from './StudentLine';

/** How long a finished right line waits before it goes on the board by itself. */
const RIGHT_LINE_LANDS_AFTER_MS = 2200;
const LOOKS_WITH_DRAFT_SECONDS = [3, 6, 10, 15, 25];
const LOOKS_WITH_NO_DRAFT_SECONDS = [10, 20, 30, 45, 60, 90];

interface TypedLineProps {
  getBoard(): BoardState;
  onWork(work: StudentWork): void;
  onPause(seconds: number, draft?: string): void;
  /** Bumped by the board when the student acts another way, so the pause clock starts again. */
  activity: number;
}

function useNextLineId(getBoard: () => BoardState) {
  const count = useRef(0);
  return useCallback(() => {
    const { elements } = getBoard();
    do count.current += 1;
    while (elements.has(`s${count.current}` as ElementId));
    return `s${count.current}` as ElementId;
  }, [getBoard]);
}

// The plain keyboard entry on the board. It reads the line as it is typed, so the student sees what code will see, and it tells the agent only about a pause.
export function TypedLine({ getBoard, onWork, onPause, activity }: TypedLineProps) {
  const [text, setText] = useState('');
  const [isRaw, setIsRaw] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextLineId = useNextLineId(getBoard);
  const task = getOpenTaskOnBoard(getBoard());
  const reads = task?.way === 'write' ? task.reads : undefined;
  const reading = useMemo(() => (text.trim() === '' ? null : readLine(text, reads)), [text, reads]);

  const send = useCallback(
    (line: string) => {
      const trimmed = line.trim();
      if (trimmed === '') return;
      const open = getOpenTaskOnBoard(getBoard());
      onWork({ way: 'write', id: nextLineId(), text: trimmed, ...(open ? { task: open.id } : {}) });
      setText('');
      setIsRaw(false);
    },
    [getBoard, nextLineId, onWork],
  );

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    const open = getOpenTaskOnBoard(getBoard());
    if (!open) return;
    const { verdict } = checkWorkOnBoard({ way: 'write', id: 'draft' as ElementId, text: trimmed, task: open.id }, getBoard());
    if (verdict.status !== 'right' || !reading || reading.isAsking || reading.kind !== 'math') return;
    const timer = setTimeout(() => send(trimmed), RIGHT_LINE_LANDS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text, reading, getBoard, send]);

  useEffect(() => {
    const hasDraft = text.trim() !== '';
    const timers = (hasDraft ? LOOKS_WITH_DRAFT_SECONDS : LOOKS_WITH_NO_DRAFT_SECONDS).map((seconds) =>
      setTimeout(() => onPause(seconds, hasDraft ? text.trim() : undefined), seconds * 1000),
    );
    return () => timers.forEach(clearTimeout);
  }, [text, activity, onPause]);

  useEffect(() => {
    const focusOnTyping = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (!isTyping && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) input.current?.focus();
    };
    document.addEventListener('keydown', focusOnTyping);
    return () => document.removeEventListener('keydown', focusOnTyping);
  }, []);

  const syncRawMode = () => {
    const field = input.current;
    if (field) setIsRaw(field.selectionStart !== field.value.length || field.selectionEnd !== field.value.length);
  };

  return (
    <form
      data-testid="typed-line"
      onSubmit={(event) => {
        event.preventDefault();
        send(text);
      }}
      className="border-t border-line bg-panel px-4 py-3 md:px-6"
    >
      <div className={`relative flex min-h-12 items-center border-b ${isFocused ? 'border-ink' : 'border-line'}`}>
        {!isRaw && (
          <div aria-hidden data-testid="line-preview" className="pointer-events-none flex min-h-10 flex-wrap items-baseline gap-x-1 text-board text-ink">
            {reading ? <LineParts reading={reading} /> : <span className="font-voice text-lead text-ink-2 italic">{BOARD_WORK_LABELS.placeholder}</span>}
            {isFocused && <span className="board-caret" />}
          </div>
        )}
        <input
          ref={input}
          value={text}
          aria-label={BOARD_WORK_LABELS.entry}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={2000}
          onChange={(event) => {
            setText(event.target.value);
            syncRawMode();
          }}
          onKeyUp={syncRawMode}
          onPointerDown={() => setIsRaw(true)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`absolute inset-0 h-full w-full bg-transparent text-lead outline-0 ${isRaw ? 'text-ink caret-ink' : 'text-transparent caret-transparent'}`}
        />
      </div>
      <div className="mt-1.5 min-h-4.5">{reading && <ReadAs reading={reading} />}</div>
    </form>
  );
}
