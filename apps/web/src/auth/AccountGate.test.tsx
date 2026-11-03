import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../api/queryClient';
import { ACCOUNT_LABELS, API_ERROR_LABELS, BIRTH_DATE_LABELS, PRODUCT_NAME, SIGN_IN_LABELS, TUTOR_NOTES_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { AccountGate } from './AccountGate';
import { useAuth } from './AuthProvider';
import { forgetSession, renewSession } from './session';

const APP_TEXT = 'The app';
const APP_HEADING = 'The first page';
const SLOW_ANSWER_MS = 30;
const ACTIVE_ACCOUNT = {
  status: 'active',
  student: { id: '00000000-0000-4000-8000-000000000001', name: 'Maya', profile: null, parentConsentAt: null },
};
const NEEDS_BIRTH_DATE = { status: 'needs_birth_date', student: null };
const CLOSED_ACCOUNT = { status: 'closed', student: null };

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('./session', () => ({
  forgetSession: vi.fn(),
  getAccessToken: async () => 'test-token',
  renewSession: vi.fn(),
  signOut: vi.fn(),
}));

function setSignIn(status: 'loading' | 'signedOut' | 'signedIn' | 'authUnreachable') {
  vi.mocked(useAuth).mockReturnValue({ signIn: { status }, returnProblem: null });
}

function stubApi(answers: Record<string, () => Response>) {
  const fetchStub = vi.fn(async (request: Request) => {
    const answer = answers[`${request.method} ${new URL(request.url).pathname}`];
    return answer ? answer() : new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

function json(body: object, status = 200) {
  return () => new Response(JSON.stringify(body), { status });
}

function renderGate() {
  return renderWithQueryClient(
    <AccountGate>
      <main>
        <h1 tabIndex={-1}>{APP_HEADING}</h1>
        <p>{APP_TEXT}</p>
      </main>
    </AccountGate>,
  );
}

function renderGateWithRealRetries() {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, networkMode: 'always' } });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountGate>
        <p>{APP_TEXT}</p>
      </AccountGate>
    </QueryClientProvider>,
  );
  return queryClient;
}

function enterBirthDate(day: string, month: string, year: string) {
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.day), { target: { value: day } });
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.month), { target: { value: month } });
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.year), { target: { value: year } });
  fireEvent.click(screen.getByRole('button', { name: BIRTH_DATE_LABELS.next }));
}

function enterAndConfirmBirthDate(day: string, month: string, year: string) {
  enterBirthDate(day, month, year);
  fireEvent.click(screen.getByRole('button', { name: BIRTH_DATE_LABELS.confirm }));
}

beforeEach(() => {
  vi.mocked(forgetSession).mockClear();
  vi.mocked(renewSession).mockReset();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountGate', () => {
  it('shows only the product name while the sign-in state loads', () => {
    setSignIn('loading');
    const fetchStub = stubApi({});

    const { container } = renderGate();

    expect(container.textContent).toBe(PRODUCT_NAME);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('shows the sign-in page, and calls no API, when nobody is signed in', () => {
    setSignIn('signedOut');
    const fetchStub = stubApi({});

    renderGate();

    screen.getByRole('button', { name: SIGN_IN_LABELS.email });
    expect(screen.queryByText(APP_TEXT)).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('shows the app to an active student, and not before the API says so', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(ACTIVE_ACCOUNT) });

    const { container } = renderGate();

    expect(container.textContent).toBe(PRODUCT_NAME);
    await screen.findByText(APP_TEXT);
  });

  it('asks for the date of birth first, and keeps the app hidden', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE) });

    renderGate();

    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });
    expect(screen.queryByText(APP_TEXT)).toBeNull();
  });

  it('sends a padded date and opens the app when the API accepts it', async () => {
    setSignIn('signedIn');
    const sentBodies: unknown[] = [];
    vi.stubGlobal('fetch', async (request: Request) => {
      if (request.method === 'POST') {
        sentBodies.push(await request.json());
        return json(ACTIVE_ACCOUNT)();
      }
      return json(NEEDS_BIRTH_DATE)();
    });
    renderGate();
    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

    enterAndConfirmBirthDate('4', '3', '2004');

    await screen.findByText(APP_TEXT);
    expect(sentBodies).toEqual([{ birthDate: '2004-03-04' }]);
  });

  it('stops at the closed page when the API closes the account, with no way to answer again', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(CLOSED_ACCOUNT) });
    renderGate();
    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

    enterAndConfirmBirthDate('1', '1', '2020');

    await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
    expect(screen.queryByLabelText(BIRTH_DATE_LABELS.year)).toBeNull();
    expect(screen.queryByText(APP_TEXT)).toBeNull();
    screen.getByRole('button', { name: ACCOUNT_LABELS.signOut });
  });

  it('shows the closed page straight away when the API says the account is closed', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(CLOSED_ACCOUNT) });

    renderGate();

    await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
    expect(screen.queryByLabelText(BIRTH_DATE_LABELS.year)).toBeNull();
  });

  it('asks again, and sends nothing, when the date is not complete', async () => {
    setSignIn('signedIn');
    const fetchStub = stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE) });
    renderGate();
    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

    enterBirthDate('', '3', '2004');

    screen.getByText(BIRTH_DATE_LABELS.rejected);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('asks again when the API rejects the date', async () => {
    setSignIn('signedIn');
    stubApi({
      'GET /api/me': json(NEEDS_BIRTH_DATE),
      'POST /api/me/birth-date': json({ message: ['birthDate is wrong'], fieldMessages: { birthDate: ['birthDate is wrong'] } }, 400),
    });
    renderGate();
    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

    enterAndConfirmBirthDate('1', '1', '2999');

    await screen.findByText(BIRTH_DATE_LABELS.rejected);
  });

  it('says what went wrong when saving the answer fails', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json({}, 500) });
    renderGate();
    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

    enterAndConfirmBirthDate('14', '3', '2004');

    await screen.findByText(API_ERROR_LABELS.server);
  });

  it('renews the session once and opens the app when the API refused a token that was out of date', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json({ statusCode: 401 }, 401) };
    stubApi(answers);
    vi.mocked(renewSession).mockImplementation(async () => {
      answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
      return 'renewed';
    });

    renderGate();

    await screen.findByText(APP_TEXT);
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(forgetSession).not.toHaveBeenCalled();
  });

  it('keeps the session and offers another try when the API refuses a token that Auth just renewed', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json({ statusCode: 401 }, 401) };
    stubApi(answers);
    vi.mocked(renewSession).mockResolvedValue('renewed');

    renderGate();

    await screen.findByRole('heading', { name: API_ERROR_LABELS.server });
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(forgetSession).not.toHaveBeenCalled();
    expect(screen.queryByText(APP_TEXT)).toBeNull();

    answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }));

    await screen.findByText(APP_TEXT);
    expect(forgetSession).not.toHaveBeenCalled();
  });

  it('stops after one renewal when a slow API keeps refusing, rather than looping', async () => {
    setSignIn('signedIn');
    vi.stubGlobal('fetch', async () => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS));
      return json({ statusCode: 401 }, 401)();
    });
    vi.mocked(renewSession).mockResolvedValue('renewed');

    renderGate();

    await screen.findByRole('heading', { name: API_ERROR_LABELS.server });
    await act(() => new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS * 3)));
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(forgetSession).not.toHaveBeenCalled();
  });

  it('forgets the session only when Auth itself rejects the refresh token, and shows no app', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json({ statusCode: 401 }, 401) });
    vi.mocked(renewSession).mockResolvedValue('refused');

    renderGate();

    await waitFor(() => expect(forgetSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(APP_TEXT)).toBeNull();
  });

  it('keeps the app on screen when a later refresh of the account fails', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json(ACTIVE_ACCOUNT) };
    stubApi(answers);
    const queryClient = renderGateWithRealRetries();
    await screen.findByText(APP_TEXT);

    answers['GET /api/me'] = json({}, 503);
    await act(async () => {
      await queryClient.refetchQueries();
      await new Promise((resolve) => setTimeout(resolve));
    });

    screen.getByText(APP_TEXT);

    vi.mocked(renewSession).mockResolvedValue('refused');
    answers['GET /api/me'] = json({ statusCode: 401 }, 401);
    await act(() => queryClient.refetchQueries());

    await waitFor(() => expect(forgetSession).toHaveBeenCalledTimes(1));
  });

  it('keeps the app on screen while a refused token renews, so a lesson does not vanish', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json(ACTIVE_ACCOUNT) };
    stubApi(answers);
    let finishRenewal: (renewal: 'renewed') => void = () => undefined;
    vi.mocked(renewSession).mockImplementation(() => new Promise((resolve) => (finishRenewal = resolve)));
    const queryClient = renderGateWithRealRetries();
    await screen.findByText(APP_TEXT);
    const lesson = screen.getByText(APP_TEXT);

    answers['GET /api/me'] = json({ statusCode: 401 }, 401);
    await act(() => queryClient.refetchQueries());
    await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(1));

    expect(screen.getByText(APP_TEXT)).toBe(lesson);

    answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
    await act(async () => finishRenewal('renewed'));
    await waitFor(() => expect(queryClient.getQueryState(['account'])?.error).toBeNull());

    expect(screen.getByText(APP_TEXT)).toBe(lesson);
    expect(forgetSession).not.toHaveBeenCalled();
  });

  it('renews again for a later refused token, rather than signing the student out', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json({ statusCode: 401 }, 401) };
    stubApi(answers);
    vi.mocked(renewSession).mockImplementation(async () => {
      answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
      return 'renewed';
    });
    const queryClient = renderGateWithRealRetries();
    await screen.findByText(APP_TEXT);

    answers['GET /api/me'] = json({ statusCode: 401 }, 401);
    await act(() => queryClient.refetchQueries());

    await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queryClient.getQueryState(['account'])?.error).toBeNull());
    expect(forgetSession).not.toHaveBeenCalled();
    screen.getByText(APP_TEXT);
  });

  it('keeps the session and the app when Auth cannot be reached to renew a refused token', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json(ACTIVE_ACCOUNT) };
    stubApi(answers);
    vi.mocked(renewSession).mockResolvedValue('unreachable');
    const queryClient = renderGateWithRealRetries();
    await screen.findByText(APP_TEXT);

    answers['GET /api/me'] = json({ statusCode: 401 }, 401);
    await act(() => queryClient.refetchQueries());
    await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(1));
    await act(() => Promise.resolve());

    screen.getByText(APP_TEXT);
    expect(forgetSession).not.toHaveBeenCalled();
  });

  it('offers another try with no app when Auth cannot be reached and no account has loaded', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json({ statusCode: 401 }, 401) };
    stubApi(answers);
    vi.mocked(renewSession).mockResolvedValue('unreachable');
    renderGate();

    await screen.findByRole('heading', { name: API_ERROR_LABELS.network });
    expect(forgetSession).not.toHaveBeenCalled();
    expect(screen.queryByText(APP_TEXT)).toBeNull();

    vi.mocked(renewSession).mockImplementation(async () => {
      answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
      return 'renewed';
    });
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }));

    await screen.findByText(APP_TEXT);
  });

  describe('for a screen reader', () => {
    it('takes focus to the closed page heading when the answer closes the account', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(CLOSED_ACCOUNT) });
      renderGate();
      await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

      enterAndConfirmBirthDate('1', '1', '2020');

      const heading = await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
      expect(document.activeElement).toBe(heading);
    });

    it('takes focus to the first page heading when the answer opens the app', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(ACTIVE_ACCOUNT) });
      renderGate();
      await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

      enterAndConfirmBirthDate('14', '3', '2004');

      const heading = await screen.findByRole('heading', { name: APP_HEADING });
      expect(document.activeElement).toBe(heading);
    });

    it('leaves focus alone on a plain load of the app', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': json(ACTIVE_ACCOUNT) });
      renderGate();

      await screen.findByRole('heading', { name: APP_HEADING });

      expect(document.activeElement).toBe(document.body);
    });

    it('keeps the heading a heading on the error page, and focuses it after Try again fails', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': json({}, 503) });
      renderGate();

      const heading = await screen.findByRole('heading', { level: 1, name: API_ERROR_LABELS.server });
      expect(document.activeElement).toBe(heading);

      fireEvent.click(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }));

      const nextHeading = await screen.findByRole('heading', { level: 1, name: API_ERROR_LABELS.server });
      expect(document.activeElement).toBe(nextHeading);
    });

    it('takes focus to the page heading when Try again opens the app', async () => {
      setSignIn('signedIn');
      const answers: Record<string, () => Response> = { 'GET /api/me': json({}, 503) };
      stubApi(answers);
      renderGate();
      await screen.findByRole('heading', { level: 1, name: API_ERROR_LABELS.server });

      answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
      fireEvent.click(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }));

      const heading = await screen.findByRole('heading', { name: APP_HEADING });
      expect(document.activeElement).toBe(heading);
    });
  });

  it.each([
    ['the date of birth question', NEEDS_BIRTH_DATE],
    ['the closed page', CLOSED_ACCOUNT],
  ])('promises nothing about changing it later beside %s', async (_caseName, account) => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(account) });
    renderGate();

    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByText(TUTOR_NOTES_LABELS.footer)).toBeNull();
  });

  it('shows a returning student the error page, not the new-student welcome, when Auth cannot renew their session', () => {
    setSignIn('authUnreachable');
    const fetchStub = stubApi({});

    renderGate();

    screen.getByRole('heading', { name: API_ERROR_LABELS.network });
    screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain });
    screen.getByRole('button', { name: ACCOUNT_LABELS.signOut });
    expect(screen.queryByRole('button', { name: SIGN_IN_LABELS.email })).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  describe('on a slow load', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('adds words to the product name after a few seconds, so it does not read as frozen', () => {
      vi.useFakeTimers();
      setSignIn('loading');
      stubApi({});
      renderGate();
      expect(screen.getByRole('status').textContent).toBe('');

      act(() => {
        vi.advanceTimersByTime(3_000);
      });

      expect(screen.getByRole('status').textContent).toBe(ACCOUNT_LABELS.stillLoading);
    });
  });

  it('offers another try and shows no app when the API fails, and does not sign out', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json({}, 503) };
    stubApi(answers);
    renderGate();
    await screen.findByText(API_ERROR_LABELS.server);
    expect(screen.queryByText(APP_TEXT)).toBeNull();
    expect(forgetSession).not.toHaveBeenCalled();

    answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }));

    await screen.findByText(APP_TEXT);
  });
});
