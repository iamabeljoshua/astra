import { ACCOUNT_LABELS, API_ERROR_LABELS, PRODUCT_NAME } from '../strings';
import type { ApiErrorKind } from '../api/apiError';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';
import { StepHeading } from './StepHeading';

export function LoadingPage() {
  return (
    <div aria-busy="true" className="flex min-h-dvh animate-arrive items-center justify-center">
      <title>{PRODUCT_NAME}</title>
      <div className="product-mark">{PRODUCT_NAME}</div>
    </div>
  );
}

export function AccountClosedPage() {
  return (
    <OnboardingFrame>
      <StepHeading>{ACCOUNT_LABELS.closed}</StepHeading>
      <div>
        <SignOutButton className="button button-outline" />
      </div>
    </OnboardingFrame>
  );
}

interface AccountErrorPageProps {
  errorKind: ApiErrorKind;
  onTryAgain: () => void;
}

export function AccountErrorPage({ errorKind, onTryAgain }: AccountErrorPageProps) {
  return (
    <OnboardingFrame footer={<SignOutButton className="font-medium text-ink-2 hover:text-ink" />}>
      <StepHeading>{API_ERROR_LABELS[errorKind]}</StepHeading>
      <div>
        <button type="button" className="button button-solid" onClick={onTryAgain}>
          {ACCOUNT_LABELS.tryAgain}
        </button>
      </div>
    </OnboardingFrame>
  );
}
