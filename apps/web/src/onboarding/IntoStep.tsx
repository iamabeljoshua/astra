import { type FormEvent, useRef } from 'react';
import { StepHeading } from '../auth/StepHeading';
import { ONBOARDING_LABELS } from '../strings';
import { InterestsField } from './InterestsField';
import { ContinueButton, StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';

const FORM_ID = 'student-interests';

export function IntoStep({ flow }: StepProps) {
  const typedInput = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    flow.goNext();
  }

  return (
    <StepScreen flow={flow} action={<ContinueButton formId={FORM_ID} />}>
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4.5">
        <StepHeading fieldToFocus={typedInput}>{ONBOARDING_LABELS.intoQuestion}</StepHeading>
        <p className="max-w-[46ch] text-sub text-ink-2">{ONBOARDING_LABELS.intoAbout}</p>
        <InterestsField picked={flow.answers.pickedInterests} typed={flow.answers.typedInterest} onChange={flow.changeAnswers} typedInput={typedInput} />
      </form>
    </StepScreen>
  );
}
