import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_SIGN_IN_LABELS, SIGN_IN_LABELS } from '../strings';
import { useAuth } from './AuthProvider';
import { sendEmailLink, signInWithGoogle } from './session';
import { SignInPage } from './SignInPage';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('./session', () => ({
  sendEmailLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
}));

function chooseEmail() {
  fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.email }));
}

async function submitEmail(email: string) {
  fireEvent.change(screen.getByPlaceholderText(SIGN_IN_LABELS.emailPlaceholder), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.sendLink }));
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedOut' }, didLinkFail: false });
  vi.mocked(sendEmailLink).mockReset();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SignInPage', () => {
  it('hides the Google button until the Google flag is set', () => {
    render(<SignInPage />);

    expect(screen.queryByRole('button', { name: SIGN_IN_LABELS.google })).toBeNull();
    screen.getByRole('button', { name: SIGN_IN_LABELS.email });
  });

  it('shows a working Google button when the flag is set', () => {
    vi.stubEnv('VITE_GOOGLE_SIGN_IN', 'on');

    render(<SignInPage />);
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.google }));

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('sends a link and says to check the email', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('sent');
    render(<SignInPage />);
    chooseEmail();

    await submitEmail('  maya@astra.test ');

    await screen.findByRole('heading', { name: SIGN_IN_LABELS.sentQuestion });
    screen.getByText('maya@astra.test');
    expect(sendEmailLink).toHaveBeenCalledWith('maya@astra.test');
  });

  it('goes back to the address with its text kept, to fix a typo', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('sent');
    render(<SignInPage />);
    chooseEmail();
    await submitEmail('maya@astra.test');
    await screen.findByRole('heading', { name: SIGN_IN_LABELS.sentQuestion });

    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.useAnotherEmail }));

    expect(screen.getByPlaceholderText<HTMLInputElement>(SIGN_IN_LABELS.emailPlaceholder).value).toBe('maya@astra.test');
  });

  it.each(['invalidEmail', 'tooManyRequests', 'failed'] as const)('says what went wrong for %s', async (result) => {
    vi.mocked(sendEmailLink).mockResolvedValue(result);
    render(<SignInPage />);
    chooseEmail();

    await submitEmail('maya@astra.test');

    await screen.findByText(SIGN_IN_LABELS[result]);
    screen.getByRole('button', { name: SIGN_IN_LABELS.sendLink });
  });

  it('says when an email link failed', () => {
    vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedOut' }, didLinkFail: true });

    render(<SignInPage />);

    screen.getByText(SIGN_IN_LABELS.linkFailed);
  });

  it('offers the development sign-in in a development build', async () => {
    render(<SignInPage />);

    await screen.findByRole('heading', { name: DEV_SIGN_IN_LABELS.title });
  });
});
