import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import { StepFooter } from '../auth/StepFooter';
import { ONBOARDING_LABELS } from '../strings';
import { TutorQuestion } from '../ui/TutorQuestion';
import type { OnboardingState } from './useOnboarding';

interface StepScreenProps extends PropsWithChildren {
  flow: OnboardingState;
  line: string;
  fieldToFocus?: RefObject<HTMLInputElement | null>;
  action?: ReactNode;
}

export function StepScreen({ flow, line, fieldToFocus, action, children }: StepScreenProps) {
  return (
    <TutorQuestion line={line} fieldToFocus={fieldToFocus}>
      {children}
      <div className="flex flex-col gap-2">
        <StepFooter progress={flow.progress} onBack={flow.goBack} isBackLocked={flow.isSaving} action={action} />
        <p className="text-fine text-ink-2">{ONBOARDING_LABELS.changeLater}</p>
      </div>
    </TutorQuestion>
  );
}

export function ContinueButton({ formId }: { formId: string }) {
  return (
    <button type="submit" form={formId} className="button button-solid">
      {ONBOARDING_LABELS.next}
    </button>
  );
}
