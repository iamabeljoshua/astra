import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './apiError';

const SESSION_STORAGE_KEY = 'astra-session';
const OLD_TOKEN = 'old-access-token';
const NEW_TOKEN = 'new-access-token';
const USER = {
  id: '00000000-0000-4000-8000-0000000000a1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'maya@astra.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-11-03T00:00:00Z',
};
const storedSession = (accessToken: string) => ({
  access_token: accessToken,
  refresh_token: 'a-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: USER,
});
const jsonResponse = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface FakeServices {
  acceptsToken?: (token: string) => boolean;
  refreshStatus?: number;
}

function stubServices({ acceptsToken = (token) => token === NEW_TOKEN, refreshStatus = 200 }: FakeServices = {}) {
  const refreshes: string[] = [];
  const apiCalls: { path: string; method: string; token: string | null; body: string }[] = [];

  vi.stubGlobal('fetch', vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/auth/')) {
      refreshes.push(pathname);
      return refreshStatus === 200 ? jsonResponse(storedSession(NEW_TOKEN)) : jsonResponse({ error_code: 'refresh_token_not_found' }, refreshStatus);
    }
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? null;
    apiCalls.push({ path: pathname, method: request.method, token, body: await request.text() });
    return token && acceptsToken(token) ? jsonResponse({ answer: pathname }) : jsonResponse({ statusCode: 401 }, 401);
  }));

  return { refreshes, apiCalls };
}

async function loadApi() {
  vi.resetModules();
  const { api } = await import('./client');
  return api;
}

const getFailure = (call: Promise<unknown>) => call.then(() => null, (thrown: ApiError) => thrown);

beforeEach(() => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession(OLD_TOKEN)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a call the API refuses for its token', () => {
  it('renews once for calls refused together, and each is answered with the new token', async () => {
    const { refreshes, apiCalls } = stubServices();
    const api = await loadApi();

    await Promise.all([api.get('/me'), api.get('/home')]);

    expect(refreshes).toHaveLength(1);
    expect(apiCalls.filter(({ token }) => token === NEW_TOKEN).map(({ path }) => path).sort()).toEqual(['/api/home', '/api/me']);
  });

  it('sends a refused write again with the new token, so the student loses nothing', async () => {
    const { refreshes, apiCalls } = stubServices();
    const api = await loadApi();

    const answer = await api.post('/me/birth-date', { body: { birthDate: '2004-03-14' } });

    expect(answer).toEqual({ answer: '/api/me/birth-date' });
    expect(refreshes).toHaveLength(1);
    const body = JSON.stringify({ birthDate: '2004-03-14' });
    expect(apiCalls.map(({ method, token, body: sentBody }) => [method, token, sentBody])).toEqual([
      ['POST', OLD_TOKEN, body],
      ['POST', NEW_TOKEN, body],
    ]);
  });

  it('reports the fault and keeps the student signed in when the new token is refused too', async () => {
    const { refreshes } = stubServices({ acceptsToken: () => false });
    const api = await loadApi();

    const failure = await getFailure(api.get('/home'));

    expect(failure).toMatchObject({ kind: 'tokenRefusedAfterRenewal', status: 401 });
    expect(refreshes).toHaveLength(1);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it('signs the student out when Auth refuses the renewal', async () => {
    stubServices({ refreshStatus: 400 });
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: window.location.href, origin: window.location.origin, replace });
    const api = await loadApi();

    const failure = await getFailure(api.get('/home'));

    expect(failure).toMatchObject({ kind: 'rejected', status: 401 });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('does not renew for any other refusal', async () => {
    const { refreshes } = stubServices({ acceptsToken: () => true });
    vi.mocked(globalThis.fetch).mockImplementation(async () => jsonResponse({ statusCode: 403 }, 403));
    const api = await loadApi();

    const failure = await getFailure(api.get('/home'));

    expect(failure).toMatchObject({ kind: 'rejected', status: 403 });
    expect(refreshes).toEqual([]);
  });
});
