import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_STORAGE_KEY = 'astra-session';
const CODE_VERIFIER_KEY = 'astra-session-code-verifier';
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
  const replace = vi.fn();
  vi.stubGlobal('location', { ...window.location, origin: 'http://127.0.0.1:5521', href: 'http://127.0.0.1:5521/', replace });
  return replace;
}

async function loadSession() {
  vi.resetModules();
  return import('./session');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
    ['a failure inside Auth', 500, {}, 'authFailed'],
    ['a gateway that cannot reach Auth', 503, {}, 'authFailed'],
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

  it.each(['maya..parent@astra.test', 'maya@astra', 'maya@', '@astra.test', 'maya parent@astra.test', 'maya@astra..test'])(
    'calls %s invalid and asks Auth for nothing, because Auth answers some of these with a 500',
    async (address) => {
      const fetchStub = stubAuthAnswer(200, {});
      const { sendEmailLink } = await loadSession();

      await expect(sendEmailLink(address)).resolves.toBe('invalidEmail');
      expect(fetchStub).not.toHaveBeenCalled();
    },
  );

  it('asks Auth for nothing when the same address asks again within a minute, so the link in the inbox stays good', async () => {
    const fetchStub = stubAuthAnswer(200, {});
    const { sendEmailLink } = await loadSession();
    await sendEmailLink('maya@astra.test');
    const proof = localStorage.getItem(CODE_VERIFIER_KEY);
    fetchStub.mockClear();

    await expect(sendEmailLink('MAYA@astra.test')).resolves.toBe('tooManyRequests');

    expect(fetchStub).not.toHaveBeenCalled();
    expect(localStorage.getItem(CODE_VERIFIER_KEY)).toBe(proof);
  });

  it('remembers the last link across a reload of the page', async () => {
    const fetchStub = stubAuthAnswer(200, {});
    await (await loadSession()).sendEmailLink('maya@astra.test');
    fetchStub.mockClear();

    await expect((await loadSession()).sendEmailLink('maya@astra.test')).resolves.toBe('tooManyRequests');

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('lets a student fix a typo at once, because a different address is a different link', async () => {
    const fetchStub = stubAuthAnswer(200, {});
    const { sendEmailLink } = await loadSession();
    await sendEmailLink('maya@astra.tset');
    fetchStub.mockClear();

    await expect(sendEmailLink('maya@astra.test')).resolves.toBe('sent');

    expect(fetchStub).toHaveBeenCalled();
  });

  it('sends again after a minute, with a new proof', async () => {
    stubAuthAnswer(200, {});
    const { sendEmailLink } = await loadSession();
    await sendEmailLink('maya@astra.test');
    const proof = localStorage.getItem(CODE_VERIFIER_KEY);
    const startedAt = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt + 61_000);

    await expect(sendEmailLink('maya@astra.test')).resolves.toBe('sent');

    clock.mockRestore();
    expect(localStorage.getItem(CODE_VERIFIER_KEY)).not.toBe(proof);
  });

  it('keeps the proof for a link already in the inbox when Auth refuses a send that reaches it', async () => {
    stubAuthAnswer(200, {});
    const { sendEmailLink } = await loadSession();
    await sendEmailLink('new-student@astra.test');
    const proof = localStorage.getItem(CODE_VERIFIER_KEY);
    expect(proof).not.toBeNull();

    stubAuthAnswer(429, { error_code: 'over_email_send_rate_limit' });
    await expect(sendEmailLink('other@astra.test')).resolves.toBe('tooManyRequests');

    expect(localStorage.getItem(CODE_VERIFIER_KEY)).toBe(proof);
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
  it('forgets the session at once, then ends it on the server with the token it held', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    const fetchStub = stubAuthAnswer(204, {});
    const replace = stubLocation();
    const { signOut } = await loadSession();
    fetchStub.mockClear();

    signOut();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
    await vi.waitFor(() => expect(fetchStub).toHaveBeenCalled());
    const [url, init] = fetchStub.mock.calls[0] ?? [];
    expect(String(url)).toContain('/auth/v1/logout?scope=global');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer stored-access-token');
    expect(init?.keepalive).toBe(true);
  });

  it('is signed out on this browser while Auth never answers', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const replace = stubLocation();
    const { signOut } = await loadSession();

    signOut();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('calls Auth for nothing when no session is stored', async () => {
    const fetchStub = stubAuthAnswer(204, {});
    stubLocation();
    const { signOut } = await loadSession();
    fetchStub.mockClear();

    signOut();

    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('watchSignedInUser', () => {
  it('reports no user when another tab removes the session', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    const { watchSignedInUser } = await loadSession();
    const onChange = vi.fn();
    const stop = watchSignedInUser(onChange);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(USER.id));
    onChange.mockClear();

    localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));

    expect(onChange).toHaveBeenCalledWith(null);
    stop();
  });
});

describe('renewSession', () => {
  it.each([
    ['renewed', 200, STORED_SESSION],
    ['refused', 400, { error_code: 'refresh_token_not_found' }],
  ])('says %s from the answer of Auth', async (expected, status, body) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    stubAuthAnswer(status, body);
    const { renewSession } = await loadSession();

    await expect(renewSession()).resolves.toBe(expected);
  });

  it('says unreachable and keeps the session when Auth limits an expired session, because a limit says nothing about it', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...STORED_SESSION, expires_at: Math.floor(Date.now() / 1000) - 60 }));
    stubAuthAnswer(429, { error_code: 'over_request_rate_limit' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { renewSession } = await loadSession();

    const renewal = renewSession();
    await vi.advanceTimersByTimeAsync(TIME_FOR_ALL_REFRESH_RETRIES_MS);

    await expect(renewal).resolves.toBe('unreachable');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it('says unreachable and keeps the session when Auth cannot be reached', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { renewSession } = await loadSession();

    const renewal = renewSession();
    await vi.advanceTimersByTimeAsync(TIME_FOR_ALL_REFRESH_RETRIES_MS);

    await expect(renewal).resolves.toBe('unreachable');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });
});

describe('forgetSession', () => {
  it('forgets the session and restarts the app, with no call to Auth', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(STORED_SESSION));
    const fetchStub = stubAuthAnswer(204, {});
    const replace = stubLocation();
    const { forgetSession } = await loadSession();
    fetchStub.mockClear();

    forgetSession();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('getSignInReturnProblem', () => {
  it('finds none when the address holds no link', async () => {
    const { getSignInReturnProblem } = await loadSession();

    await expect(getSignInReturnProblem()).resolves.toBeNull();
  });

  it('calls it a failed link and cleans the address when a link opens in a browser without its proof', async () => {
    window.history.replaceState(null, '', '/?code=a-code-from-another-browser');
    const { getSignInReturnProblem } = await loadSession();

    await expect(getSignInReturnProblem()).resolves.toBe('linkFailed');
    await expect(getSignInReturnProblem()).resolves.toBe('linkFailed');
    expect(window.location.search).toBe('');
  });

  it('calls it a failed link and cleans the address when Auth sends an expired link back', async () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_code=otp_expired&error_description=expired');
    const { getSignInReturnProblem } = await loadSession();

    await expect(getSignInReturnProblem()).resolves.toBe('linkFailed');
    expect(window.location.search).toBe('');
  });

  it('blames the connection, not the link, when Auth cannot be reached to finish a link', async () => {
    window.history.replaceState(null, '', '/?code=a-good-code');
    localStorage.setItem('astra-session-code-verifier', JSON.stringify('a-proof'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    const { getSignInReturnProblem } = await loadSession();

    await expect(getSignInReturnProblem()).resolves.toBe('authUnreachable');
    expect(window.location.search).toBe('');
  });

  it('calls it cancelled and cleans the address when the student comes back from cancelling at Google', async () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_description=The+user+denied');
    const { getSignInReturnProblem } = await loadSession();

    await expect(getSignInReturnProblem()).resolves.toBe('cancelled');
    expect(window.location.search).toBe('');
  });
});
