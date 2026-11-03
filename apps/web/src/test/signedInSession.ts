const SIGNED_IN_USER_ID = '00000000-0000-4000-8000-0000000000a1';

export const getAccessToken = async () => 'test-access-token';
export const getSignInReturnProblem = async () => null;
export const restartAppAtHome = () => undefined;
export const signOut = () => undefined;
export const forgetSession = () => undefined;
export const hasStoredSession = () => true;
export const renewSession = async () => 'renewed' as const;
export const readCodeRequest = () => null;
export const isCodeStillGood = () => false;
export const CODE_LENGTH = 6;

export function watchSignedInUser(onChange: (userId: string | null) => void) {
  onChange(SIGNED_IN_USER_ID);
  return () => undefined;
}
