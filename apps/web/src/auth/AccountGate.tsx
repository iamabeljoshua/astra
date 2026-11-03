import { type PropsWithChildren, useEffect, useState } from 'react';
import { AccountClosedPage, AccountErrorPage, LoadingPage } from './AccountNotices';
import { useAuth } from './AuthProvider';
import { BirthDatePage } from './BirthDatePage';
import { SignInPage } from './SignInPage';
import { useAccount } from './useAccount';
import { useRenewalAfterRefusal } from './useRenewalAfterRefusal';

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

function SignedInGate({ children }: PropsWithChildren) {
  const account = useAccount();
  const { settledKind, isRenewing, tryAgain } = useRenewalAfterRefusal(account);
  const [cameThroughStep, setCameThroughStep] = useState(false);
  const isLoading = account.isPending || (isRenewing && !account.data);
  if (!isLoading && account.data?.status !== 'active' && !cameThroughStep) setCameThroughStep(true);

  if (isLoading) return <LoadingPage />;
  if (!account.data) return <AccountErrorPage errorKind={settledKind ?? account.error?.kind ?? 'network'} onTryAgain={tryAgain} />;

  switch (account.data.status) {
    case 'needs_birth_date':
      return <BirthDatePage />;
    case 'closed':
      return <AccountClosedPage />;
    case 'active':
      return cameThroughStep ? <FocusPageHeadingOnArrival>{children}</FocusPageHeadingOnArrival> : children;
  }
}

function FocusPageHeadingOnArrival({ children }: PropsWithChildren) {
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, []);

  return children;
}
