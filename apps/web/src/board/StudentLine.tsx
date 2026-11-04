import type { LineReading } from '@astra/contracts';
import type { StudentLineContent } from '@astra/board';
import { renderTex } from '@astra/board/drawing';
import { useLayoutEffect, useRef } from 'react';
import { BOARD_WORK_LABELS } from '../strings';

/** Set by KaTeX, so a part of a line a student wrote can never become markup. */
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

export function ReadAs({ reading, typed, isUnderMath = false }: { reading: LineReading; typed?: string; isUnderMath?: boolean }) {
  return (
    <p data-line-caption data-testid="read-as" className={`m-0 text-fine whitespace-nowrap text-ink-2 ${isUnderMath ? 'absolute left-0' : ''}`}>
      <span className="label">
        {BOARD_WORK_LABELS.readAs} {BOARD_WORK_LABELS.kinds[reading.kind]}
      </span>
      {typed !== undefined && reading.kind === 'math' && (
        <span className="ml-2">
          {BOARD_WORK_LABELS.youTyped} {typed}
        </span>
      )}
    </p>
  );
}

// A math line is painted by the board's math painter, which owns the wrapper's flow, so only its caption is here.
export function StudentLine({ content }: { content: StudentLineContent }) {
  const { reading, text } = content;
  if (reading.kind === 'math') {
    return <ReadAs reading={reading} typed={text} isUnderMath />;
  }
  return (
    <div data-student-line className="max-w-full text-lead wrap-anywhere">
      <LineParts reading={reading} />
      <ReadAs reading={reading} />
    </div>
  );
}
