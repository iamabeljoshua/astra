import type { LineReading } from '@astra/contracts';
import { renderTex } from '@astra/board/drawing';
import { useLayoutEffect, useRef } from 'react';
import { BOARD_WORK_LABELS } from '../strings';

export function MathPart({ tex }: { tex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (ref.current) renderTex(tex, ref.current);
  }, [tex]);
  return <span ref={ref} data-testid="line-math" />;
}

export function LineParts({ reading }: { reading: LineReading }) {
  if (reading.kind === 'code') return <code className="text-sub whitespace-pre-wrap wrap-anywhere">{reading.parts[0]?.type === 'words' ? reading.parts[0].text : ''}</code>;
  return (
    <>
      {reading.parts.map((part, index) => (
        <span key={index}>
          {index > 0 && ' '}
          {part.type === 'math' ? <MathPart tex={part.tex} /> : part.text}
        </span>
      ))}
    </>
  );
}

export function ReadAs({ reading, typed, showsParts = false, isHeard = false, onFix }: { reading: LineReading; typed?: string; showsParts?: boolean; isHeard?: boolean; onFix?: () => void }) {
  return (
    <div data-testid="read-as" className="board-read-as">
      <span className="board-read-as-label">
        {BOARD_WORK_LABELS.readAs} {BOARD_WORK_LABELS.kinds[reading.kind]}
      </span>
      {showsParts && (
        <span className="board-read-as-parts">
          <LineParts reading={reading} />
        </span>
      )}
      {typed !== undefined && reading.kind === 'math' && (
        <span>
          {isHeard ? BOARD_WORK_LABELS.youSaid : BOARD_WORK_LABELS.youTyped} {typed}
        </span>
      )}
      {onFix && (
        <button type="button" onClick={onFix} className="board-read-as-fix">
          {isHeard ? BOARD_WORK_LABELS.notWhatYouSaid : BOARD_WORK_LABELS.notWhatYouWrote}
        </button>
      )}
    </div>
  );
}
