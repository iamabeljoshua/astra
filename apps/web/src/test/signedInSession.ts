const SIGNED_IN_USER_ID = '00000000-0000-4000-8000-0000000000a1';

export const getAccessToken = async () => 'test-access-token';
export const didEmailLinkFail = async () => false;
export const restartAppAtHome = () => undefined;
export const signOut = async () => undefined;
export const forgetSession = async () => undefined;
export const renewSession = async () => true;

export function watchSignedInUser(onChange: (userId: string | null) => void) {
  onChange(SIGNED_IN_USER_ID);
  return () => undefined;
}
