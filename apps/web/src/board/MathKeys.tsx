import { BOARD_WORK_LABELS } from '../strings';

const KEYS = ['²', '√', '÷', '×', '±', '(', ')', 'π', '=', '≤', '≥'] as const;

export function MathKeys({ onKey }: { onKey(key: string): void }) {
  return (
    <div role="group" aria-label={BOARD_WORK_LABELS.mathKeys} className="flex flex-wrap items-center gap-1">
      {KEYS.map((key) => (
        <button key={key} type="button" className="board-tool" onMouseDown={(event) => event.preventDefault()} onClick={() => onKey(key)}>
          {key}
        </button>
      ))}
    </div>
  );
}
