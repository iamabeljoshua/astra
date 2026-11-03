import { type PropsWithChildren, useEffect } from 'react';
import { AccountClosedPage, AccountErrorPage } from './AccountNotices';
import { useAuth } from './AuthProvider';
import { BirthDatePage } from './BirthDatePage';
import { signOut } from './session';
import { SignInPage } from './SignInPage';
import { useAccount } from './useAccount';

const UNAUTHORIZED_STATUS = 401;

export function AccountGate({ children }: PropsWithChildren) {
  const { signIn } = useAuth();

  if (signIn.status === 'loading') return null;
  if (signIn.status === 'signedOut') return <SignInPage />;
  return <SignedInGate>{children}</SignedInGate>;
}

function SignedInGate({ children }: PropsWithChildren) {
  const account = useAccount();
  const isTokenRefused = account.error?.status === UNAUTHORIZED_STATUS;

  // The API refusing a token the browser still trusts leaves nothing to do here but sign in again.
  useEffect(() => {
    if (isTokenRefused) void signOut();
  }, [isTokenRefused]);

  if (account.isPending || isTokenRefused) return null;
  if (account.error) return <AccountErrorPage error={account.error} onTryAgain={() => void account.refetch()} />;

  switch (account.data.status) {
    case 'needs_birth_date':
      return <BirthDatePage />;
    case 'closed':
      return <AccountClosedPage />;
    case 'active':
      return children;
  }
}
