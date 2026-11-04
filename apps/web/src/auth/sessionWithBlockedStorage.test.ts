import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function blockStorage() {
  const blocked = () => {
    throw new DOMException('Storage is blocked.', 'SecurityError');
  };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
}

beforeEach(() => {
  blockStorage();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a browser that blocks storage', () => {
  it('gets the sign-in page, because no session is stored', async () => {
    const { hasStoredSession } = await import('./session');

    expect(hasStoredSession()).toBe(false);
  });

  it('can still ask for a code', async () => {
    const { sendEmailCode } = await import('./session');

    await expect(sendEmailCode('maya@astra.test')).resolves.toBe('sent');
  });

  it('still restarts the app on sign-out', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, origin: 'http://127.0.0.1:5521', replace });
    const { signOut } = await import('./session');

    signOut();

    expect(replace).toHaveBeenCalledWith('/');
  });
});
