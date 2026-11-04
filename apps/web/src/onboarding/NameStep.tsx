import { type FormEvent, useRef, useState } from 'react';
import { StepHeading } from '../auth/StepHeading';
import { ONBOARDING_LABELS } from '../strings';
import { isStorableName, MAX_NAME_LENGTH } from './fieldLimits';
import { ContinueButton, StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';

const FORM_ID = 'student-name';

export function NameStep({ flow }: StepProps) {
  const input = useRef<HTMLInputElement>(null);
  const [isMissing, setIsMissing] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isStorableName(flow.answers.name)) flow.goNext();
    else setIsMissing(true);
  }

  return (
    <StepScreen flow={flow} action={<ContinueButton formId={FORM_ID} />}>
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4.5">
        <StepHeading fieldToFocus={input}>{ONBOARDING_LABELS.nameQuestion}</StepHeading>
        <input
          ref={input}
          className="line-input"
          autoComplete="given-name"
          maxLength={MAX_NAME_LENGTH}
          aria-label={ONBOARDING_LABELS.namePlaceholder}
          placeholder={ONBOARDING_LABELS.namePlaceholder}
          value={flow.answers.name}
          onChange={(event) => {
            flow.changeAnswers({ name: event.target.value });
            setIsMissing(false);
          }}
        />
        {isMissing && <p role="alert" className="stop-note">{ONBOARDING_LABELS.nameMissing}</p>}
      </form>
    </StepScreen>
  );
}
