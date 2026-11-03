import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { didEmailLinkFail, restartAppAtHome, watchSignedInUser } from './session';

type SignIn = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn' };

interface AuthState {
  signIn: SignIn;
  didLinkFail: boolean;
}

const AuthContext = createContext<AuthState>({ signIn: { status: 'loading' }, didLinkFail: false });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [signIn, setSignIn] = useState<SignIn>({ status: 'loading' });
  const [didLinkFail, setDidLinkFail] = useState(false);

  useEffect(() => {
    let signedInUserId: string | null = null;
    return watchSignedInUser((userId) => {
      if (signedInUserId && userId !== signedInUserId) {
        queryClient.clear();
        restartAppAtHome();
        return;
      }
      signedInUserId = userId;
      setSignIn({ status: userId ? 'signedIn' : 'signedOut' });
    });
  }, [queryClient]);

  useEffect(() => {
    void didEmailLinkFail().then(setDidLinkFail);
  }, []);

  useEffect(reloadWhenRestoredFromHistory, []);

  return <AuthContext.Provider value={{ signIn, didLinkFail }}>{children}</AuthContext.Provider>;
}

// A browser can restore a page from memory on Back, with the last student's data still on it.
function reloadWhenRestoredFromHistory() {
  const reloadIfRestored = (event: PageTransitionEvent) => {
    if (event.persisted) window.location.reload();
  };
  window.addEventListener('pageshow', reloadIfRestored);
  return () => window.removeEventListener('pageshow', reloadIfRestored);
}
