import { checkWorkOnBoard, getWorkContext, readLine } from '@astra/board/shared';
import type { BoardState } from '@astra/board';
import type { ElementId, StudentWork, Task } from '@astra/contracts';
import { memo, type ReactNode, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { BOARD_WORK_LABELS } from '../strings';
import { LineParts, ReadAs } from './StudentLine';

const RIGHT_LINE_LANDS_AFTER_MS = 2200;
const LOOKS_WITH_DRAFT_SECONDS = [3, 6, 10, 15, 25];
const LOOKS_WITH_NO_DRAFT_SECONDS = [10, 20, 30, 45, 60, 90];

export interface TypedLineHandle {
  setLine(line: string): void;
  focus(): void;
}

interface TypedLineProps {
  task: Task | null;
  getBoard(): BoardState;
  onWork(work: StudentWork): void;
  onPause(seconds: number, draft?: string): void;
  onTyping?(): void;
  activity: number;
  hasWrittenBefore: boolean;
  handleRef?: React.Ref<TypedLineHandle>;
  nextLineId(): ElementId;
  isTutorGone?: boolean;
  band?: ReactNode;
}

// A reloaded page starts counting again while the agent still holds the last page's lines, so each page load numbers its own.
const FIRST_LINE_OF_THIS_PAGE = (Math.floor(Date.now() / 1000) % 1_000_000) * 1000;

export function useNextLineId(getBoard: () => BoardState) {
  const count = useRef(FIRST_LINE_OF_THIS_PAGE);
  return useCallback(() => {
    const { elements } = getBoard();
    do count.current += 1;
    while (elements.has(`s${count.current}` as ElementId));
    return `s${count.current}` as ElementId;
  }, [getBoard]);
}

// The board's next line, read back as the student types, and its draft leaves the page only at a pause.
export const TypedLine = memo(function TypedLine({ task, getBoard, onWork, onPause, onTyping, activity, hasWrittenBefore, handleRef, nextLineId, isTutorGone = false, band = null }: TypedLineProps) {
  const [text, setText] = useState('');
  const [isRaw, setIsRaw] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reads = task?.way === 'write' ? task.reads : undefined;
  const reading = useMemo(() => (text.trim() === '' ? null : readLine(text, reads)), [text, reads]);

  useImperativeHandle(handleRef, () => ({
    setLine(line) {
      setText(line);
      input.current?.focus();
    },
    focus() {
      input.current?.focus({ preventScroll: true });
    },
  }), []);

  const send = useCallback(
    (line: string) => {
      if (line.trim() === '' || isTutorGone) return;
      onWork({ way: 'write', id: nextLineId(), text: line.trimEnd(), ...(task ? { task: task.id } : {}) });
      setText('');
      setIsRaw(false);
    },
    [task, nextLineId, onWork, isTutorGone],
  );

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === '' || (!task && !getWorkContext(getBoard(), undefined).problemTex)) return;
    const { verdict } = checkWorkOnBoard({ way: 'write', id: 'draft' as ElementId, text: trimmed, ...(task ? { task: task.id } : {}) }, getBoard());
    if (verdict.status !== 'right' || !reading || reading.isAsking || reading.kind !== 'math') return;
    const timer = setTimeout(() => send(trimmed), RIGHT_LINE_LANDS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text, reading, task, getBoard, send]);

  useEffect(() => {
    const hasDraft = text.trim() !== '';
    const timers = (hasDraft ? LOOKS_WITH_DRAFT_SECONDS : LOOKS_WITH_NO_DRAFT_SECONDS).map((seconds) =>
      setTimeout(() => onPause(seconds, hasDraft ? text.trim() : undefined), seconds * 1000),
    );
    return () => timers.forEach(clearTimeout);
  }, [text, activity, onPause]);

  useEffect(() => {
    const focusOnTyping = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const active = document.activeElement;
      const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (!isTyping && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) input.current?.focus();
    };
    document.addEventListener('keydown', focusOnTyping);
    return () => document.removeEventListener('keydown', focusOnTyping);
  }, []);

  useEffect(() => {
    if (task?.way === 'write') input.current?.focus({ preventScroll: true });
  }, [task]);

  const syncRawMode = () => {
    const field = input.current;
    if (field) setIsRaw(field.selectionStart !== field.value.length || field.selectionEnd !== field.value.length);
  };

  return (
    <form
      data-testid="typed-line"
      data-row="live"
      className="board-row board-live-row"
      onSubmit={(event) => {
        event.preventDefault();
        send(text);
      }}
    >
      <div className="board-row-content">
        {band}
        <div hidden={band !== null} className="board-live-wrap" data-focused={isFocused} data-raw={isRaw} data-asked={task?.way === 'write'}>
          {!reading && !hasWrittenBefore && <span className="board-live-placeholder">{BOARD_WORK_LABELS.placeholder}</span>}
          <div aria-hidden data-testid="line-preview" className="board-live-shown" data-words={reading?.kind === 'words' || reading?.kind === 'code'} data-mixed={reading?.kind === 'mixed'}>
            {reading && <LineParts reading={reading} />}
            <span className="board-caret" />
          </div>
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
            disabled={isTutorGone}
            onChange={(event) => {
              setText(event.target.value);
              syncRawMode();
              onTyping?.();
            }}
            onKeyUp={syncRawMode}
            onPointerDown={() => setIsRaw(true)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="board-live-input"
          />
        </div>
      </div>
      <div className="board-row-gutter">{reading && !band && <ReadAs reading={reading} />}</div>
    </form>
  );
});
