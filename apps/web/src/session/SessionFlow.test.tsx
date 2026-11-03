import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { API_ERROR_LABELS, CHAT_BOX_LABELS, HOME_LABELS, REPLY_BOX_LABELS, SESSION_LABELS, SIDEBAR_LABELS } from '../strings';
import { EXAMPLE_HOME_SCREEN, EXAMPLE_STUDENT_NAME } from '../test/homeScreenApi';
import { makeSession, stubSessionsApi } from '../test/sessionsApi';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));

const QUESTION = 'Why is the sky dark at night?';
const MAX_TITLE_CHARACTERS = 200;
const SLOW_START_NOTICE_MS = 1_500;
const { continueSession: UNFINISHED_SESSION, picks: PICKS } = EXAMPLE_HOME_SCREEN;
const HOME_GREETING = HOME_LABELS.greeting(EXAMPLE_STUDENT_NAME);

const getTextBox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: CHAT_BOX_LABELS.label });
const getSessionHeading = (title: string) => screen.findByRole('heading', { level: 1, name: title }, { timeout: 2_000 });
const getEndButton = () => screen.findByRole('button', { name: SESSION_LABELS.endSession });

async function renderHome(api = {}) {
  const fakeApi = stubSessionsApi(api);
  render(<App />);
  await screen.findByRole('heading', { name: HOME_GREETING });
  await screen.findByText(PICKS[0]!.title);
  return fakeApi;
}

function renderSessionAddress(api: Parameters<typeof stubSessionsApi>[0], sessionId: string) {
  window.history.replaceState(null, '', `/sessions/${sessionId}`);
  const fakeApi = stubSessionsApi(api);
  render(<App />);
  return fakeApi;
}

function sendQuestion(question = QUESTION) {
  fireEvent.change(getTextBox(), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: CHAT_BOX_LABELS.send }));
}

// The hold and the fade take no time with less motion, which keeps this file fast, and opening.test.ts covers their length.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sending a question', () => {
  it('saves the session, lands the dot, and opens the session screen', async () => {
    const { getRequests } = await renderHome();

    sendQuestion();

    expect(document.querySelector('.stop-dot')).not.toBeNull();
    await getSessionHeading(QUESTION);
    const [request] = getRequests('POST', '/api/sessions');
    expect(await request!.json()).toEqual({ title: QUESTION, subject: SESSION_LABELS.questionSubject, language: 'en' });
    expect(window.location.pathname).toBe('/sessions/new-session-1');
    expect(document.querySelector('.stop-dot')).toBeNull();
  });

  it('saves the session before the page starts to fade', async () => {
    let finishSaving!: (response: Response) => void;
    const { fetchStub } = await renderHome();
    const answerOtherCalls = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementation((request) =>
      request.method === 'POST' ? new Promise((resolve) => (finishSaving = resolve)) : answerOtherCalls(request),
    );

    sendQuestion();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const page = document.querySelector<HTMLElement>('[data-page]');
    expect(page?.style.opacity).toBe('');

    await act(async () => finishSaving(new Response(JSON.stringify(makeSession({ id: 'saved', title: QUESTION })), { status: 201 })));
    await getSessionHeading(QUESTION);
  });

  it('adds a line when the save is slow, so the wait does not read as frozen', async () => {
    let finishSaving!: (response: Response) => void;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetchStub } = await renderHome();
    const answerOtherCalls = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementation((request) =>
      request.method === 'POST' ? new Promise((resolve) => (finishSaving = resolve)) : answerOtherCalls(request),
    );

    fireEvent.click(screen.getByRole('button', { name: new RegExp(PICKS[0]!.title) }));

    await act(() => vi.advanceTimersByTimeAsync(SLOW_START_NOTICE_MS));
    screen.getByText(HOME_LABELS.stillStarting);
    await act(async () => finishSaving(new Response(JSON.stringify(makeSession({ id: 'saved', title: PICKS[0]!.title })), { status: 201 })));
    await getSessionHeading(PICKS[0]!.title);
  });

  it('turns a long question with new lines into a title the API takes', async () => {
    const { getRequests } = await renderHome();
    const longQuestion = `One\n\n  two ${'\u{1F30D}'.repeat(MAX_TITLE_CHARACTERS)}`;

    sendQuestion(longQuestion);

    await getEndButton();
    const { title } = (await getRequests('POST', '/api/sessions')[0]!.json()) as { title: string };
    expect(title.startsWith('One two \u{1F30D}')).toBe(true);
    expect(Array.from(title)).toHaveLength(MAX_TITLE_CHARACTERS);
  });

  it('starts one session when the student presses send twice', async () => {
    const { getRequests } = await renderHome();

    sendQuestion();
    fireEvent.click(screen.getByRole('button', { name: CHAT_BOX_LABELS.send }));
    fireEvent.keyDown(getTextBox(), { key: 'Enter' });

    await getEndButton();
    expect(getRequests('POST', '/api/sessions')).toHaveLength(1);
  });

  it('keeps the question, takes the dot away, and says what went wrong when the save fails', async () => {
    const { fetchStub } = await renderHome();
    const answerOtherCalls = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementation((request) =>
      request.method === 'POST' ? Promise.resolve(new Response('{}', { status: 500 })) : answerOtherCalls(request),
    );

    sendQuestion();

    await screen.findByText(API_ERROR_LABELS.server);
    await waitFor(() => expect(document.querySelector('.stop-dot')).toBeNull());
    expect(getTextBox().value).toBe(QUESTION);
    expect(window.location.pathname).toBe('/');
    expect(document.querySelector<HTMLElement>('[data-page]')?.style.opacity).toBe('');

    fireEvent.change(getTextBox(), { target: { value: 'Edited' } });
    await waitFor(() => expect(screen.queryByText(API_ERROR_LABELS.server)).toBeNull());
  });
});

describe('selecting a card', () => {
  it('starts a session on that topic straight away, with its picture', async () => {
    const { getRequests } = await renderHome();
    const pick = PICKS[0]!;

    fireEvent.click(screen.getByRole('button', { name: new RegExp(pick.title) }));

    await getSessionHeading(pick.title);
    expect(await getRequests('POST', '/api/sessions')[0]!.json()).toEqual({
      title: pick.title,
      subject: pick.subject,
      artwork: pick.artwork,
      language: 'en',
    });
  });
});

describe('the continue card', () => {
  it('opens the unfinished session without starting another', async () => {
    const { getRequests } = await renderHome({ sessions: [UNFINISHED_SESSION!] });

    fireEvent.click(screen.getByRole('button', { name: HOME_LABELS.continueButton }));

    await getSessionHeading(UNFINISHED_SESSION!.title);
    expect(window.location.pathname).toBe(`/sessions/${UNFINISHED_SESSION!.id}`);
    expect(getRequests('POST', '/api/sessions')).toEqual([]);
  });
});

describe('the session screen', () => {
  it('reads the session from the API on a refresh, with the board, the dot, and a reply box', async () => {
    const session = makeSession({ id: 'refreshed', title: 'Why Saturn has rings', subject: 'Astronomy', artwork: 'saturn', durationSeconds: 65 });

    renderSessionAddress({ sessions: [session] }, 'refreshed');

    await getSessionHeading(session.title);
    screen.getByText(SESSION_LABELS.boardStandIn);
    screen.getByRole('img');
    expect(document.querySelector('.tutor-dot')).not.toBeNull();
    screen.getByRole('textbox', { name: REPLY_BOX_LABELS.label });
    screen.getByText('01:05');
    screen.getByText('Astronomy');
  });

  it('moves focus to the title, because what the student pressed has gone', async () => {
    renderSessionAddress({ sessions: [makeSession()] }, 'a-session');

    const heading = await getSessionHeading('Free-body diagrams');
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('shows a reply on the screen and sends it nowhere', async () => {
    const { fetchStub } = renderSessionAddress({ sessions: [makeSession()] }, 'a-session');
    const replyBox = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: REPLY_BOX_LABELS.label });
    fetchStub.mockClear();

    fireEvent.change(replyBox, { target: { value: 'Gravity, I think.' } });
    fireEvent.click(screen.getByRole('button', { name: REPLY_BOX_LABELS.send }));

    screen.getByText('Gravity, I think.');
    screen.getByText(SESSION_LABELS.standInAnswer);
    expect(replyBox.value).toBe('');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('counts up from the saved length and saves it as it runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { getRequests } = renderSessionAddress({ sessions: [makeSession({ durationSeconds: 60 })] }, 'a-session');
    await getEndButton();

    await act(() => vi.advanceTimersByTimeAsync(15_000));

    screen.getByText('01:15');
    const [save] = getRequests('PATCH', '/api/sessions/a-session');
    expect(await save!.json()).toEqual({ durationSeconds: 75 });
  });

  it('keeps a failed save to itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetchStub } = renderSessionAddress({ sessions: [makeSession()] }, 'a-session');
    await getEndButton();
    fetchStub.mockImplementation(async () => new Response('{}', { status: 500 }));

    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows one message for a session that is not there, which is what another student\'s session answers', async () => {
    renderSessionAddress({ sessions: [] }, 'somebody-elses-session');

    await screen.findByRole('heading', { level: 1, name: SESSION_LABELS.notFound });
    screen.getByRole('link', { name: 'Sessions' });
    expect(screen.queryByRole('button', { name: SESSION_LABELS.tryAgain })).toBeNull();
  });

  it('offers another try when the session does not load, and opens it then', async () => {
    const { fetchStub } = renderSessionAddress({ sessions: [makeSession()] }, 'a-session');
    const answerNormally = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementationOnce(async () => new Response('{}', { status: 400 }));

    await screen.findByRole('heading', { level: 1, name: API_ERROR_LABELS.rejected });
    fetchStub.mockImplementation(answerNormally);
    fireEvent.click(screen.getByRole('button', { name: SESSION_LABELS.tryAgain }));

    await getSessionHeading('Free-body diagrams');
  });

  it('opens a finished session with no way to end or reply to it, and does not save it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { getRequests } = renderSessionAddress({ sessions: [makeSession({ status: 'finished', durationSeconds: 90 })] }, 'a-session');

    await screen.findByText(SESSION_LABELS.finishedWords);
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    screen.getByText('01:30');
    expect(screen.queryByRole('button', { name: SESSION_LABELS.endSession })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(getRequests('PATCH', '/api/sessions/a-session')).toEqual([]);
  });
});

describe('ending a session', () => {
  it('marks it finished with its length, returns to Home, and shows it in Recent', async () => {
    const { getRequests, storedSessions } = renderSessionAddress({ sessions: [makeSession({ durationSeconds: 40 })] }, 'a-session');

    fireEvent.click(await getEndButton());

    await screen.findByRole('heading', { name: HOME_GREETING }, { timeout: 2_000 });
    const [end] = getRequests('PATCH', '/api/sessions/a-session');
    expect(await end!.json()).toEqual({ durationSeconds: 40, status: 'finished' });
    expect(storedSessions[0]?.status).toBe('finished');
    expect(window.location.pathname).toBe('/');
    const sidebar = screen.getByRole('complementary');
    await within(sidebar).findByRole('link', { name: 'Free-body diagrams' });
  });

  it('takes the session off the continue card before Home opens, so it never shows as unfinished', async () => {
    await renderHome({ sessions: [UNFINISHED_SESSION!] });
    fireEvent.click(await screen.findByRole('button', { name: HOME_LABELS.continueButton }));

    fireEvent.click(await getEndButton());

    await screen.findByRole('heading', { name: HOME_GREETING }, { timeout: 2_000 });
    expect(screen.queryByRole('button', { name: HOME_LABELS.continueButton })).toBeNull();
  });

  it('stays on the session and says so when the end does not reach the API', async () => {
    const { fetchStub } = renderSessionAddress({ sessions: [makeSession()] }, 'a-session');
    const endButton = await getEndButton();
    fetchStub.mockImplementation(async () => new Response('{}', { status: 500 }));

    fireEvent.click(endButton);

    await screen.findByText(API_ERROR_LABELS.server);
    expect(window.location.pathname).toBe('/sessions/a-session');
    await getEndButton();
  });
});

describe('Recent in the sidebar', () => {
  it('lists real sessions, and each one opens its session', async () => {
    const session = makeSession({ id: 'recent', title: 'Why Saturn has rings' });
    await renderHome({ sessions: [session] });
    const sidebar = screen.getByRole('complementary');

    fireEvent.click(await within(sidebar).findByRole('link', { name: session.title }));

    await getSessionHeading(session.title);
  });

  it('tells a new student where sessions will appear', async () => {
    await renderHome();

    await within(screen.getByRole('complementary')).findByText(SIDEBAR_LABELS.noSessions);
  });

  it('does not tell a returning student they have no sessions when the list fails', async () => {
    const { fetchStub } = stubSessionsApi();
    const answerOtherCalls = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementation((request) =>
      new URL(request.url).pathname === '/api/sessions' ? Promise.resolve(new Response('{}', { status: 400 })) : answerOtherCalls(request),
    );

    render(<App />);

    const sidebar = screen.getByRole('complementary');
    await within(sidebar).findByText(SIDEBAR_LABELS.recentFailure);
    expect(within(sidebar).queryByText(SIDEBAR_LABELS.noSessions)).toBeNull();
  });
});
