import { type FormEvent, useRef, useState } from 'react';
import { ONBOARDING_LABELS } from '../strings';
import { TextField } from '../ui/TextField';
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
    <StepScreen flow={flow} line={ONBOARDING_LABELS.nameQuestion} fieldToFocus={input} action={<ContinueButton formId={FORM_ID} />}>
      <form id={FORM_ID} onSubmit={submit}>
        <TextField
          inputRef={input}
          label={ONBOARDING_LABELS.nameLabel}
          autoComplete="given-name"
          maxLength={MAX_NAME_LENGTH}
          error={isMissing ? ONBOARDING_LABELS.nameMissing : null}
          value={flow.answers.name}
          onChange={(event) => {
            flow.changeAnswers({ name: event.target.value });
            setIsMissing(false);
          }}
        />
      </form>
    </StepScreen>
  );
}
