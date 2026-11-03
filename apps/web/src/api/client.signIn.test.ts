import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '../auth/session';
import { api } from './client';

vi.mock('../auth/session', () => ({ getAccessToken: vi.fn() }));

function stubHealthyFetch() {
  const fetchStub = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(JSON.stringify({ status: 'ok' })));
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the sign-in token on API calls', () => {
  it('sends the token of the signed-in student', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('the-token');
    const fetchStub = stubHealthyFetch();

    await api.get('/health');

    expect(fetchStub.mock.calls[0]?.[0].headers.get('Authorization')).toBe('Bearer the-token');
  });

  it('sends no token when nobody is signed in', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(null);
    const fetchStub = stubHealthyFetch();

    await api.get('/health');

    expect(fetchStub.mock.calls[0]?.[0].headers.has('Authorization')).toBe(false);
  });

  it('asks for the token on each call, so a refreshed token is used', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce('first-token').mockResolvedValueOnce('second-token');
    const fetchStub = stubHealthyFetch();

    await api.get('/health');
    await api.get('/health');

    expect(fetchStub.mock.calls[1]?.[0].headers.get('Authorization')).toBe('Bearer second-token');
  });
});
