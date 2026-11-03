import { type PropsWithChildren, useEffect, useRef } from 'react';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { hasFinishedOnboarding } from '../onboarding/steps';
import { AccountClosedPage, AccountErrorPage, LoadingPage } from './AccountNotices';
import { useAuth } from './AuthProvider';
import { SignInPage } from './SignInPage';
import { areNewSignUpsStopped, stopNewSignUpsForADay } from './signUpStop';
import { useAccount } from './useAccount';
import type { SignInDraft } from './useSignInDraft';

interface AccountGateProps extends PropsWithChildren {
  signInDraft: SignInDraft;
}

export function AccountGate({ signInDraft, children }: AccountGateProps) {
  const { signIn } = useAuth();

  if (signIn.status === 'loading') return <LoadingPage />;
  if (signIn.status === 'signedOut') return <SignInPage draft={signInDraft} />;
  if (signIn.status === 'authUnreachable') return <AccountErrorPage errorKind="network" onTryAgain={reloadPage} />;
  return <SignedInGate>{children}</SignedInGate>;
}

function reloadPage() {
  window.location.reload();
}

function useFocusPageHeadingAfterGatePage(isOnGatePage: boolean) {
  const wasOnGatePage = useRef(false);

  useEffect(() => {
    if (!isOnGatePage && wasOnGatePage.current) document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    wasOnGatePage.current = isOnGatePage;
  }, [isOnGatePage]);
}

function SignedInGate({ children }: PropsWithChildren) {
  const { data: account, error, refetch } = useAccount();
  const isOnGatePage = account ? !hasFinishedOnboarding(account.student) : error !== null;
  const isClosed = account?.status === 'closed';
  useFocusPageHeadingAfterGatePage(isOnGatePage);

  useEffect(() => {
    if (isClosed) stopNewSignUpsForADay();
  }, [isClosed]);

  if (!account) {
    if (!error) return <LoadingPage />;
    return <AccountErrorPage errorKind={error.kind} onTryAgain={() => refetch({ cancelRefetch: false })} />;
  }

  if (account.status === 'closed') return <AccountClosedPage />;
  if (account.status === 'needs_birth_date' && areNewSignUpsStopped()) return <AccountClosedPage />;
  return hasFinishedOnboarding(account.student) ? children : <OnboardingFlow student={account.student} />;
}
