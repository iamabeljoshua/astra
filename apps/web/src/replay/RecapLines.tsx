import type { SessionRecap } from '@astra/contracts';
import { useState } from 'react';
import { API_ERROR_LABELS, RECAP_LABELS } from '../strings';
import { useSaveRecapAnswer } from './replayQueries';

function RecapLine({ label, line }: { label: string; line: string }) {
  return (
    <div>
      <p className="label text-ink-2">{label}</p>
      <p className="mt-1 font-voice text-recap">{line}</p>
    </div>
  );
}

const MOST_ANSWER_CHARACTERS = 2000;

function RecapAnswer({ sessionId, answer }: { sessionId: string; answer: string | null }) {
  const [text, setText] = useState(answer ?? '');
  const save = useSaveRecapAnswer(sessionId);
  const isSaved = save.isSuccess && save.variables === text;
  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() !== '' && !isSaved) save.mutate(text);
      }}
    >
      <input type="text" value={text} maxLength={MOST_ANSWER_CHARACTERS} aria-label={RECAP_LABELS.yourAnswer} placeholder={RECAP_LABELS.yourAnswer} onChange={(event) => setText(event.target.value)} className="min-w-0 flex-1 border-b border-ink py-1.25 text-sub outline-none placeholder:text-ink-2 focus:border-b-2 focus:pb-1" />
      <button type="submit" aria-disabled={save.isPending} className="board-tool">{isSaved ? RECAP_LABELS.saved : RECAP_LABELS.save}</button>
      {save.error && <p role="alert" className="text-fine text-ink-2">{API_ERROR_LABELS[save.error.kind]}</p>}
    </form>
  );
}

interface RecapLinesProps {
  recap: SessionRecap;
  sessionId: string;
  answer?: string | null;
}

export function RecapLines({ recap, sessionId, answer = null }: RecapLinesProps) {
  if (recap.kind === 'gentle') return <p data-testid="recap" data-utterance-now className="mt-6 font-voice text-voice">{recap.line}</p>;
  return (
    <div data-testid="recap" data-utterance-now className="mt-6 flex flex-col gap-4">
      <RecapLine label={RECAP_LABELS.covered} line={recap.covered} />
      {recap.gotRight && <RecapLine label={RECAP_LABELS.gotRight} line={recap.gotRight} />}
      <div>
        <RecapLine label={RECAP_LABELS.tryNext} line={recap.tryNext} />
        <RecapAnswer sessionId={sessionId} answer={answer} />
      </div>
    </div>
  );
}
