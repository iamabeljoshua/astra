import { useEffect, useState } from 'react';
import type { ApiErrorKind } from '../api/apiError';
import { ACCOUNT_LABELS, API_ERROR_LABELS, PRODUCT_NAME, SIGN_IN_LABELS } from '../strings';
import { DotStage } from '../ui/dots/DotStage';
import { TutorQuestion } from '../ui/TutorQuestion';
import { SignOutButton } from './SignOutButton';

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

export function LoadingOnChartPage() {
  return (
    <DotStage chartTitle={SIGN_IN_LABELS.tagline}>
      <SlowLoadNotice />
    </DotStage>
  );
}

export function AccountClosedPage() {
  return (
    <DotStage>
      <TutorQuestion line={ACCOUNT_LABELS.closed}>
        <div>
          <SignOutButton className="button button-outline" />
        </div>
      </TutorQuestion>
    </DotStage>
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
    <DotStage headerAction={<SignOutButton className="text-fine font-medium text-ink-2 hover:text-ink" />}>
      <TutorQuestion key={failedTries} line={API_ERROR_LABELS[errorKind]}>
        <div className="flex flex-col items-start gap-3">
          <button type="button" aria-disabled={isTrying} className="button button-solid aria-disabled:opacity-35" onClick={() => void tryAgain()}>
            {ACCOUNT_LABELS.tryAgain}
          </button>
          {isTrying && <SlowLoadNotice />}
        </div>
      </TutorQuestion>
    </DotStage>
  );
}
