import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_LABELS, DEV_SIGN_IN_LABELS, LEGAL_PAGES, SIGN_IN_LABELS, TUTOR_NOTES_LABELS } from '../strings';
import { useAuth } from './AuthProvider';
import { sendEmailLink, signInWithGoogle } from './session';
import { SignInPage } from './SignInPage';
import { useSignInDraft } from './useSignInDraft';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('./session', () => ({
  sendEmailLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
}));

function SignInPageWithDraft() {
  return <SignInPage draft={useSignInDraft()} />;
}

function renderSignInPage() {
  render(
    <MemoryRouter>
      <SignInPageWithDraft />
    </MemoryRouter>,
  );
}

function chooseEmail() {
  fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.email }));
}

async function submitEmail(email: string) {
  fireEvent.change(screen.getByPlaceholderText(SIGN_IN_LABELS.emailPlaceholder), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.sendLink }));
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedOut' }, returnProblem: null });
  vi.mocked(sendEmailLink).mockReset();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SignInPage', () => {
  it('hides the Google button until the Google flag is set', () => {
    renderSignInPage();

    expect(screen.queryByRole('button', { name: SIGN_IN_LABELS.google })).toBeNull();
    screen.getByRole('button', { name: SIGN_IN_LABELS.email });
  });

  it('shows a working Google button when the flag is set', () => {
    vi.stubEnv('VITE_GOOGLE_SIGN_IN', 'on');

    renderSignInPage();
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.google }));

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('sends a link and says to check the email', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('sent');
    renderSignInPage();
    chooseEmail();

    await submitEmail('  maya@astra.test ');

    await screen.findByRole('heading', { name: SIGN_IN_LABELS.sentQuestion });
    screen.getByText('maya@astra.test', { selector: 'p' });
    expect(sendEmailLink).toHaveBeenCalledWith('maya@astra.test');
  });

  it('goes back to the address with its text kept, to fix a typo', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('sent');
    renderSignInPage();
    chooseEmail();
    await submitEmail('maya@astra.test');
    await screen.findByRole('heading', { name: SIGN_IN_LABELS.sentQuestion });

    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.useAnotherEmail }));

    expect(screen.getByPlaceholderText<HTMLInputElement>(SIGN_IN_LABELS.emailPlaceholder).value).toBe('maya@astra.test');
  });

  it('gives a stopped sign-up the same words as a closed account', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('signUpStopped');
    renderSignInPage();
    chooseEmail();

    await submitEmail('second-address@astra.test');

    expect((await screen.findByRole('alert')).textContent).toBe(ACCOUNT_LABELS.closed);
  });

  it.each(['invalidEmail', 'tooManyRequests', 'authFailed', 'failed'] as const)('says what went wrong for %s', async (result) => {
    vi.mocked(sendEmailLink).mockResolvedValue(result);
    renderSignInPage();
    chooseEmail();

    await submitEmail('maya@astra.test');

    await screen.findByText(SIGN_IN_LABELS[result]);
    screen.getByRole('button', { name: SIGN_IN_LABELS.sendLink });
  });

  it.each(['linkFailed', 'cancelled', 'authUnreachable'] as const)('says what happened on a return with %s', (returnProblem) => {
    vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedOut' }, returnProblem });

    renderSignInPage();

    expect(screen.getByRole('alert').textContent).toBe(SIGN_IN_LABELS[returnProblem]);
  });

  it('takes focus to the result when the link is sent, on a wide screen and a phone', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('sent');
    renderSignInPage();
    chooseEmail();

    await submitEmail('maya@astra.test');

    const heading = await screen.findByRole('heading', { name: SIGN_IN_LABELS.sentQuestion });
    expect(document.activeElement).toBe(heading);
  });

  it('ties the address to the heading, so a screen reader says where the link went', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('sent');
    renderSignInPage();
    chooseEmail();

    await submitEmail('maya@astra.test');

    const heading = await screen.findByRole('heading', { name: SIGN_IN_LABELS.sentQuestion });
    const description = (heading.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(description).toContain('maya@astra.test');
  });

  it.each([
    ['a wide screen, on the field', true, () => screen.getByPlaceholderText(SIGN_IN_LABELS.emailPlaceholder)],
    ['a phone, on the heading', false, () => screen.getByRole('heading', { name: SIGN_IN_LABELS.emailQuestion })],
  ])('takes focus into the email step on %s', (_caseName, isWide, getExpected) => {
    vi.stubGlobal('matchMedia', () => ({ matches: isWide }));
    renderSignInPage();

    chooseEmail();

    expect(document.activeElement).toBe(getExpected());
  });

  it('keeps focus on the button and sends once, and leaves it there when sending fails', async () => {
    let answerSend: (result: 'failed') => void = () => undefined;
    vi.mocked(sendEmailLink).mockImplementation(() => new Promise((resolve) => (answerSend = resolve)));
    renderSignInPage();
    chooseEmail();
    fireEvent.change(screen.getByPlaceholderText(SIGN_IN_LABELS.emailPlaceholder), { target: { value: 'maya@astra.test' } });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: SIGN_IN_LABELS.sendLink });
    button.focus();

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(sendEmailLink).toHaveBeenCalledTimes(1);

    await act(async () => answerSend('failed'));

    await screen.findByText(SIGN_IN_LABELS.failed);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('false');
  });

  it('ties a refused address to its message', async () => {
    vi.mocked(sendEmailLink).mockResolvedValue('invalidEmail');
    renderSignInPage();
    chooseEmail();

    await submitEmail('maya@astra');

    const message = await screen.findByRole('alert');
    const field = screen.getByPlaceholderText(SIGN_IN_LABELS.emailPlaceholder);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(message.id);
  });

  it.each([
    ['the welcome step', () => undefined],
    ['the email step', chooseEmail],
  ])('links the agreement words to both pages on %s', (_stepName, reachStep) => {
    renderSignInPage();
    reachStep();

    expect(screen.getByRole('link', { name: LEGAL_PAGES.terms.title }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: LEGAL_PAGES.privacy.title }).getAttribute('href')).toBe('/privacy');
  });

  it('shows the change-later note on the sign-in page', () => {
    renderSignInPage();

    screen.getByText(TUTOR_NOTES_LABELS.footer);
  });

  it('offers the development sign-in in a development build', async () => {
    renderSignInPage();

    await screen.findByRole('heading', { name: DEV_SIGN_IN_LABELS.title });
  });
});
