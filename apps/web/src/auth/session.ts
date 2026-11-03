/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeLimit } from './fetchWithTimeLimit';

export type EmailLinkResult = 'sent' | 'invalidEmail' | 'tooManyRequests' | 'failed';

const SESSION_STORAGE_KEY = 'astra-session';
const LINK_CODE_PARAM = 'code';
const TOO_MANY_REQUESTS_STATUS = 429;
const INVALID_EMAIL_CODES: ReadonlySet<string | undefined> = new Set(['validation_failed', 'email_address_invalid']);

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
async function readEmailLinkFailure(): Promise<boolean> {
  const { error } = await supabase.auth.initialize();
  const hasUnusedCode = new URLSearchParams(window.location.search).has(LINK_CODE_PARAM);
  if (!error && !hasUnusedCode) return false;
  window.history.replaceState(null, '', getReturnAddress());
  return true;
}

const emailLinkFailure = readEmailLinkFailure();

export function didEmailLinkFail(): Promise<boolean> {
  return emailLinkFailure;
}

export async function sendEmailLink(email: string): Promise<EmailLinkResult> {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getReturnAddress() } });
  if (!error) return 'sent';
  if (error.status === TOO_MANY_REQUESTS_STATUS) return 'tooManyRequests';
  return INVALID_EMAIL_CODES.has(error.code) ? 'invalidEmail' : 'failed';
}

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getReturnAddress() } });
}

export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export function restartAppAtHome(): void {
  window.location.assign('/');
}

export async function renewSession(): Promise<boolean> {
  const { error } = await supabase.auth.refreshSession();
  return !error;
}

export async function forgetSession(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (!error) return;
  // With Auth out of reach the client may keep its session, and the student asked to leave, so forget it here.
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  restartAppAtHome();
}
