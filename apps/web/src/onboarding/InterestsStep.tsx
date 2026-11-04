import type { FormEvent } from 'react';
import { ONBOARDING_LABELS } from '../strings';
import { InterestsField } from './InterestsField';
import { ContinueButton, StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';

const FORM_ID = 'student-interests';

export function InterestsStep({ flow }: StepProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    flow.goNext();
  }

  return (
    <StepScreen flow={flow} line={ONBOARDING_LABELS.intoQuestion} action={<ContinueButton formId={FORM_ID} />}>
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4.5">
        <p className="text-sub text-ink-2">{ONBOARDING_LABELS.intoAbout}</p>
        <InterestsField selected={flow.answers.interests} onChange={(interests) => flow.changeAnswers({ interests })} />
      </form>
    </StepScreen>
  );
}
