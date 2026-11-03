/// <reference types="vite/client" />
import { type AuthError, createClient, isAuthRefreshDiscardedError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { fetchForAuth } from './fetchForAuth';

export type EmailLinkResult = 'sent' | 'invalidEmail' | 'tooManyRequests' | 'authFailed' | 'failed';
export type SignInReturnProblem = 'linkFailed' | 'cancelled' | 'authUnreachable';
export type SessionRenewal = 'renewed' | 'refused' | 'unreachable';

const SESSION_STORAGE_KEY = 'astra-session';
const CODE_VERIFIER_STORAGE_KEY = `${SESSION_STORAGE_KEY}-code-verifier`;
const LINK_CODE_PARAM = 'code';
const RETURN_ERROR_PARAM = 'error';
const RETURN_ERROR_CODE_PARAM = 'error_code';
const REFUSED_AT_PROVIDER = 'access_denied';
const TOO_MANY_REQUESTS_STATUS = 429;
const NO_ANSWER_STATUS = 0;
const INVALID_EMAIL_CODES: ReadonlySet<string | undefined> = new Set(['validation_failed', 'email_address_invalid']);
const USABLE_EMAIL_ADDRESS = /^(?!.*\.\.)[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST_LINK_STORAGE_KEY = 'astra-last-link';
const LINK_COOLDOWN_MS = 60_000;

function createSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. On the local stack, run pnpm db:up.');
  }
  return createClient(url, publishableKey, {
    auth: { flowType: 'pkce', storageKey: SESSION_STORAGE_KEY },
    global: { fetch: fetchForAuth },
  });
}

const supabase = createSupabaseClient();

// A browser can block storage, and then reading it throws. The client keeps its session in memory there, so treat storage as empty.
function withStorage<Result>(action: (local: Storage, tab: Storage) => Result, whenBlocked: Result): Result {
  try {
    return action(window.localStorage, window.sessionStorage);
  } catch {
    return whenBlocked;
  }
}

function getReturnAddress() {
  return `${window.location.origin}/`;
}

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export function hasStoredSession(): boolean {
  return withStorage((local) => local.getItem(SESSION_STORAGE_KEY) !== null, false);
}

export function watchSignedInUser(onChange: (userId: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => onChange(session?.user.id ?? null));
  const followOtherTabs = (event: StorageEvent) => {
    if ((event.key === SESSION_STORAGE_KEY || event.key === null) && !hasStoredSession()) onChange(null);
  };
  window.addEventListener('storage', followOtherTabs);
  return () => {
    data.subscription.unsubscribe();
    window.removeEventListener('storage', followOtherTabs);
  };
}

// Without this browser's proof the client ignores a link's code and reports no error, so a code still here means it failed.
async function readSignInReturnProblem(): Promise<SignInReturnProblem | null> {
  const returnParams = new URLSearchParams(window.location.search);
  const { error } = await supabase.auth.initialize();
  const hasUnusedCode = new URLSearchParams(window.location.search).has(LINK_CODE_PARAM);
  if (!error && !hasUnusedCode) return null;
  window.history.replaceState(null, '', getReturnAddress());
  if (error && isAuthRetryableFetchError(error)) return 'authUnreachable';
  const wasCancelled = returnParams.get(RETURN_ERROR_PARAM) === REFUSED_AT_PROVIDER && !returnParams.has(RETURN_ERROR_CODE_PARAM);
  return wasCancelled ? 'cancelled' : 'linkFailed';
}

const signInReturnProblem = readSignInReturnProblem();

export function getSignInReturnProblem(): Promise<SignInReturnProblem | null> {
  return signInReturnProblem;
}

function toSendFailure(error: AuthError): Exclude<EmailLinkResult, 'sent'> {
  if (error.status === TOO_MANY_REQUESTS_STATUS) return 'tooManyRequests';
  if (INVALID_EMAIL_CODES.has(error.code)) return 'invalidEmail';
  return error.status === NO_ANSWER_STATUS ? 'failed' : 'authFailed';
}

// Auth ties a known address's newest link to the newest request, even a refused one, so asking too soon must not reach it.
function wasLinkJustSent(email: string): boolean {
  return withStorage((_local, tab) => {
    const lastLink = JSON.parse(tab.getItem(LAST_LINK_STORAGE_KEY) ?? 'null') as { email: string; sentAt: number } | null;
    return lastLink?.email === email.toLowerCase() && Date.now() - lastLink.sentAt < LINK_COOLDOWN_MS;
  }, false);
}

function rememberLinkSent(email: string) {
  withStorage((_local, tab) => tab.setItem(LAST_LINK_STORAGE_KEY, JSON.stringify({ email: email.toLowerCase(), sentAt: Date.now() })), undefined);
}

export async function sendEmailLink(email: string): Promise<EmailLinkResult> {
  if (!USABLE_EMAIL_ADDRESS.test(email)) return 'invalidEmail';
  if (wasLinkJustSent(email)) return 'tooManyRequests';
  const earlierLinkProof = withStorage((local) => local.getItem(CODE_VERIFIER_STORAGE_KEY), null);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getReturnAddress() } });
  if (!error) {
    rememberLinkSent(email);
    return 'sent';
  }
  // The client deletes this browser's proof when a send fails, which would kill a new address's link already in the inbox.
  if (earlierLinkProof) withStorage((local) => local.setItem(CODE_VERIFIER_STORAGE_KEY, earlierLinkProof), undefined);
  return toSendFailure(error);
}

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getReturnAddress() } });
}

export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

// Hides the page first, because the next document can take seconds to arrive, and the next person must not see this one.
export function restartAppAtHome(): void {
  document.documentElement.style.visibility = 'hidden';
  withStorage((_local, tab) => tab.removeItem(LAST_LINK_STORAGE_KEY), undefined);
  window.location.replace('/');
}

// A discarded refresh means another tab renewed first, so the session in storage is already the new one.
export async function renewSession(): Promise<SessionRenewal> {
  const { error } = await supabase.auth.refreshSession();
  if (!error || isAuthRefreshDiscardedError(error)) return 'renewed';
  return isAuthRetryableFetchError(error) ? 'unreachable' : 'refused';
}

function removeStoredSignIn() {
  withStorage((local) => {
    for (const key of Object.keys(local)) {
      if (key.startsWith(SESSION_STORAGE_KEY)) local.removeItem(key);
    }
  }, undefined);
}

export function forgetSession(): void {
  removeStoredSignIn();
  restartAppAtHome();
}

// The client's own read can wait on a refresh, so this reads storage to keep sign-out from waiting on Auth.
function readStoredAccessToken(): string | null {
  return withStorage((local) => (JSON.parse(local.getItem(SESSION_STORAGE_KEY) ?? 'null') as { access_token: string } | null)?.access_token ?? null, null);
}

// Clears the browser first, so a hung Auth or a closed tab cannot leave the next person signed in.
export function signOut(): void {
  const accessToken = readStoredAccessToken();
  forgetSession();
  if (accessToken) void supabase.auth.admin.signOut(accessToken, 'global');
}
