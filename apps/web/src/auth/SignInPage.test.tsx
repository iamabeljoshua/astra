import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_LABELS, DEV_SIGN_IN_LABELS, LEGAL_PAGES, SIGN_IN_LABELS } from '../strings';
import { stubCanvas } from '../test/fakeCanvas';
import { useAuth } from './AuthProvider';
import { checkEmailCode, sendEmailCode, signInWithGoogle } from './session';
import { SignInPage } from './SignInPage';
import { useSignInDraft } from './useSignInDraft';

const LEAVE_OR_RETURN = 'Leave or return';
const STUDENT_EMAIL = 'maya@astra.test';
const FULL_CODE = '123456';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('./session', async (importOriginal) => {
  const { RESEND_WAIT_MS } = await importOriginal<typeof import('./session')>();
  return {
    RESEND_WAIT_MS,
    checkEmailCode: vi.fn(),
    isCodeStillGood: () => true,
    readCodeRequest: vi.fn(() => null),
    sendEmailCode: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithPassword: vi.fn(),
  };
});

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

function SignInPageThatCanBeLeft() {
  const draft = useSignInDraft();
  const [isAway, setIsAway] = useState(false);

  return (
    <MemoryRouter>
      <button type="button" onClick={() => setIsAway(!isAway)}>{LEAVE_OR_RETURN}</button>
      {!isAway && <SignInPage draft={draft} />}
    </MemoryRouter>
  );
}

function getEmailField() {
  return screen.getByRole<HTMLInputElement>('textbox', { name: SIGN_IN_LABELS.emailLabel });
}

function getCodeField() {
  return screen.getByRole<HTMLInputElement>('textbox', { name: SIGN_IN_LABELS.codeLabel });
}

function submitEmail(email: string) {
  fireEvent.change(getEmailField(), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.sendCode }));
}

async function reachCodeStep() {
  vi.mocked(sendEmailCode).mockResolvedValue('sent');
  renderSignInPage();
  submitEmail(STUDENT_EMAIL);
  await screen.findByRole('heading', { name: SIGN_IN_LABELS.codeLine });
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedOut' }, returnProblem: null });
  vi.mocked(sendEmailCode).mockReset();
  vi.mocked(checkEmailCode).mockReset();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the email step', () => {
  it('shows the tagline and the tutor line on one screen, with the field already there', () => {
    renderSignInPage();

    screen.getByText(SIGN_IN_LABELS.tagline);
    screen.getByRole('heading', { level: 1, name: SIGN_IN_LABELS.welcomeLine });
    getEmailField();
  });

  it('hides the Google button until the Google flag is set', () => {
    renderSignInPage();

    expect(screen.queryByRole('button', { name: SIGN_IN_LABELS.google })).toBeNull();
  });

  it('shows a working Google button when the flag is set', () => {
    vi.stubEnv('VITE_GOOGLE_SIGN_IN', 'on');

    renderSignInPage();
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.google }));

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('sends a code to the trimmed address and moves to the code step', async () => {
    vi.mocked(sendEmailCode).mockResolvedValue('sent');
    renderSignInPage();

    submitEmail(`  ${STUDENT_EMAIL} `);

    await screen.findByRole('heading', { name: SIGN_IN_LABELS.codeLine });
    screen.getByText(SIGN_IN_LABELS.sentTo(STUDENT_EMAIL));
    expect(sendEmailCode).toHaveBeenCalledWith(STUDENT_EMAIL);
  });

  it('moves to the code step when the code went out moments ago, so a second press costs nothing', async () => {
    vi.mocked(sendEmailCode).mockResolvedValue('alreadySent');
    renderSignInPage();

    submitEmail(STUDENT_EMAIL);

    await screen.findByRole('heading', { name: SIGN_IN_LABELS.codeLine });
  });

  it('gives a stopped sign-up the same words as a closed account', async () => {
    vi.mocked(sendEmailCode).mockResolvedValue('signUpStopped');
    renderSignInPage();

    submitEmail('second-address@astra.test');

    expect((await screen.findByRole('alert')).textContent).toBe(ACCOUNT_LABELS.closed);
  });

  it.each(['invalidEmail', 'tooManyRequests', 'authFailed', 'failed'] as const)('says what went wrong for %s and stays on the step', async (result) => {
    vi.mocked(sendEmailCode).mockResolvedValue(result);
    renderSignInPage();

    submitEmail(STUDENT_EMAIL);

    expect((await screen.findByRole('alert')).textContent).toBe(SIGN_IN_LABELS[result]);
    screen.getByRole('button', { name: SIGN_IN_LABELS.sendCode });
  });

  it.each(['returnFailed', 'cancelled', 'authUnreachable'] as const)('says what happened on a return with %s', (returnProblem) => {
    vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedOut' }, returnProblem });

    renderSignInPage();

    expect(screen.getByRole('alert').textContent).toBe(SIGN_IN_LABELS[returnProblem]);
  });

  it.each([
    ['a wide screen, on the field', true, getEmailField],
    ['a phone, on the heading', false, () => screen.getByRole('heading', { name: SIGN_IN_LABELS.welcomeLine })],
  ])('takes focus on %s', (_caseName, isWide, getExpected) => {
    vi.stubGlobal('matchMedia', () => ({ matches: isWide }));

    renderSignInPage();

    expect(document.activeElement).toBe(getExpected());
  });

  it('keeps focus on the button and sends once, and leaves it there when sending fails', async () => {
    let answerSend: (result: 'failed') => void = () => undefined;
    vi.mocked(sendEmailCode).mockImplementation(() => new Promise((resolve) => (answerSend = resolve)));
    renderSignInPage();
    fireEvent.change(getEmailField(), { target: { value: STUDENT_EMAIL } });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: SIGN_IN_LABELS.sendCode });
    button.focus();

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(sendEmailCode).toHaveBeenCalledTimes(1);

    await act(async () => answerSend('failed'));

    await screen.findByText(SIGN_IN_LABELS.failed);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('false');
  });

  it('sends once when the student opens another page during a send and comes back, because a second send would replace the first code', async () => {
    let answerSend: (result: 'sent') => void = () => undefined;
    vi.mocked(sendEmailCode).mockImplementation(() => new Promise((resolve) => (answerSend = resolve)));
    render(<SignInPageThatCanBeLeft />);
    fireEvent.change(getEmailField(), { target: { value: STUDENT_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.sendCode }));

    fireEvent.click(screen.getByRole('button', { name: LEAVE_OR_RETURN }));
    fireEvent.click(screen.getByRole('button', { name: LEAVE_OR_RETURN }));
    const button = screen.getByRole('button', { name: SIGN_IN_LABELS.sendCode });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);

    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    await act(async () => answerSend('sent'));
    await screen.findByRole('heading', { name: SIGN_IN_LABELS.codeLine });
  });

  it('ties a refused address to its message', async () => {
    vi.mocked(sendEmailCode).mockResolvedValue('invalidEmail');
    renderSignInPage();

    submitEmail('maya@astra');

    const message = await screen.findByRole('alert');
    expect(getEmailField().getAttribute('aria-invalid')).toBe('true');
    expect(getEmailField().getAttribute('aria-describedby')).toBe(message.id);
  });

  it('links the agreement words to both pages', () => {
    renderSignInPage();

    expect(screen.getByRole('link', { name: LEGAL_PAGES.terms.title }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: LEGAL_PAGES.privacy.title }).getAttribute('href')).toBe('/privacy');
  });

  it('keeps the development sign-in behind one quiet button in a development build', async () => {
    renderSignInPage();

    const opener = await screen.findByRole('button', { name: DEV_SIGN_IN_LABELS.title });
    expect(screen.queryByRole('button', { name: 'maya@astra.test' })).toBeNull();
    fireEvent.click(opener);

    screen.getByRole('button', { name: 'maya@astra.test' });
  });
});

describe('the code step', () => {
  it('ties the address to the heading, so a screen reader says where the code went', async () => {
    await reachCodeStep();

    const heading = screen.getByRole('heading', { name: SIGN_IN_LABELS.codeLine });
    expect(document.getElementById(heading.getAttribute('aria-describedby') ?? '')?.textContent).toContain(STUDENT_EMAIL);
    expect(document.activeElement).toBe(heading);
  });

  it('checks the code at the sixth digit, for this address', async () => {
    vi.mocked(checkEmailCode).mockResolvedValue('signedIn');
    await reachCodeStep();

    fireEvent.change(getCodeField(), { target: { value: '12345' } });
    expect(checkEmailCode).not.toHaveBeenCalled();
    fireEvent.change(getCodeField(), { target: { value: FULL_CODE } });

    expect(checkEmailCode).toHaveBeenCalledWith(STUDENT_EMAIL, FULL_CODE, expect.any(Number));
    await screen.findByText(SIGN_IN_LABELS.checking);
    await act(async () => undefined);
  });

  it('checks once while a check is on its way', async () => {
    let answerCheck: (result: 'codeWrong') => void = () => undefined;
    vi.mocked(checkEmailCode).mockImplementation(() => new Promise((resolve) => (answerCheck = resolve)));
    await reachCodeStep();

    fireEvent.change(getCodeField(), { target: { value: FULL_CODE } });
    expect(getCodeField().readOnly).toBe(true);
    fireEvent.change(getCodeField(), { target: { value: '654321' } });

    expect(checkEmailCode).toHaveBeenCalledTimes(1);
    await act(async () => answerCheck('codeWrong'));
  });

  it.each([
    ['codeWrong', SIGN_IN_LABELS.codeWrong],
    ['codeExpired', SIGN_IN_LABELS.codeExpired],
    ['tooManyTries', SIGN_IN_LABELS.tooManyTries],
    ['authFailed', SIGN_IN_LABELS.checkAuthFailed],
    ['failed', SIGN_IN_LABELS.checkFailed],
  ] as const)('says what happened for %s, clears the boxes, and ties the message to the field', async (result, label) => {
    vi.mocked(checkEmailCode).mockResolvedValue(result);
    await reachCodeStep();

    fireEvent.change(getCodeField(), { target: { value: FULL_CODE } });

    const message = await screen.findByRole('alert');
    expect(message.textContent).toBe(label);
    expect(getCodeField().value).toBe('');
    expect(getCodeField().getAttribute('aria-invalid')).toBe('true');
    expect(getCodeField().getAttribute('aria-describedby')).toBe(message.id);
  });

  it('says a return failed on this step too, because a reload can bring a student back here', async () => {
    vi.mocked(useAuth).mockReturnValue({ signIn: { status: 'signedOut' }, returnProblem: 'returnFailed' });
    await reachCodeStep();

    expect(screen.getByRole('alert').textContent).toBe(SIGN_IN_LABELS.returnFailed);
  });

  it('puts the mark on the first box when a wrong code empties the boxes', async () => {
    vi.mocked(checkEmailCode).mockResolvedValue('codeWrong');
    await reachCodeStep();
    getCodeField().focus();
    fireEvent.change(getCodeField(), { target: { value: FULL_CODE } });
    getCodeField().setSelectionRange(FULL_CODE.length, FULL_CODE.length);
    fireEvent.select(getCodeField());
    await screen.findByRole('alert');

    expect(document.querySelector('[data-active="true"]')).toBe(document.querySelector('[data-active]'));
  });

  it('clears the message when the student starts typing again', async () => {
    vi.mocked(checkEmailCode).mockResolvedValue('codeWrong');
    await reachCodeStep();
    fireEvent.change(getCodeField(), { target: { value: FULL_CODE } });
    await screen.findByRole('alert');

    fireEvent.change(getCodeField(), { target: { value: '1' } });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('goes back to the address with its text kept, to fix a typo', async () => {
    await reachCodeStep();

    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.useAnotherEmail }));

    expect(getEmailField().value).toBe(STUDENT_EMAIL);
  });
});

describe('the resend wait', () => {
  async function reachCodeStepOnFakeClock() {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await reachCodeStep();
  }

  function waitSeconds(seconds: number) {
    act(() => {
      vi.advanceTimersByTime(seconds * 1000);
    });
  }

  it('counts down in sight, and a press during the wait sends nothing', async () => {
    await reachCodeStepOnFakeClock();
    vi.mocked(sendEmailCode).mockClear();

    const waiting = screen.getByRole('button', { name: SIGN_IN_LABELS.resendIn(60) });
    expect(waiting.getAttribute('aria-disabled')).toBe('true');
    waitSeconds(15);
    screen.getByRole('button', { name: SIGN_IN_LABELS.resendIn(45) });
    fireEvent.click(waiting);

    expect(sendEmailCode).not.toHaveBeenCalled();
  });

  it('sends a new code after the wait, says so, and starts the wait again', async () => {
    await reachCodeStepOnFakeClock();
    vi.mocked(sendEmailCode).mockClear();
    waitSeconds(60);

    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.resend }));
    await act(async () => undefined);

    expect(sendEmailCode).toHaveBeenCalledWith(STUDENT_EMAIL);
    screen.getByText(SIGN_IN_LABELS.newCodeSent);
    screen.getByRole('button', { name: SIGN_IN_LABELS.resendIn(60) });
  });

  it('returns focus to the code boxes after a new code is sent', async () => {
    await reachCodeStepOnFakeClock();
    waitSeconds(60);
    const resend = screen.getByRole('button', { name: SIGN_IN_LABELS.resend });
    resend.focus();

    fireEvent.click(resend);
    await act(async () => undefined);

    expect(document.activeElement).toBe(getCodeField());
  });

  it('leaves focus on the button when a new code is refused, so the student can press again', async () => {
    await reachCodeStepOnFakeClock();
    waitSeconds(60);
    vi.mocked(sendEmailCode).mockResolvedValue('tooManyRequests');
    const resend = screen.getByRole('button', { name: SIGN_IN_LABELS.resend });
    resend.focus();

    fireEvent.click(resend);
    await act(async () => undefined);

    expect(document.activeElement).toBe(resend);
  });

  it('puts the mark on the first box when a new code empties the boxes', async () => {
    await reachCodeStepOnFakeClock();
    waitSeconds(60);
    getCodeField().focus();
    fireEvent.change(getCodeField(), { target: { value: '1234' } });
    getCodeField().setSelectionRange(4, 4);
    fireEvent.select(getCodeField());

    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.resend }));
    await act(async () => undefined);

    expect(getCodeField().value).toBe('');
    expect(document.querySelector('[data-active="true"]')).toBe(document.querySelector('[data-active]'));
  });

  it('says when Auth refuses a new code', async () => {
    await reachCodeStepOnFakeClock();
    waitSeconds(60);
    vi.mocked(sendEmailCode).mockResolvedValue('tooManyRequests');

    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_LABELS.resend }));
    await act(async () => undefined);

    expect(screen.getByRole('alert').textContent).toBe(SIGN_IN_LABELS.tooManyRequests);
  });
});

describe('the path on the chart', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens in a browser that refuses canvas reads', () => {
    stubCanvas(() => {
      throw new DOMException('Blocked by this browser', 'SecurityError');
    });

    renderSignInPage();

    screen.getByRole('textbox', { name: SIGN_IN_LABELS.emailLabel });
  });

  it('draws one leg on the email step and one more for each digit, up to the sixth', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const contexts = stubCanvas();
    await reachCodeStep();
    const liveContext = contexts[1]!;
    const countDotsPaintedFor = (digits: string) => {
      vi.mocked(liveContext.arc).mockClear();
      fireEvent.change(getCodeField(), { target: { value: digits } });
      return vi.mocked(liveContext.arc).mock.calls.length;
    };

    const dotCounts = ['1', '12', '123', '1234', '12345'].map(countDotsPaintedFor);

    expect(dotCounts).toEqual([...dotCounts].sort((first, second) => first - second));
    expect(new Set(dotCounts).size).toBe(dotCounts.length);
  });
});

describe('a reload on the code step', () => {
  it('comes back to the code step from the record in this tab', async () => {
    const { readCodeRequest } = await import('./session');
    vi.mocked(readCodeRequest).mockReturnValue({ email: STUDENT_EMAIL, sentAt: Date.now() });

    renderSignInPage();

    screen.getByRole('heading', { name: SIGN_IN_LABELS.codeLine });
    screen.getByText(SIGN_IN_LABELS.sentTo(STUDENT_EMAIL));
    vi.mocked(readCodeRequest).mockReturnValue(null);
  });
});
