import { afterEach, describe, expect, it, vi } from 'vitest';

const OTHER_AUTH_CALL = 'http://auth.test/auth/v1/otp';
const REFRESH_CALL = 'http://auth.test/auth/v1/token?grant_type=refresh_token';
const LOGOUT_CALL = 'http://auth.test/auth/v1/logout?scope=global';

function stubFetchThatHangsUntilAborted() {
  const fetchStub = vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
  );
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

async function loadFetchForAuth() {
  vi.resetModules();
  return (await import('./fetchForAuth')).fetchForAuth;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchForAuth', () => {
  it('gives up on a call that hangs when its time limit ends, because a hung Auth must not hold the page', async () => {
    const timeLimit = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeLimit.signal);
    stubFetchThatHangsUntilAborted();
    const fetchForAuth = await loadFetchForAuth();

    const call = fetchForAuth(OTHER_AUTH_CALL).catch((reason: unknown) => reason);
    timeLimit.abort(new DOMException('The time limit ended.', 'TimeoutError'));

    expect(await call).toMatchObject({ name: 'TimeoutError' });
  });

  it('still stops when the caller cancels', async () => {
    stubFetchThatHangsUntilAborted();
    const fetchForAuth = await loadFetchForAuth();
    const controller = new AbortController();

    const call = fetchForAuth(OTHER_AUTH_CALL, { signal: controller.signal }).catch((reason: unknown) => reason);
    controller.abort(new DOMException('The caller left.', 'AbortError'));

    expect(await call).toMatchObject({ name: 'AbortError' });
  });

  it('lets only the logout call outlive the page', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchStub);
    const fetchForAuth = await loadFetchForAuth();

    await fetchForAuth(LOGOUT_CALL);
    await fetchForAuth(OTHER_AUTH_CALL);

    expect(fetchStub.mock.calls.map(([, init]) => init?.keepalive)).toEqual([true, false]);
  });

  it('answers a limited refresh as retryable, and holds its retries back from Auth for the time the client keeps retrying', async () => {
    vi.useFakeTimers();
    const fetchStub = vi.fn<typeof fetch>(async () => new Response('{}', { status: 429 }));
    vi.stubGlobal('fetch', fetchStub);
    const fetchForAuth = await loadFetchForAuth();

    expect((await fetchForAuth(REFRESH_CALL)).status).toBe(503);
    await vi.advanceTimersByTimeAsync(29_000);
    expect((await fetchForAuth(REFRESH_CALL)).status).toBe(503);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    await fetchForAuth(REFRESH_CALL);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('passes other limits through, because a send has its own message for them', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('{}', { status: 429 })));
    const fetchForAuth = await loadFetchForAuth();

    expect((await fetchForAuth(OTHER_AUTH_CALL)).status).toBe(429);
  });
});
