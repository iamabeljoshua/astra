import { useEffect, useState } from 'react';
import { ACCOUNT_LABELS, API_ERROR_LABELS, PRODUCT_NAME } from '../strings';
import type { ApiErrorKind } from '../api/apiError';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';
import { StepHeading } from './StepHeading';

const SLOW_LOAD_NOTICE_DELAY_MS = 3_000;

export function LoadingPage() {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_LOAD_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-busy="true" className="flex min-h-dvh animate-arrive flex-col items-center justify-center gap-3">
      <title>{PRODUCT_NAME}</title>
      <div className="product-mark">{PRODUCT_NAME}</div>
      <p role="status" className="text-fine text-ink-2">
        {isSlow && ACCOUNT_LABELS.stillLoading}
      </p>
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
