import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';
import { didEmailLinkFail, restartAppAtHome } from './session';

const USER_A = 'user-a';
const USER_B = 'user-b';

const signInEvents = vi.hoisted(() => ({ send: (() => undefined) as (userId: string | null) => void }));

vi.mock('./session', () => ({
  didEmailLinkFail: vi.fn(async () => false),
  restartAppAtHome: vi.fn(),
  watchSignedInUser: (onChange: (userId: string | null) => void) => {
    signInEvents.send = onChange;
    return () => undefined;
  },
}));

function ShowAuth() {
  const { signIn, didLinkFail } = useAuth();
  return (
    <p>
      {signIn.status} {String(didLinkFail)}
    </p>
  );
}

function renderProvider() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['home'], 'the first student data');
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ShowAuth />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

function send(userId: string | null) {
  act(() => signInEvents.send(userId));
}

beforeEach(() => {
  vi.mocked(restartAppAtHome).mockReset();
  vi.mocked(didEmailLinkFail).mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('waits for the first answer, then says who is signed in', async () => {
    renderProvider();
    await screen.findByText('loading false');

    send(USER_A);

    screen.getByText('signedIn false');
  });

  it('shows the sign-in state without a restart for a fresh sign-in', async () => {
    renderProvider();
    await screen.findByText('loading false');

    send(null);
    screen.getByText('signedOut false');
    send(USER_A);

    screen.getByText('signedIn false');
    expect(restartAppAtHome).not.toHaveBeenCalled();
  });

  it('empties the cache and then restarts the app on sign-out', async () => {
    const queryClient = renderProvider();
    await screen.findByText('loading false');
    send(USER_A);
    vi.mocked(restartAppAtHome).mockImplementation(() => {
      expect(queryClient.getQueryData(['home'])).toBeUndefined();
    });

    send(null);

    expect(restartAppAtHome).toHaveBeenCalledTimes(1);
  });

  it('empties the cache and restarts when another tab signs in as someone else', async () => {
    const queryClient = renderProvider();
    await screen.findByText('loading false');
    send(USER_A);

    send(USER_B);

    expect(queryClient.getQueryData(['home'])).toBeUndefined();
    expect(restartAppAtHome).toHaveBeenCalledTimes(1);
  });

  it('keeps the cache when the same student gets a new token', async () => {
    const queryClient = renderProvider();
    await screen.findByText('loading false');
    send(USER_A);

    send(USER_A);

    expect(queryClient.getQueryData(['home'])).toBe('the first student data');
    expect(restartAppAtHome).not.toHaveBeenCalled();
  });

  it('says when an email link failed', async () => {
    vi.mocked(didEmailLinkFail).mockResolvedValue(true);

    renderProvider();

    await screen.findByText('loading true');
  });

  it('reloads when the browser restores this page from memory, as on Back after sign-out', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderProvider();
    await screen.findByText('loading false');

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(reload).not.toHaveBeenCalled();

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
