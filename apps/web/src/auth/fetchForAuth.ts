const REQUEST_TIMEOUT_MS = 10_000;
const LOGOUT_PATH = '/auth/v1/logout';
const REFRESH_GRANT = 'grant_type=refresh_token';
const TOO_MANY_REQUESTS_STATUS = 429;
const RETRYABLE_STATUS = 503;

// The client deletes the session on a refresh failure it cannot retry, and a rate limit says nothing about the session.
export async function fetchForAuth(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const response = await globalThis.fetch(input, {
    ...init,
    keepalive: url.includes(LOGOUT_PATH),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const isRateLimitedRefresh = response.status === TOO_MANY_REQUESTS_STATUS && url.includes(REFRESH_GRANT);
  return isRateLimitedRefresh ? new Response(response.body, { status: RETRYABLE_STATUS, headers: response.headers }) : response;
}
