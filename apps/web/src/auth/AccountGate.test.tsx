import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../api/queryClient';
import { ACCOUNT_LABELS, API_ERROR_LABELS, BIRTH_DATE_LABELS, SIGN_IN_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { AccountGate } from './AccountGate';
import { useAuth } from './AuthProvider';
import { signOut } from './session';

const APP_TEXT = 'The app';
const ACTIVE_ACCOUNT = {
  status: 'active',
  student: { id: '00000000-0000-4000-8000-000000000001', name: 'Maya', profile: null, parentConsentAt: null },
};
const NEEDS_BIRTH_DATE = { status: 'needs_birth_date', student: null };
const CLOSED_ACCOUNT = { status: 'closed', student: null };

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('./session', () => ({ signOut: vi.fn(), getAccessToken: async () => 'test-token' }));

function setSignIn(status: 'loading' | 'signedOut' | 'signedIn') {
  vi.mocked(useAuth).mockReturnValue({ signIn: { status }, didLinkFail: false });
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
      <p>{APP_TEXT}</p>
    </AccountGate>,
  );
}

function enterBirthDate(day: string, month: string, year: string) {
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.day), { target: { value: day } });
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.month), { target: { value: month } });
  fireEvent.change(screen.getByLabelText(BIRTH_DATE_LABELS.year), { target: { value: year } });
  fireEvent.click(screen.getByRole('button', { name: BIRTH_DATE_LABELS.next }));
}

beforeEach(() => {
  vi.mocked(signOut).mockClear();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountGate', () => {
  it('shows nothing while the sign-in state loads', () => {
    setSignIn('loading');
    const fetchStub = stubApi({});

    const { container } = renderGate();

    expect(container.textContent).toBe('');
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

    expect(container.textContent).toBe('');
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

    enterBirthDate('4', '3', '2004');

    await screen.findByText(APP_TEXT);
    expect(sentBodies).toEqual([{ birthDate: '2004-03-04' }]);
  });

  it('stops at the closed page when the API closes the account, with no way to answer again', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json(CLOSED_ACCOUNT) });
    renderGate();
    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

    enterBirthDate('1', '1', '2020');

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

    enterBirthDate('31', '2', '2004');

    await screen.findByText(BIRTH_DATE_LABELS.rejected);
  });

  it('says what went wrong when saving the answer fails', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json(NEEDS_BIRTH_DATE), 'POST /api/me/birth-date': json({}, 500) });
    renderGate();
    await screen.findByRole('heading', { name: BIRTH_DATE_LABELS.question });

    enterBirthDate('14', '3', '2004');

    await screen.findByText(API_ERROR_LABELS.server);
  });

  it('signs out when the API refuses the token, and shows no app', async () => {
    setSignIn('signedIn');
    stubApi({ 'GET /api/me': json({ statusCode: 401 }, 401) });

    renderGate();

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(APP_TEXT)).toBeNull();
  });

  it('keeps the app on screen when a later refresh of the account fails', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json(ACTIVE_ACCOUNT) };
    stubApi(answers);
    const queryClient = createQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, networkMode: 'always' } });
    render(
      <QueryClientProvider client={queryClient}>
        <AccountGate>
          <p>{APP_TEXT}</p>
        </AccountGate>
      </QueryClientProvider>,
    );
    await screen.findByText(APP_TEXT);

    answers['GET /api/me'] = json({}, 503);
    await act(async () => {
      await queryClient.refetchQueries();
      await new Promise((resolve) => setTimeout(resolve));
    });

    screen.getByText(APP_TEXT);

    answers['GET /api/me'] = json({ statusCode: 401 }, 401);
    await act(() => queryClient.refetchQueries());

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(APP_TEXT)).toBeNull();
  });

  it('offers another try and shows no app when the API fails, and does not sign out', async () => {
    setSignIn('signedIn');
    const answers: Record<string, () => Response> = { 'GET /api/me': json({}, 503) };
    stubApi(answers);
    renderGate();
    await screen.findByText(API_ERROR_LABELS.server);
    expect(screen.queryByText(APP_TEXT)).toBeNull();
    expect(signOut).not.toHaveBeenCalled();

    answers['GET /api/me'] = json(ACTIVE_ACCOUNT);
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_LABELS.tryAgain }));

    await screen.findByText(APP_TEXT);
  });
});
