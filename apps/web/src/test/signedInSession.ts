const SIGNED_IN_USER_ID = '00000000-0000-4000-8000-0000000000a1';

export const getAccessToken = async () => 'test-access-token';
export const getSignInReturnProblem = async () => null;
export const restartAppAtHome = () => undefined;
export const signOut = async () => undefined;
export const forgetSession = async () => undefined;
export const renewSession = async () => 'renewed' as const;

export function watchSignedInUser(onChange: (userId: string | null) => void) {
  onChange(SIGNED_IN_USER_ID);
  return () => undefined;
}
