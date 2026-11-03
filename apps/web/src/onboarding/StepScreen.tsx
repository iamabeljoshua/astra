import type { PropsWithChildren, ReactNode } from 'react';
import { OnboardingColumn, StepFooter } from '../auth/OnboardingFrame';
import { ONBOARDING_LABELS } from '../strings';
import type { OnboardingState } from './useOnboarding';

interface StepScreenProps extends PropsWithChildren {
  flow: OnboardingState;
  action?: ReactNode;
}

export function StepScreen({ flow, action, children }: StepScreenProps) {
  return (
    <OnboardingColumn canSignOut footer={<StepFooter progress={flow.progress} onBack={flow.goBack} action={action} />}>
      {children}
    </OnboardingColumn>
  );
}

export function ContinueButton({ formId }: { formId: string }) {
  return (
    <button type="submit" form={formId} className="button button-solid">
      {ONBOARDING_LABELS.next}
    </button>
  );
}
