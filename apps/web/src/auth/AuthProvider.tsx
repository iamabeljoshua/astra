import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { getSignInReturnProblem, hasStoredSession, restartAppAtHome, type SignInReturnProblem, watchSignedInUser } from './session';

type SignIn = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn' } | { status: 'authUnreachable' };

interface AuthState {
  signIn: SignIn;
  returnProblem: SignInReturnProblem | null;
}

const AuthContext = createContext<AuthState>({ signIn: { status: 'loading' }, returnProblem: null });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [signIn, setSignIn] = useState<SignIn>({ status: 'loading' });
  const [returnProblem, setReturnProblem] = useState<SignInReturnProblem | null>(null);

  useEffect(() => {
    let signedInUserId: string | null = null;
    return watchSignedInUser((userId) => {
      if (signedInUserId && userId !== signedInUserId) {
        queryClient.clear();
        restartAppAtHome();
        return;
      }
      signedInUserId = userId;
      setSignIn({ status: getSignInStatus(userId) });
    });
  }, [queryClient]);

  useEffect(() => {
    void getSignInReturnProblem().then(setReturnProblem);
  }, []);

  useEffect(reloadWhenRestoredFromHistory, []);

  return <AuthContext.Provider value={{ signIn, returnProblem }}>{children}</AuthContext.Provider>;
}

// The client reports no user when it cannot renew an expired token, and it keeps the session only while Auth might still take it.
function getSignInStatus(userId: string | null) {
  if (userId) return 'signedIn';
  return hasStoredSession() ? 'authUnreachable' : 'signedOut';
}

// A browser can restore a page from memory on Back, and it paints that page before any script can run. So the page hides before it is kept.
function reloadWhenRestoredFromHistory() {
  const hideBeforeBeingKept = (event: PageTransitionEvent) => {
    if (event.persisted) document.documentElement.style.visibility = 'hidden';
  };
  const reloadIfRestored = (event: PageTransitionEvent) => {
    if (event.persisted) window.location.reload();
  };
  window.addEventListener('pagehide', hideBeforeBeingKept);
  window.addEventListener('pageshow', reloadIfRestored);
  return () => {
    window.removeEventListener('pagehide', hideBeforeBeingKept);
    window.removeEventListener('pageshow', reloadIfRestored);
  };
}
