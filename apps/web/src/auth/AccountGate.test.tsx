import { type DefaultOptions, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../api/queryClient';
import { ACCOUNT_LABELS, API_ERROR_LABELS, BIRTH_DATE_LABELS, ONBOARDING_LABELS, PRODUCT_NAME, SIGN_IN_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { AccountGate } from './AccountGate';
import { useAuth } from './AuthProvider';
import { forgetSession, renewSession } from './session';
import { areNewSignUpsStopped, stopNewSignUpsForADay } from './signUpStop';
import { useSignInDraft } from './useSignInDraft';

const APP_TEXT = 'The app';
const APP_HEADING = 'The first page';
const SLOW_ANSWER_MS = 30;
const ACTIVE_ACCOUNT = {
  status: 'active',
  student: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Maya',
    profile: { interests: [], level: 'university', goal: 'exam' },
  },
};
const NEEDS_BIRTH_DATE = { status: 'needs_birth_date', student: null };
const CLOSED_ACCOUNT = { status: 'closed', student: null };

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('./session', () => ({
  forgetSession: vi.fn(),
  getAccessToken: async () => 'test-token',
  isCodeStillGood: () => false,
  readCodeRequest: () => null,
  renewSession: vi.fn(),
  signOut: vi.fn(),
}));

async function reachBirthDateQuestion() {
  fireEvent.change(await screen.findByLabelText(ONBOARDING_LABELS.nameLabel), { target: { value: 'Maya' } });
  fireEvent.click(screen.getByRole('button', { name: ONBOARDING_LABELS.next }));
  await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.questionFor('Maya') });
}

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

function GateWithDraft({ children }: PropsWithChildren) {
  return (
    <MemoryRouter>
      <AccountGate signInDraft={useSignInDraft()}>{children}</AccountGate>
    </MemoryRouter>
  );
}

function renderGate() {
  return renderWithQueryClient(
    <GateWithDraft>
      <main>
        <h1 tabIndex={-1}>{APP_HEADING}</h1>
        <p>{APP_TEXT}</p>
      </main>
    </GateWithDraft>,
  );
}

function renderGateWithClient(queryOptions: DefaultOptions['queries']) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, ...queryOptions } });
  render(
    <QueryClientProvider client={queryClient}>
      <GateWithDraft>
        <p>{APP_TEXT}</p>
      </GateWithDraft>
    </QueryClientProvider>,
  );
  return queryClient;
}

function renderGateWithNoRetries() {
  return renderGateWithClient({ retry: false, staleTime: 0 });
}

function comeBackToTheTab() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
}

function reconnect() {
  act(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
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

  it('keeps the chart up while the account loads right after sign-in, with no blank page between dot pages', () => {
    setSignIn('signedOut');
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const { rerender } = renderWithQueryClient(<GateWithDraft />);
    screen.getByText(SIGN_IN_LABELS.tagline);

    setSignIn('signedIn');
    rerender(<GateWithDraft />);

    screen.getByText(SIGN_IN_LABELS.tagline);
    expect(screen.queryByRole('button', { name: SIGN_IN_LABELS.sendCode })).toBeNull();
  });

  it('shows only the product name while the account loads on a reload, so Home does not flash a chart', () => {
    setSignIn('signedIn');
    vi.stubGlobal('fetch', () => new Promise(() => undefined));

    const { container } = renderGate();

    expect(container.textContent).toBe(PRODUCT_NAME);
  });

  it('shows the sign-in page, and calls no API, when nobody is signed in', () => {
    setSignIn('signedOut');
    const fetchStub = stubApi({});

    renderGate();

    screen.getByRole('button', { name: SIGN_IN_LABELS.sendCode });
    expect(screen.queryByText(APP_TEXT)).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('shows the app to an active student, and not before the API says so', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(ACTIVE_ACCOUNT) });

    const { container } = renderGate();

    expect(container.textContent).toBe(PRODUCT_NAME);
    await screen.findByText(APP_TEXT);
    expect(renewSession).not.toHaveBeenCalled();
  });

  it('asks for the date of birth first, and keeps the app hidden', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE) });

    renderGate();

    await reachBirthDateQuestion();
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
    await reachBirthDateQuestion();

    enterAndConfirmBirthDate('4', '3', '2004');

    await screen.findByText(APP_TEXT);
    expect(sentBodies).toEqual([{ birthDate: '2004-03-04', name: 'Maya' }]);
  });

  it('keeps the answer when a read sent before it lands after it', async () => {
    setSignIn('signedIn');
    let reads = 0;
    let deliverOldRead: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', async (request: Request) => {
      if (request.method === 'POST') return json(ACTIVE_ACCOUNT)();
      reads += 1;
      return reads === 1 ? json(NEEDS_BIRTH_DATE)() : new Promise<Response>((resolve) => (deliverOldRead = resolve));
    });
    renderGateWithNoRetries();
    await reachBirthDateQuestion();
    comeBackToTheTab();
    await waitFor(() => expect(reads).toBe(2));

    enterAndConfirmBirthDate('14', '3', '2004');
    await screen.findByText(APP_TEXT);
    deliverOldRead(json(NEEDS_BIRTH_DATE)());
    await act(() => new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS)));

    screen.getByText(APP_TEXT);
  });

  it('stops at the closed page when the API closes the account, with no way to answer again', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(CLOSED_ACCOUNT) });
    renderGate();
    await reachBirthDateQuestion();

    enterAndConfirmBirthDate('1', '1', '2020');

    await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
    expect(screen.queryByLabelText(BIRTH_DATE_LABELS.year)).toBeNull();
    expect(screen.queryByText(APP_TEXT)).toBeNull();
    screen.getByRole('button', { name: ACCOUNT_LABELS.signOut });
  });

  it('stops new sign-ups on this browser when the API closes the account', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(CLOSED_ACCOUNT) });
    renderGate();
    await reachBirthDateQuestion();
    expect(areNewSignUpsStopped()).toBe(false);

    enterAndConfirmBirthDate('1', '1', '2020');

    await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
    expect(areNewSignUpsStopped()).toBe(true);
  });

  it('stops new sign-ups on this browser when a closed account signs in here', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(CLOSED_ACCOUNT) });

    renderGate();

    await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
    expect(areNewSignUpsStopped()).toBe(true);
  });

  it('gives a new account the closed page in place of the question while new sign-ups are stopped', async () => {
    stopNewSignUpsForADay();
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE) });

    renderGate();

    await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
    expect(screen.queryByLabelText(BIRTH_DATE_LABELS.year)).toBeNull();
    screen.getByRole('button', { name: ACCOUNT_LABELS.signOut });
  });

  it('lets an active student in while new sign-ups are stopped', async () => {
    stopNewSignUpsForADay();
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(ACTIVE_ACCOUNT) });

    renderGate();

    await screen.findByText(APP_TEXT);
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
    await reachBirthDateQuestion();

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
    await reachBirthDateQuestion();

    enterAndConfirmBirthDate('1', '1', '2999');

    await screen.findByText(BIRTH_DATE_LABELS.rejected);
  });

  it('says what went wrong when saving the answer fails', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json({}, 500) });
    renderGate();
    await reachBirthDateQuestion();

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

    await screen.findByRole('heading', { name: API_ERROR_LABELS.tokenRefusedAfterRenewal });
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

    await screen.findByRole('heading', { name: API_ERROR_LABELS.tokenRefusedAfterRenewal });
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
    const queryClient = renderGateWithNoRetries();
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
    const queryClient = renderGateWithNoRetries();
    await screen.findByText(APP_TEXT);
    const lesson = screen.getByText(APP_TEXT);

    answers['GET /api/me'] = json({ statusCode: 401 }, 401);
    act(() => void queryClient.refetchQueries());
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
    const queryClient = renderGateWithNoRetries();
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
    const queryClient = renderGateWithNoRetries();
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

    await screen.findByRole('heading', { name: API_ERROR_LABELS.authUnreachable });
    expect(forgetSession).not.toHaveBeenCalled();
    expect(screen.queryByText(APP_TEXT)).toBeNull();

    vi.mocked(renewSession).mockImplementation(async () => {
      answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
      return 'renewed';
    });
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }));

    await screen.findByText(APP_TEXT);
  });

  describe('renewal, one read of the account at a time', () => {
    const REFUSED = json({ statusCode: 401 }, 401);
    const ACCEPTED = json(ACTIVE_ACCOUNT);

    function refusedUntilRenewed() {
      const answers: Record<string, () => Response> = { 'GET /api/me': REFUSED };
      stubApi(answers);
      return answers;
    }

    function makeAuthRenew(answers: Record<string, () => Response>) {
      vi.mocked(renewSession).mockImplementation(async () => {
        answers['GET /api/me'] = ACCEPTED;
        return 'renewed';
      });
    }

    it('asking the API, a failure that is not a refusal: shows that failure and asks Auth nothing', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': json({}, 503) });

      renderGate();

      await screen.findByRole('heading', { name: API_ERROR_LABELS.server });
      expect(renewSession).not.toHaveBeenCalled();
    });

    it('renewing on a first load: shows only the product name, not an error page', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': REFUSED });
      let finishRenewal: (renewal: 'renewed') => void = () => undefined;
      vi.mocked(renewSession).mockImplementation(() => new Promise((resolve) => (finishRenewal = resolve)));

      const { container } = renderGate();

      await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(1));
      expect(container.textContent).toBe(PRODUCT_NAME);
      await act(async () => finishRenewal('renewed'));
    });

    it('asking with the new token, a failure that is not a refusal: shows that failure and keeps the session', async () => {
      setSignIn('signedIn');
      const answers = refusedUntilRenewed();
      vi.mocked(renewSession).mockImplementation(async () => {
        answers['GET /api/me'] = json({}, 503);
        return 'renewed';
      });

      renderGate();

      await screen.findByRole('heading', { name: API_ERROR_LABELS.server });
      expect(renewSession).toHaveBeenCalledTimes(1);
      expect(forgetSession).not.toHaveBeenCalled();
    });

    it('Auth out of reach, the student comes back to the tab: tries again, keeps the page and focus, and opens the app once Auth answers', async () => {
      setSignIn('signedIn');
      const answers = refusedUntilRenewed();
      vi.mocked(renewSession).mockResolvedValueOnce('unreachable');
      renderGate();
      const heading = await screen.findByRole('heading', { name: API_ERROR_LABELS.authUnreachable });
      let finishRenewal: (renewal: 'unreachable') => void = () => undefined;
      vi.mocked(renewSession).mockImplementationOnce(() => new Promise((resolve) => (finishRenewal = resolve)));

      comeBackToTheTab();
      await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(2));
      await act(() => new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS)));

      expect(screen.getByRole('heading', { name: API_ERROR_LABELS.authUnreachable })).toBe(heading);
      expect(document.activeElement).toBe(heading);

      await act(async () => finishRenewal('unreachable'));
      await waitFor(() => expect(screen.getByRole('heading', { name: API_ERROR_LABELS.authUnreachable })).toBe(heading));
      expect(document.activeElement).toBe(heading);

      makeAuthRenew(answers);
      comeBackToTheTab();

      await screen.findByText(APP_TEXT);
      expect(forgetSession).not.toHaveBeenCalled();
    });

    it('Auth out of reach, the connection comes back: tries again and opens the app', async () => {
      setSignIn('signedIn');
      const answers = refusedUntilRenewed();
      vi.mocked(renewSession).mockResolvedValue('unreachable');
      renderGate();
      await screen.findByRole('heading', { name: API_ERROR_LABELS.authUnreachable });

      makeAuthRenew(answers);
      reconnect();

      await screen.findByText(APP_TEXT);
      expect(renewSession).toHaveBeenCalledTimes(2);
    });

    it('Auth out of reach with the app on screen, a later refusal: renews again and the app stays', async () => {
      setSignIn('signedIn');
      const answers: Record<string, () => Response> = { 'GET /api/me': ACCEPTED };
      stubApi(answers);
      vi.mocked(renewSession).mockResolvedValue('unreachable');
      renderGateWithNoRetries();
      const lesson = await screen.findByText(APP_TEXT);

      answers['GET /api/me'] = REFUSED;
      comeBackToTheTab();
      await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(1));
      await act(() => new Promise((resolve) => setTimeout(resolve)));

      makeAuthRenew(answers);
      comeBackToTheTab();
      await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(2));
      await act(() => new Promise((resolve) => setTimeout(resolve)));

      expect(screen.getByText(APP_TEXT)).toBe(lesson);
      expect(forgetSession).not.toHaveBeenCalled();
    });

    it('the API refusing a new token, a later read: renews once more, then stops', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': REFUSED });
      vi.mocked(renewSession).mockResolvedValue('renewed');
      renderGate();
      const heading = await screen.findByRole('heading', { name: API_ERROR_LABELS.tokenRefusedAfterRenewal });

      comeBackToTheTab();
      await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('heading', { name: API_ERROR_LABELS.tokenRefusedAfterRenewal })).toBe(heading);
      await act(() => new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS)));

      expect(renewSession).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('heading', { name: API_ERROR_LABELS.tokenRefusedAfterRenewal })).toBe(heading);
      expect(forgetSession).not.toHaveBeenCalled();
    });

    it('a refocus during a slow renewal joins that read, so its refusal is not blamed on the new token', async () => {
      setSignIn('signedIn');
      const answers = refusedUntilRenewed();
      let finishRenewal: (renewal: 'renewed') => void = () => undefined;
      vi.mocked(renewSession).mockImplementation(() => new Promise((resolve) => (finishRenewal = resolve)));
      renderGate();
      await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(1));

      comeBackToTheTab();
      await act(() => new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS)));
      answers['GET /api/me'] = ACCEPTED;
      await act(async () => finishRenewal('renewed'));

      await screen.findByText(APP_TEXT);
      expect(renewSession).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['Auth out of reach', 'unreachable', API_ERROR_LABELS.authUnreachable],
      ['the API refusing a new token', 'renewed', API_ERROR_LABELS.tokenRefusedAfterRenewal],
    ] as const)('%s: the client retries nothing on its own, because a retry would renew again', async (_caseName, renewal, label) => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': REFUSED });
      vi.mocked(renewSession).mockResolvedValue(renewal);
      renderGateWithClient({ retryDelay: 0 });

      await screen.findByRole('heading', { name: label });
      await act(() => new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS)));

      expect(renewSession).toHaveBeenCalledTimes(1);
    });

    it('Try again that fails looks busy, then gives focus back to the heading', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': REFUSED });
      let finishRenewal: (renewal: 'unreachable') => void = () => undefined;
      vi.mocked(renewSession).mockResolvedValueOnce('unreachable');
      renderGate();
      await screen.findByRole('heading', { name: API_ERROR_LABELS.authUnreachable });
      vi.mocked(renewSession).mockImplementation(() => new Promise((resolve) => (finishRenewal = resolve)));
      const button = screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain });
      button.focus();

      fireEvent.click(button);

      await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(2));
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);

      await act(async () => finishRenewal('unreachable'));

      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: API_ERROR_LABELS.authUnreachable })));
      expect(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }).getAttribute('aria-disabled')).toBe('false');
      expect(renewSession).toHaveBeenCalledTimes(2);
    });

    it('takes focus to the page heading when coming back to the tab opens the app', async () => {
      setSignIn('signedIn');
      const answers = refusedUntilRenewed();
      vi.mocked(renewSession).mockResolvedValue('unreachable');
      renderGate();
      await screen.findByRole('heading', { name: API_ERROR_LABELS.authUnreachable });

      makeAuthRenew(answers);
      comeBackToTheTab();

      const heading = await screen.findByRole('heading', { name: APP_HEADING });
      expect(document.activeElement).toBe(heading);
    });
  });

  describe('for a screen reader', () => {
    it('takes focus to the closed page heading when the answer closes the account', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(CLOSED_ACCOUNT) });
      renderGate();
      await reachBirthDateQuestion();

      enterAndConfirmBirthDate('1', '1', '2020');

      const heading = await screen.findByRole('heading', { name: ACCOUNT_LABELS.closed });
      expect(document.activeElement).toBe(heading);
    });

    it('takes focus to the first page heading when the answer opens the app', async () => {
      setSignIn('signedIn');
      stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(ACTIVE_ACCOUNT) });
      renderGate();
      await reachBirthDateQuestion();

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

      const button = screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain });
      button.focus();
      fireEvent.click(button);

      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: API_ERROR_LABELS.server })));
      expect(document.activeElement).not.toBe(heading);
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

  it('promises nothing about changing it later beside the date of birth question', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE) });
    renderGate();

    await reachBirthDateQuestion();

    expect(screen.queryByText(ONBOARDING_LABELS.changeLater)).toBeNull();
  });

  it('says everyone is asked the date of birth, and claims no use of it after the gate', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE) });
    renderGate();

    await reachBirthDateQuestion();

    screen.getByText('We ask everyone this before an account opens.');
    expect(screen.queryByText(/safe for your age/i)).toBeNull();
  });

  it('promises nothing about changing it later beside the closed page', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(CLOSED_ACCOUNT) });
    renderGate();

    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByText(ONBOARDING_LABELS.changeLater)).toBeNull();
  });

  it('shows a returning student the error page, not the new-student welcome, when Auth cannot renew their session', () => {
    setSignIn('authUnreachable');
    const fetchStub = stubApi({});

    renderGate();

    screen.getByRole('heading', { name: API_ERROR_LABELS.network });
    screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain });
    screen.getByRole('button', { name: ACCOUNT_LABELS.signOut });
    expect(screen.queryByRole('button', { name: SIGN_IN_LABELS.sendCode })).toBeNull();
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
