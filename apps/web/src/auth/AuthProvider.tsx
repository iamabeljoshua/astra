import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { getSignInReturnProblem, restartAppAtHome, type SignInReturnProblem, watchSignedInUser } from './session';

type SignIn = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn' };

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
      setSignIn({ status: userId ? 'signedIn' : 'signedOut' });
    });
  }, [queryClient]);

  useEffect(() => {
    void getSignInReturnProblem().then(setReturnProblem);
  }, []);

  useEffect(reloadWhenRestoredFromHistory, []);

  return <AuthContext.Provider value={{ signIn, returnProblem }}>{children}</AuthContext.Provider>;
}

// A browser can restore a page from memory on Back, with the last student's data still on it.
function reloadWhenRestoredFromHistory() {
  const reloadIfRestored = (event: PageTransitionEvent) => {
    if (event.persisted) window.location.reload();
  };
  window.addEventListener('pageshow', reloadIfRestored);
  return () => window.removeEventListener('pageshow', reloadIfRestored);
}
