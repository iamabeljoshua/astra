/// <reference types="vite/client" />
import { type AuthError, createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { fetchWithTimeLimit } from './fetchWithTimeLimit';

export type EmailLinkResult = 'sent' | 'invalidEmail' | 'tooManyRequests' | 'authFailed' | 'failed';
export type SignInReturnProblem = 'linkFailed' | 'cancelled';
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

function createSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. On the local stack, run pnpm db:up.');
  }
  return createClient(url, publishableKey, {
    auth: { flowType: 'pkce', storageKey: SESSION_STORAGE_KEY },
    global: { fetch: fetchWithTimeLimit },
  });
}

const supabase = createSupabaseClient();

function getReturnAddress() {
  return `${window.location.origin}/`;
}

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export function watchSignedInUser(onChange: (userId: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => onChange(session?.user.id ?? null));
  return () => data.subscription.unsubscribe();
}

// Without this browser's proof the client ignores a link's code and reports no error, so a code still here means it failed.
// Auth gives a failed link an error code, and a student who cancels at the provider comes back with none.
async function readSignInReturnProblem(): Promise<SignInReturnProblem | null> {
  const returnParams = new URLSearchParams(window.location.search);
  const { error } = await supabase.auth.initialize();
  const hasUnusedCode = new URLSearchParams(window.location.search).has(LINK_CODE_PARAM);
  if (!error && !hasUnusedCode) return null;
  window.history.replaceState(null, '', getReturnAddress());
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

export async function sendEmailLink(email: string): Promise<EmailLinkResult> {
  if (!USABLE_EMAIL_ADDRESS.test(email)) return 'invalidEmail';
  const earlierLinkProof = window.localStorage.getItem(CODE_VERIFIER_STORAGE_KEY);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getReturnAddress() } });
  if (!error) return 'sent';
  // The client deletes this browser's proof when a send fails, which would kill a good link already in the inbox.
  if (earlierLinkProof) window.localStorage.setItem(CODE_VERIFIER_STORAGE_KEY, earlierLinkProof);
  return toSendFailure(error);
}

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getReturnAddress() } });
}

export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

// Replaces this history entry, so Back cannot restore the last student's page from memory.
export function restartAppAtHome(): void {
  window.location.replace('/');
}

export async function renewSession(): Promise<SessionRenewal> {
  const { error } = await supabase.auth.refreshSession();
  if (!error) return 'renewed';
  return isAuthRetryableFetchError(error) ? 'unreachable' : 'refused';
}

// With Auth out of reach the client may keep its session, and the student must still leave, so forget it here.
async function endSession(scope: 'global' | 'local'): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope });
  if (!error) return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  restartAppAtHome();
}

export function forgetSession(): Promise<void> {
  return endSession('local');
}

export function signOut(): Promise<void> {
  return endSession('global');
}
