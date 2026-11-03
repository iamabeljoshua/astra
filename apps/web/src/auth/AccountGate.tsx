import { type PropsWithChildren, useEffect, useRef } from 'react';
import { AccountClosedPage, AccountErrorPage, LoadingPage } from './AccountNotices';
import { useAuth } from './AuthProvider';
import { BirthDatePage } from './BirthDatePage';
import { forgetSession, renewSession } from './session';
import { SignInPage } from './SignInPage';
import { useAccount } from './useAccount';

const UNAUTHORIZED_STATUS = 401;

export function AccountGate({ children }: PropsWithChildren) {
  const { signIn } = useAuth();

  if (signIn.status === 'loading') return <LoadingPage />;
  if (signIn.status === 'signedOut') return <SignInPage />;
  return <SignedInGate>{children}</SignedInGate>;
}

function SignedInGate({ children }: PropsWithChildren) {
  const account = useAccount();
  const isTokenRefused = account.error?.status === UNAUTHORIZED_STATUS;
  const hasRenewed = useRef(false);
  const { errorUpdatedAt, refetch } = account;

  // A device clock running behind keeps a dead token in use, so one renewal comes before giving up on the session.
  useEffect(() => {
    if (!isTokenRefused) return;
    if (hasRenewed.current) {
      void forgetSession();
      return;
    }
    hasRenewed.current = true;
    const renewOrForget = async () => {
      if (await renewSession()) await refetch();
      else await forgetSession();
    };
    void renewOrForget();
  }, [isTokenRefused, errorUpdatedAt, refetch]);

  if (account.isPending || isTokenRefused) return <LoadingPage />;
  // A failed refresh keeps the last answer, so a network blip never takes the app away during a lesson.
  if (!account.data) return <AccountErrorPage error={account.error} onTryAgain={() => void account.refetch()} />;

  switch (account.data.status) {
    case 'needs_birth_date':
      return <BirthDatePage />;
    case 'closed':
      return <AccountClosedPage />;
    case 'active':
      return children;
  }
}
