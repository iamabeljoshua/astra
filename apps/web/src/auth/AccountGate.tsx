import { type PropsWithChildren, useEffect, useRef } from 'react';
import { AccountClosedPage, AccountErrorPage, LoadingPage } from './AccountNotices';
import { useAuth } from './AuthProvider';
import { BirthDatePage } from './BirthDatePage';
import { SignInPage } from './SignInPage';
import { useAccount } from './useAccount';

export function AccountGate({ children }: PropsWithChildren) {
  const { signIn } = useAuth();

  if (signIn.status === 'loading') return <LoadingPage />;
  if (signIn.status === 'signedOut') return <SignInPage />;
  if (signIn.status === 'authUnreachable') return <AccountErrorPage errorKind="network" onTryAgain={reloadPage} />;
  return <SignedInGate>{children}</SignedInGate>;
}

function reloadPage() {
  window.location.reload();
}

// Opening the app after any other page of the gate takes focus to its heading. A plain load leaves focus alone.
function useFocusPageHeadingAfterStep(isAtStep: boolean) {
  const wasAtStep = useRef(false);

  useEffect(() => {
    if (!isAtStep && wasAtStep.current) document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    wasAtStep.current = isAtStep;
  }, [isAtStep]);
}

function SignedInGate({ children }: PropsWithChildren) {
  const { data: account, error, refetch } = useAccount();
  useFocusPageHeadingAfterStep(account ? account.status !== 'active' : error !== null);

  if (!account) {
    if (!error) return <LoadingPage />;
    return <AccountErrorPage errorKind={error.kind} onTryAgain={() => refetch({ cancelRefetch: false })} />;
  }

  switch (account.status) {
    case 'needs_birth_date':
      return <BirthDatePage />;
    case 'closed':
      return <AccountClosedPage />;
    case 'active':
      return children;
  }
}
