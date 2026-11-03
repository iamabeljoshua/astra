import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_STORAGE_KEY = 'astra-session';
const TIME_FOR_ALL_REFRESH_RETRIES_MS = 60_000;
const USER = {
  id: '00000000-0000-4000-8000-0000000000a1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'maya@astra.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-11-03T00:00:00Z',
};
const STORED_SESSION = {
  access_token: 'stored-access-token',
  refresh_token: 'stored-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: USER,
};

function stubAuthAnswer(status: number, body: object) {
  const fetchStub = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

function stubLocation() {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, origin: 'http://127.0.0.1:5521', href: 'http://127.0.0.1:5521/', assign });
  return assign;
}

async function loadSession() {
  vi.resetModules();
  return import('./session');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sendEmailLink', () => {
  it('asks Auth for a link that returns to this app, with a proof that binds it to this browser', async () => {
    const fetchStub = stubAuthAnswer(200, {});
    stubLocation();
    const { sendEmailLink } = await loadSession();

    await expect(sendEmailLink('maya@astra.test')).resolves.toBe('sent');

    const [url, init] = fetchStub.mock.calls[0] ?? [];
    expect(String(url)).toContain('/auth/v1/otp');
    expect(new URL(String(url)).searchParams.get('redirect_to')).toBe('http://127.0.0.1:5521/');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: 'maya@astra.test',
      code_challenge: expect.any(String),
      code_challenge_method: 's256',
    });
  });

  it.each([
    ['too many requests', 429, { error_code: 'over_email_send_rate_limit' }, 'tooManyRequests'],
    ['a bad address', 400, { error_code: 'validation_failed' }, 'invalidEmail'],
    ['a server failure', 500, {}, 'failed'],
  ])('reports %s', async (_caseName, status, body, expected) => {
    stubAuthAnswer(status, body);
    const { sendEmailLink } = await loadSession();

    await expect(sendEmailLink('maya@astra.test')).resolves.toBe(expected);
  });

  it('reports a failure when Auth cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    const { sendEmailLink } = await loadSession();

    await expect(sendEmailLink('maya@astra.test')).resolves.toBe('failed');
  });
});

describe('the stored session', () => {
  it('gives no token when nobody is signed in', async () => {
    const { getAccessToken } = await loadSession();

    await expect(getAccessToken()).resolves.toBeNull();
  });

  it('gives the token and the user of a stored session', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    const { getAccessToken, watchSignedInUser } = await loadSession();

    await expect(getAccessToken()).resolves.toBe('stored-access-token');
    const userId = await new Promise((resolve) => {
      const stop = watchSignedInUser((id) => {
        resolve(id);
        queueMicrotask(() => stop());
      });
    });
    expect(userId).toBe(USER.id);
  });
});

describe('an expired session', () => {
  const EXPIRED_SESSION = { ...STORED_SESSION, expires_at: Math.floor(Date.now() / 1000) - 60 };

  it('gets a new token from Auth', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(EXPIRED_SESSION));
    stubAuthAnswer(200, { ...STORED_SESSION, access_token: 'new-access-token' });
    const { getAccessToken } = await loadSession();

    await expect(getAccessToken()).resolves.toBe('new-access-token');
  });

  it('throws instead of giving no token when Auth cannot be reached, and keeps the session', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(EXPIRED_SESSION));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { getAccessToken } = await loadSession();

    const thrown = getAccessToken().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(TIME_FOR_ALL_REFRESH_RETRIES_MS);

    expect(await thrown).toBeInstanceOf(Error);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });
});

describe('signOut', () => {
  it('ends the session on the server and forgets it', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    const fetchStub = stubAuthAnswer(204, {});
    const { getAccessToken, signOut } = await loadSession();

    await signOut();

    expect(fetchStub.mock.calls.some(([url]) => String(url).includes('/auth/v1/logout'))).toBe(true);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    await expect(getAccessToken()).resolves.toBeNull();
  });

  it('forgets the session and restarts the app when Auth cannot be reached', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    const assign = stubLocation();
    const { signOut } = await loadSession();

    await signOut();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(assign).toHaveBeenCalledWith('/');
  });
});

describe('didEmailLinkFail', () => {
  it('says no when the address holds no link', async () => {
    const { didEmailLinkFail } = await loadSession();

    await expect(didEmailLinkFail()).resolves.toBe(false);
  });

  it('says yes and cleans the address when a link opens in a browser without its proof', async () => {
    window.history.replaceState(null, '', '/?code=a-code-from-another-browser');
    const { didEmailLinkFail } = await loadSession();

    await expect(didEmailLinkFail()).resolves.toBe(true);
    await expect(didEmailLinkFail()).resolves.toBe(true);
    expect(window.location.search).toBe('');
  });

  it('says yes and cleans the address when Auth sends an expired link back', async () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_code=otp_expired&error_description=expired');
    const { didEmailLinkFail } = await loadSession();

    await expect(didEmailLinkFail()).resolves.toBe(true);
    expect(window.location.search).toBe('');
  });
});
