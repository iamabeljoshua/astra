import { type PropsWithChildren, useEffect, useRef } from 'react';
import { AccountClosedPage, AccountErrorPage, LoadingPage } from './AccountNotices';
import { useAuth } from './AuthProvider';
import { BirthDatePage } from './BirthDatePage';
import { SignInPage } from './SignInPage';
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
  const isOnGatePage = account ? account.status !== 'active' : error !== null;
  useFocusPageHeadingAfterGatePage(isOnGatePage);

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
