const REQUEST_TIMEOUT_MS = 10_000;
const LOGOUT_PATH = '/auth/v1/logout';
const REFRESH_GRANT = 'grant_type=refresh_token';
const TOO_MANY_REQUESTS_STATUS = 429;
const RETRYABLE_STATUS = 503;
// How long the client keeps retrying a retryable answer.
const REFRESH_PAUSE_AFTER_LIMIT_MS = 30_000;

let refreshPausedUntil = 0;

function getRequestSignal(callerSignal: AbortSignal | null | undefined) {
  const timeLimit = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return callerSignal ? AbortSignal.any([callerSignal, timeLimit]) : timeLimit;
}

// The client deletes the session on a refresh failure it cannot retry. A limit says nothing about the session, so it becomes retryable, and the retries stop here.
export async function fetchForAuth(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const isRefresh = url.includes(REFRESH_GRANT);
  if (isRefresh && Date.now() < refreshPausedUntil) return new Response(null, { status: RETRYABLE_STATUS });
  const response = await globalThis.fetch(input, {
    ...init,
    keepalive: url.includes(LOGOUT_PATH),
    signal: getRequestSignal(init?.signal),
  });
  if (!isRefresh || response.status !== TOO_MANY_REQUESTS_STATUS) return response;
  refreshPausedUntil = Date.now() + REFRESH_PAUSE_AFTER_LIMIT_MS;
  return new Response(response.body, { status: RETRYABLE_STATUS, headers: response.headers });
}
