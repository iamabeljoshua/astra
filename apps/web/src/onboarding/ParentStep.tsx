import { type FormEvent, useRef, useState } from 'react';
import { StepHeading } from '../auth/StepHeading';
import { useAskParent } from '../auth/useAccount';
import { API_ERROR_LABELS, ONBOARDING_LABELS } from '../strings';
import { ContinueButton, StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';

const FORM_ID = 'parent-email';

export function ParentStep({ flow }: StepProps) {
  const parentEmail = flow.student?.parentConsent?.parentEmail ?? '';
  const [isChangingAddress, setIsChangingAddress] = useState(false);

  if (parentEmail && !isChangingAddress) {
    return <WaitingForParent flow={flow} parentEmail={parentEmail} onChangeAddress={() => setIsChangingAddress(true)} />;
  }
  return <AskForParent flow={flow} earlierEmail={parentEmail} onAsked={() => setIsChangingAddress(false)} />;
}

function AskForParent({ flow, earlierEmail, onAsked }: StepProps & { earlierEmail: string; onAsked: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [parentEmail, setParentEmail] = useState(earlierEmail);
  const askParent = useAskParent();
  const problem = askParent.error && (askParent.error.kind === 'validation' ? ONBOARDING_LABELS.parentInvalid : API_ERROR_LABELS[askParent.error.kind]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!askParent.isPending) askParent.mutate(parentEmail.trim(), { onSuccess: onAsked });
  }

  return (
    <StepScreen flow={flow} action={<ContinueButton formId={FORM_ID} isBusy={askParent.isPending} />}>
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4.5">
        <StepHeading fieldToFocus={input}>{ONBOARDING_LABELS.parentQuestion}</StepHeading>
        <p className="max-w-[46ch] text-sub text-ink-2">{ONBOARDING_LABELS.parentAbout}</p>
        <input
          ref={input}
          className="line-input"
          type="email"
          required
          autoComplete="off"
          aria-label={ONBOARDING_LABELS.parentPlaceholder}
          placeholder={ONBOARDING_LABELS.parentPlaceholder}
          value={parentEmail}
          onChange={(event) => setParentEmail(event.target.value)}
        />
        {problem && <p role="alert" className="stop-note">{problem}</p>}
      </form>
    </StepScreen>
  );
}

function WaitingForParent({ flow, parentEmail, onChangeAddress }: StepProps & { parentEmail: string; onChangeAddress: () => void }) {
  return (
    <StepScreen flow={flow}>
      <StepHeading>{ONBOARDING_LABELS.waitingQuestion}</StepHeading>
      <p className="max-w-[46ch] text-sub text-ink-2">{ONBOARDING_LABELS.waitingAbout}</p>
      <p className="font-medium wrap-anywhere">{parentEmail}</p>
      <div>
        <button type="button" className="button button-outline" onClick={onChangeAddress}>
          {ONBOARDING_LABELS.useAnotherAddress}
        </button>
      </div>
    </StepScreen>
  );
}
