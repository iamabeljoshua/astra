const STOP_COOKIE = 'astra-sign-up-stop';
const ONE_DAY_IN_SECONDS = 86_400;

export function stopNewSignUpsForADay(): void {
  document.cookie = `${STOP_COOKIE}=1; Max-Age=${ONE_DAY_IN_SECONDS}; Path=/; SameSite=Strict`;
}

export function areNewSignUpsStopped(): boolean {
  return document.cookie.split('; ').includes(`${STOP_COOKIE}=1`);
}
