const REQUEST_TIMEOUT_MS = 10_000;

// The Supabase client has no time limit of its own, so a server that never answers would leave a screen waiting forever.
export function fetchWithTimeLimit(input: RequestInfo | URL, init?: RequestInit) {
  return globalThis.fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}
