import type { SessionRecap } from '@astra/contracts';
import { RECAP_LABELS } from '../strings';

function RecapLine({ label, line }: { label: string; line: string }) {
  return (
    <div>
      <p className="label text-ink-2">{label}</p>
      <p className="mt-1 font-voice text-recap">{line}</p>
    </div>
  );
}

export function RecapLines({ recap }: { recap: SessionRecap }) {
  if (recap.kind === 'gentle') return <p data-testid="recap" data-utterance-now className="font-voice text-voice">{recap.line}</p>;
  return (
    <div data-testid="recap" data-utterance-now className="flex flex-col gap-4">
      <RecapLine label={RECAP_LABELS.covered} line={recap.covered} />
      {recap.gotRight && <RecapLine label={RECAP_LABELS.gotRight} line={recap.gotRight} />}
      <RecapLine label={RECAP_LABELS.tryNext} line={recap.tryNext} />
    </div>
  );
}
