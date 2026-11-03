import { ACCOUNT_LABELS, API_ERROR_LABELS, PRODUCT_NAME } from '../strings';
import type { ApiError } from '../api/apiError';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';

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
      <h1 className="text-question font-semibold text-balance">{ACCOUNT_LABELS.closed}</h1>
      <div>
        <SignOutButton className="button button-outline" />
      </div>
    </OnboardingFrame>
  );
}

interface AccountErrorPageProps {
  error: ApiError;
  onTryAgain: () => void;
}

export function AccountErrorPage({ error, onTryAgain }: AccountErrorPageProps) {
  return (
    <OnboardingFrame footer={<SignOutButton className="font-medium text-ink-2 hover:text-ink" />}>
      <h1 role="alert" className="text-question font-semibold text-balance">{API_ERROR_LABELS[error.kind]}</h1>
      <div>
        <button type="button" className="button button-solid" onClick={onTryAgain}>
          {ACCOUNT_LABELS.tryAgain}
        </button>
      </div>
    </OnboardingFrame>
  );
}
