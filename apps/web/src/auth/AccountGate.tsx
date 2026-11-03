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
  return <SignedInGate>{children}</SignedInGate>;
}

function SignedInGate({ children }: PropsWithChildren) {
  const account = useAccount();
  const { isTokenRefused, isRenewing } = useRenewalAfterRefusal(account);
  const [cameThroughStep, setCameThroughStep] = useState(false);
  const isLoading = account.isPending || (isRenewing && !account.data);
  if (!isLoading && account.data?.status !== 'active' && !cameThroughStep) setCameThroughStep(true);

  if (isLoading) return <LoadingPage />;
  // A failed refresh keeps the last answer, so a refused token or a network blip never takes the app away during a lesson.
  if (!account.data) {
    const errorKind = isTokenRefused || !account.error ? 'network' : account.error.kind;
    return <AccountErrorPage errorKind={errorKind} onTryAgain={() => void account.refetch()} />;
  }

  switch (account.data.status) {
    case 'needs_birth_date':
      return <BirthDatePage />;
    case 'closed':
      return <AccountClosedPage />;
    case 'active':
      return cameThroughStep ? <PageAfterStep>{children}</PageAfterStep> : children;
  }
}

// The page that replaces a step takes focus on its heading, so a screen reader announces it.
function PageAfterStep({ children }: PropsWithChildren) {
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, []);

  return children;
}
