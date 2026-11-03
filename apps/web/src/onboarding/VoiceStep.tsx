import { type FormEvent, useState } from 'react';
import { StepHeading } from '../auth/StepHeading';
import { ONBOARDING_LABELS } from '../strings';
import { ContinueButton, StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';
import { VoiceRows } from './VoiceRows';

const FORM_ID = 'tutor-voice';

export function VoiceStep({ flow }: StepProps) {
  const [isMissing, setIsMissing] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (flow.answers.voice) flow.saveAndGoNext();
    else setIsMissing(true);
  }

  return (
    <StepScreen flow={flow} action={<ContinueButton formId={FORM_ID} isBusy={flow.isSaving} />}>
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4.5">
        <StepHeading>{ONBOARDING_LABELS.voiceQuestion}</StepHeading>
        <p className="max-w-[46ch] text-sub text-ink-2">{ONBOARDING_LABELS.voiceAbout}</p>
        <VoiceRows
          studentName={flow.answers.name}
          selected={flow.answers.voice}
          onPick={(voice) => {
            flow.changeAnswers({ voice });
            setIsMissing(false);
          }}
        />
        {isMissing && <p role="alert" className="stop-note">{ONBOARDING_LABELS.voiceMissing}</p>}
        {flow.saveProblem && <p role="alert" className="stop-note">{flow.saveProblem}</p>}
      </form>
    </StepScreen>
  );
}
