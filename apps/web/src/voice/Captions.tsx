import { VOICE_LABELS } from '../strings';
import type { StudentLine } from './liveVoice';

const CURRENT_WORD = 'underline decoration-1 underline-offset-4';

export function TutorCaption({ heard, coming, firstWord = null }: { heard: readonly string[]; coming: readonly string[]; firstWord?: string | null }) {
  const earlier = heard.slice(0, -1).join(' ');
  const current = heard.at(-1);
  return (
    <p className="font-voice text-voice" data-testid="tutor-caption">
      {firstWord && heard.length === 0 && coming.length === 0 && <span data-testid="first-word">{firstWord}</span>}
      {earlier && `${earlier} `}
      {current && <span className={CURRENT_WORD} data-testid="current-word">{current}</span>}
      {coming.length > 0 && <span className="text-ink-2">{` ${coming.join(' ')}`}</span>}
    </p>
  );
}

const LINES_SHOWN = 2;

export function StudentCaption({ lines }: { lines: readonly StudentLine[] }) {
  const shown = lines.slice(-LINES_SHOWN);
  if (shown.length === 0) return null;
  return (
    <p className="border-t border-line pt-3 text-sub wrap-anywhere" data-testid="student-caption">
      <span className="label block text-ink-2">{VOICE_LABELS.you}</span>
      {shown.map((line, index) => (
        <span key={index} className={line.isFinal ? undefined : 'text-ink-2'}>
          {index > 0 && ' '}
          {line.text}
        </span>
      ))}
    </p>
  );
}
