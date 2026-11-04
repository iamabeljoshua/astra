import { BOARD_WORK_LABELS } from '../strings';

const KEYS = ['²', '√', '÷', '×', '±', '(', ')', 'π', '=', '≤', '≥'] as const;

// Keys for what a keyboard has no key for, which go into the plain typed line.
export function MathKeys({ onKey }: { onKey(key: string): void }) {
  return (
    <div role="group" aria-label={BOARD_WORK_LABELS.mathKeys} className="flex flex-wrap items-center gap-1">
      {KEYS.map((key) => (
        // Keeps the caret where it was, because the press must not take focus from the line.
        <button key={key} type="button" className="board-tool" onPointerDown={(event) => event.preventDefault()} onClick={() => onKey(key)}>
          {key}
        </button>
      ))}
    </div>
  );
}
