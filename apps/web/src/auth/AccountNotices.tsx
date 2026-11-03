import { useEffect, useState } from 'react';
import { ACCOUNT_LABELS, API_ERROR_LABELS, PRODUCT_NAME } from '../strings';
import type { ApiErrorKind } from '../api/apiError';
import { OnboardingFrame } from './OnboardingFrame';
import { SignOutButton } from './SignOutButton';
import { StepHeading } from './StepHeading';

const SLOW_LOAD_NOTICE_DELAY_MS = 3_000;

function SlowLoadNotice() {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_LOAD_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <p role="status" className="text-fine text-ink-2">
      {isSlow && ACCOUNT_LABELS.stillLoading}
    </p>
  );
}

export function LoadingPage() {
  return (
    <div aria-busy="true" className="flex min-h-dvh animate-arrive flex-col items-center justify-center gap-3">
      <title>{PRODUCT_NAME}</title>
      <div className="product-mark">{PRODUCT_NAME}</div>
      <SlowLoadNotice />
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
  onTryAgain: () => unknown;
}

export function AccountErrorPage({ errorKind, onTryAgain }: AccountErrorPageProps) {
  const [isTrying, setIsTrying] = useState(false);
  const [failedTries, setFailedTries] = useState(0);

  async function tryAgain() {
    setIsTrying(true);
    await onTryAgain();
    setIsTrying(false);
    setFailedTries(failedTries + 1);
  }

  return (
    <OnboardingFrame footer={<SignOutButton className="font-medium text-ink-2 hover:text-ink" />}>
      <StepHeading key={failedTries}>{API_ERROR_LABELS[errorKind]}</StepHeading>
      <div className="flex flex-col items-start gap-3">
        <button type="button" aria-disabled={isTrying} className="button button-solid aria-disabled:opacity-35" onClick={() => void tryAgain()}>
          {ACCOUNT_LABELS.tryAgain}
        </button>
        {isTrying && <SlowLoadNotice />}
      </div>
    </OnboardingFrame>
  );
}
