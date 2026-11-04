/// <reference types="vite/client" />
import { forgetKeptBoards } from '../voice/keptBoard';
import { type AuthError, createClient, isAuthRefreshDiscardedError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { fetchForAuth } from './fetchForAuth';
import { areNewSignUpsStopped } from './signUpStop';

export type SendCodeResult = 'sent' | 'alreadySent' | 'signUpStopped' | 'invalidEmail' | 'tooManyRequests' | 'authFailed' | 'failed';
export type CheckCodeResult = 'signedIn' | 'codeWrong' | 'codeExpired' | 'tooManyTries' | 'authFailed' | 'failed';
export type SignInReturnProblem = 'returnFailed' | 'cancelled' | 'authUnreachable';
export interface CodeRequest {
  email: string;
  sentAt: number;
}
export type SessionRenewal = 'renewed' | 'refused' | 'unreachable';

export const RESEND_WAIT_MS = 60_000;

const CODE_LIFETIME_MS = 600_000;
const SESSION_STORAGE_KEY = 'astra-session';
const LINK_PROOF_KEY_START = `${SESSION_STORAGE_KEY}-`;
const RETURN_CODE_PARAM = 'code';
const RETURN_ERROR_PARAM = 'error';
const RETURN_ERROR_CODE_PARAM = 'error_code';
const REFUSED_AT_PROVIDER = 'access_denied';
const TOO_MANY_REQUESTS_STATUS = 429;
const NO_ANSWER_STATUS = 0;
const INVALID_EMAIL_CODES: ReadonlySet<string | undefined> = new Set(['validation_failed', 'email_address_invalid']);
const NEW_USER_REFUSED_CODE = 'otp_disabled';
const USABLE_EMAIL_ADDRESS = /^(?!.*\.\.)[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REFUSED_STATUS = 403;
const CODE_REFUSED = 'otp_expired';
const LAST_CODE_STORAGE_KEY = 'astra-last-code';
const KEPT_PAGE_DROP_EVENT: string = 'ASTRA_DROP_KEPT_PAGE';

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

// A browser can block storage so that reading it throws, and the client then keeps its session in memory.
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
  const followBoards = forgetBoardsOfOtherStudents();
  const tell = (userId: string | null) => {
    followBoards(userId);
    onChange(userId);
  };
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event !== KEPT_PAGE_DROP_EVENT) tell(session?.user.id ?? null);
  });
  const followOtherTabs = (event: StorageEvent) => {
    if ((event.key === SESSION_STORAGE_KEY || event.key === null) && !hasStoredSession()) tell(null);
  };
  window.addEventListener('storage', followOtherTabs);
  return () => {
    data.subscription.unsubscribe();
    window.removeEventListener('storage', followOtherTabs);
  };
}

// Without this browser's proof the client ignores Google's return code and reports no error, so a code still here means it failed.
async function readSignInReturnProblem(): Promise<SignInReturnProblem | null> {
  const returnParams = new URLSearchParams(window.location.search);
  const { error } = await supabase.auth.initialize();
  const hasUnusedCode = new URLSearchParams(window.location.search).has(RETURN_CODE_PARAM);
  if (!error && !hasUnusedCode) return null;
  window.history.replaceState(null, '', getReturnAddress());
  if (error && isAuthRetryableFetchError(error)) return 'authUnreachable';
  const wasCancelled = returnParams.get(RETURN_ERROR_PARAM) === REFUSED_AT_PROVIDER && !returnParams.has(RETURN_ERROR_CODE_PARAM);
  return wasCancelled ? 'cancelled' : 'returnFailed';
}

const signInReturnProblem = readSignInReturnProblem();

export function getSignInReturnProblem(): Promise<SignInReturnProblem | null> {
  return signInReturnProblem;
}

function toSendFailure(error: AuthError): Exclude<SendCodeResult, 'sent' | 'alreadySent'> {
  if (error.code === NEW_USER_REFUSED_CODE) return 'signUpStopped';
  if (error.status === TOO_MANY_REQUESTS_STATUS) return 'tooManyRequests';
  if (INVALID_EMAIL_CODES.has(error.code)) return 'invalidEmail';
  return error.status === NO_ANSWER_STATUS ? 'failed' : 'authFailed';
}

function isCodeRequest(stored: Partial<CodeRequest> | null): stored is CodeRequest {
  return typeof stored?.email === 'string' && typeof stored.sentAt === 'number';
}

export function readCodeRequest(): CodeRequest | null {
  return withStorage((_local, tab) => {
    const stored = JSON.parse(tab.getItem(LAST_CODE_STORAGE_KEY) ?? 'null') as Partial<CodeRequest> | null;
    return isCodeRequest(stored) ? stored : null;
  }, null);
}

export function isCodeStillGood({ sentAt }: CodeRequest): boolean {
  return Date.now() - sentAt < CODE_LIFETIME_MS;
}

// Sending to another address moves the tab's record on, and the code sent before it still works.
const sentAtThisPage = new Map<string, number>();

function findJustSentAt(email: string): number | null {
  const address = email.toLowerCase();
  const lastRequest = readCodeRequest();
  const sentAt = lastRequest?.email.toLowerCase() === address ? lastRequest.sentAt : sentAtThisPage.get(address);
  return sentAt !== undefined && Date.now() - sentAt < RESEND_WAIT_MS ? sentAt : null;
}

function rememberCodeSent(email: string, sentAt: number) {
  sentAtThisPage.set(email.toLowerCase(), sentAt);
  withStorage((_local, tab) => tab.setItem(LAST_CODE_STORAGE_KEY, JSON.stringify({ email, sentAt })), undefined);
}

function forgetCodeRequest() {
  sentAtThisPage.clear();
  withStorage((_local, tab) => tab.removeItem(LAST_CODE_STORAGE_KEY), undefined);
}

// The client keeps a proof for the link it expects in the mail, and without that proof no link can open a session here.
function removeLinkProofs() {
  withStorage((local) => {
    for (const key of Object.keys(local)) {
      if (key.startsWith(LINK_PROOF_KEY_START)) local.removeItem(key);
    }
  }, undefined);
}

export async function sendEmailCode(email: string): Promise<SendCodeResult> {
  if (!USABLE_EMAIL_ADDRESS.test(email)) return 'invalidEmail';
  const justSentAt = findJustSentAt(email);
  if (justSentAt !== null) {
    rememberCodeSent(email, justSentAt);
    return 'alreadySent';
  }
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: !areNewSignUpsStopped() } });
  removeLinkProofs();
  if (error) return toSendFailure(error);
  rememberCodeSent(email, Date.now());
  return 'sent';
}

// Auth answers a wrong code and an expired one in the same words, so only the time since sending can tell them apart.
function toCheckFailure(error: AuthError, sentAt: number): Exclude<CheckCodeResult, 'signedIn'> {
  if (error.status === TOO_MANY_REQUESTS_STATUS) return 'tooManyTries';
  if (error.status === CODE_REFUSED_STATUS && error.code === CODE_REFUSED) return isCodeStillGood({ email: '', sentAt }) ? 'codeWrong' : 'codeExpired';
  return error.status === NO_ANSWER_STATUS ? 'failed' : 'authFailed';
}

export async function checkEmailCode(email: string, code: string, sentAt: number): Promise<CheckCodeResult> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) return toCheckFailure(error, sentAt);
  forgetCodeRequest();
  return 'signedIn';
}

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getReturnAddress() } });
}

export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

// Chromium drops a kept page when a message reaches a channel it holds open, and the client holds this one.
function dropKeptPages() {
  try {
    const channel = new BroadcastChannel(SESSION_STORAGE_KEY);
    channel.postMessage({ event: KEPT_PAGE_DROP_EVENT });
    channel.close();
  } catch {
    // Leaving must still happen in a browser that has no channel or refuses one.
  }
}

// Hides the page first, because the next document can take seconds to arrive.
export function restartAppAtHome(): void {
  document.documentElement.style.visibility = 'hidden';
  forgetCodeRequest();
  dropKeptPages();
  window.location.replace('/');
}

// The client discards a refresh when storage changed under it, because another tab renewed or a sign-out cleared it.
export async function renewSession(): Promise<SessionRenewal> {
  const { error } = await supabase.auth.refreshSession();
  if (!error) return 'renewed';
  if (isAuthRefreshDiscardedError(error)) return hasStoredSession() ? 'renewed' : 'refused';
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
  forgetKeptBoards({ isSigningOut: true });
  restartAppAtHome();
}

/** A follower of who is signed in, which clears the boards kept in this tab when that person changes. */
export function forgetBoardsOfOtherStudents(): (userId: string | null) => void {
  let lastUserId: string | null = null;
  return (userId) => {
    if (lastUserId !== null && lastUserId !== userId) forgetKeptBoards();
    lastUserId = userId;
  };
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
