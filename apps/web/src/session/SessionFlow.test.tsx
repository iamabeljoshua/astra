import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { API_ERROR_LABELS, CHAT_BOX_LABELS, HOME_LABELS, MENU_LABELS, REPLY_BOX_LABELS, SESSION_LABELS, SESSIONS_LABELS, SIDEBAR_LABELS, VOICE_LABELS } from '../strings';
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
const getEndButton = () => screen.findByRole('button', { name: SESSION_LABELS.endSession }, { timeout: 2_000 });

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

type FetchStub = ReturnType<typeof stubSessionsApi>['fetchStub'];

// The fake API acts on a held call at once, as a server would, and its answer waits until the test lets it through.
function holdAnswers(fetchStub: FetchStub, shouldHold: (request: Request, heldSoFar: number) => boolean) {
  const answerNormally = fetchStub.getMockImplementation()!;
  const held: (() => void)[] = [];
  let heldSoFar = 0;
  fetchStub.mockImplementation((request) => {
    const answer = answerNormally(request);
    if (!shouldHold(request, heldSoFar)) return answer;
    heldSoFar += 1;
    return new Promise((resolve) => held.push(() => resolve(answer)));
  });
  return {
    getHeldCount: () => heldSoFar,
    release: () =>
      act(async () => {
        held.splice(0).forEach((answerCall) => answerCall());
        await new Promise((resolve) => setTimeout(resolve, 20));
      }),
  };
}

const isCallTo = (pathname: string) => (request: Request) => new URL(request.url).pathname === pathname;

const getPageOpacity = () => document.querySelector<HTMLElement>('[data-page]')?.style.opacity;

async function chooseSessionsInMenu() {
  const menu = screen.getByRole('navigation', { name: SIDEBAR_LABELS.menu });
  fireEvent.click(within(menu).getByRole('link', { name: MENU_LABELS.sessions }));
  await screen.findByRole('heading', { level: 1, name: MENU_LABELS.sessions });
}

async function openUnfinishedSession() {
  const fakeApi = await renderHome({ sessions: [UNFINISHED_SESSION!] });
  fireEvent.click(await screen.findByRole('button', { name: HOME_LABELS.continueButton }));
  return { ...fakeApi, endButton: await getEndButton() };
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
      topicId: pick.id,
      language: 'en',
    });
  });

  it('opens the unfinished session of a carry-on card without starting another', async () => {
    const carryOnCard = { ...PICKS[0]!, reason: 'Carry on where you left off', continueSessionId: 'older-unfinished' };
    const session = makeSession({ id: carryOnCard.continueSessionId, title: 'The session this card opens' });
    const { getRequests } = await renderHome({
      homeScreen: { ...EXAMPLE_HOME_SCREEN, picks: [carryOnCard] },
      sessions: [UNFINISHED_SESSION!, session],
    });

    fireEvent.click(screen.getByRole('button', { name: new RegExp(carryOnCard.reason) }));

    await getSessionHeading(session.title);
    expect(window.location.pathname).toBe(`/sessions/${session.id}`);
    expect(getRequests('POST', '/api/sessions')).toEqual([]);
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

  it('keeps a reply on the screen and says it did not arrive, when the tutor cannot connect', async () => {
    renderSessionAddress({ sessions: [makeSession()] }, 'a-session');
    const replyBox = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: REPLY_BOX_LABELS.label });

    fireEvent.change(replyBox, { target: { value: 'Gravity, I think.' } });
    fireEvent.click(screen.getByRole('button', { name: REPLY_BOX_LABELS.send }));

    await screen.findByText('Gravity, I think.');
    screen.getByText(SESSION_LABELS.replyNotSent);
    screen.getByText(VOICE_LABELS.unavailable);
    expect(replyBox.value).toBe('');
  });

  it('shows no words of its own while the room opens on a new question, so nothing stale sits there', async () => {
    const { fetchStub } = renderSessionAddress({ sessions: [makeSession({ durationSeconds: 0 })] }, 'a-session');
    const room = holdAnswers(fetchStub, isCallTo('/api/sessions/a-session/live-room'));

    await getSessionHeading('Free-body diagrams');
    await waitFor(() => expect(room.getHeldCount()).toBe(1));

    expect(screen.queryByText(/Live lessons open soon/)).toBeNull();
    expect(screen.queryByText(SESSION_LABELS.idleWords)).toBeNull();
    screen.getByText(VOICE_LABELS.connecting);

    await room.release();
    await screen.findByText(VOICE_LABELS.unavailable);
    expect(screen.queryByText(/Live lessons open soon/)).toBeNull();
    expect(screen.queryByText(SESSION_LABELS.idleWords)).toBeNull();
  });

  it('invites a student who came back to type or talk, and opens no room until they do', async () => {
    const { getRequests } = renderSessionAddress({ sessions: [makeSession({ durationSeconds: 65 })] }, 'a-session');

    await screen.findByText(SESSION_LABELS.idleWords);
    expect(screen.queryByText(/Live lessons open soon/)).toBeNull();
    expect(getRequests('POST', '/api/sessions/a-session/live-room')).toEqual([]);

    fireEvent.change(screen.getByRole('textbox', { name: REPLY_BOX_LABELS.label }), { target: { value: 'Gravity, I think.' } });
    fireEvent.click(screen.getByRole('button', { name: REPLY_BOX_LABELS.send }));

    await screen.findByText(VOICE_LABELS.unavailable);
    expect(screen.queryByText(SESSION_LABELS.idleWords)).toBeNull();
    expect(getRequests('POST', '/api/sessions/a-session/live-room')).toHaveLength(1);
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

  it('shows the same message for a malformed address, with no try again', async () => {
    const { fetchStub } = renderSessionAddress({ sessions: [] }, 'not-a-session-id');
    const answerNormally = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementation((request) =>
      isCallTo('/api/sessions/not-a-session-id')(request)
        ? Promise.resolve(new Response(JSON.stringify({ statusCode: 400, fieldMessages: { id: ['id must be a UUID'] } }), { status: 400 }))
        : answerNormally(request),
    );

    await screen.findByRole('heading', { level: 1, name: SESSION_LABELS.notFound });
    expect(screen.queryByRole('button', { name: SESSION_LABELS.tryAgain })).toBeNull();
  });

  it('offers another try when the session does not load, and opens it then', async () => {
    const { fetchStub } = renderSessionAddress({ sessions: [makeSession()] }, 'a-session');
    const answerNormally = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementationOnce(async () => new Response('{}', { status: 403 }));

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

describe('the finished session', () => {
  it('does not promise a drawing on its board', async () => {
    renderSessionAddress({ sessions: [makeSession({ status: 'finished' })] }, 'a-session');

    await screen.findByText(SESSION_LABELS.finishedWords);

    expect(screen.queryByText(SESSION_LABELS.boardStandIn)).toBeNull();
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

  it('shows the end as pending until Home is ready, long after the API has answered', async () => {
    const { fetchStub, getRequests, endButton } = await openUnfinishedSession();
    const home = holdAnswers(fetchStub, isCallTo('/api/home'));

    fireEvent.click(endButton);
    await waitFor(() => expect(home.getHeldCount()).toBe(1));
    expect(getRequests('PATCH', `/api/sessions/${UNFINISHED_SESSION!.id}`)).toHaveLength(1);

    const pendingButton = screen.getByRole('button', { name: SESSION_LABELS.ending });
    expect(pendingButton.getAttribute('aria-disabled')).toBe('true');
    expect(within(screen.getByRole('banner')).getByRole('status').textContent).toBe(SESSION_LABELS.ending);

    await home.release();
    await screen.findByRole('heading', { name: HOME_GREETING }, { timeout: 2_000 });
  });

  it('moves focus to the heading on Home, because what the student pressed has gone', async () => {
    const { endButton } = await openUnfinishedSession();

    fireEvent.click(endButton);

    const heading = await screen.findByRole('heading', { name: HOME_GREETING }, { timeout: 2_000 });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('sends a length the API takes when the device clock is set back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { getRequests } = renderSessionAddress({ sessions: [makeSession({ durationSeconds: 40 })] }, 'a-session');
    const endButton = await getEndButton();

    vi.setSystemTime(Date.now() - 3_600_000);
    fireEvent.click(endButton);

    await screen.findByRole('heading', { name: HOME_GREETING }, { timeout: 2_000 });
    const [end] = getRequests('PATCH', '/api/sessions/a-session');
    expect(await end!.json()).toEqual({ durationSeconds: 40, status: 'finished' });
  });

  it('keeps the session finished when an earlier save answers after the end', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const session = makeSession();
    const { fetchStub } = renderSessionAddress({ sessions: [session] }, session.id);
    const endButton = await getEndButton();
    const save = holdAnswers(fetchStub, (request, heldSoFar) => request.method === 'PATCH' && heldSoFar === 0);
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(save.getHeldCount()).toBe(1);

    fireEvent.click(endButton);
    await screen.findByRole('heading', { name: HOME_GREETING }, { timeout: 2_000 });
    await save.release();

    fireEvent.click(await within(screen.getByRole('complementary')).findByRole('link', { name: session.title }));
    await screen.findByText(SESSION_LABELS.finishedWords);
    expect(screen.queryByRole('button', { name: SESSION_LABELS.endSession })).toBeNull();
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

describe('leaving while a start or an end is pending', () => {
  it.each([
    ['the API has not answered the end', (request: Request) => request.method === 'PATCH'],
    ['Home has not come back after the end', isCallTo('/api/home')],
  ])('leaves Home on screen when the student goes back and %s', async (_caseName, shouldHold) => {
    const { fetchStub, storedSessions, endButton } = await openUnfinishedSession();
    const pending = holdAnswers(fetchStub, shouldHold);

    fireEvent.click(endButton);
    await waitFor(() => expect(pending.getHeldCount()).toBeGreaterThan(0));
    act(() => window.history.back());
    await screen.findByRole('heading', { name: HOME_GREETING });
    await pending.release();
    await waitFor(() => expect(screen.queryByRole('button', { name: HOME_LABELS.continueButton })).toBeNull());
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(getPageOpacity()).toBe('');
    expect(window.location.pathname).toBe('/');
    expect(storedSessions[0]?.status).toBe('finished');
  });

  it.each([
    ['question', () => sendQuestion()],
    ['card', () => fireEvent.click(screen.getByRole('button', { name: new RegExp(PICKS[0]!.title) }))],
  ])('stays where the student went when they leave Home during a pending %s, and the session is still saved', async (kind, start) => {
    const { fetchStub } = await renderHome();
    const save = holdAnswers(fetchStub, (request) => request.method === 'POST');

    start();
    await waitFor(() => expect(save.getHeldCount()).toBe(1));
    await chooseSessionsInMenu();
    expect(document.querySelector('.stop-dot')).toBeNull();

    await save.release();

    await within(screen.getByRole('main')).findByRole('link', { name: kind === 'question' ? QUESTION : PICKS[0]!.title });
    expect(window.location.pathname).toBe('/sessions');
    expect(getPageOpacity()).toBe('');
  });

  it('shows the session as finished when the student goes back to the list while the end is pending', async () => {
    const session = makeSession();
    const { fetchStub } = stubSessionsApi({ sessions: [session] });
    window.history.replaceState(null, '', '/sessions');
    render(<App />);
    fireEvent.click(await within(await screen.findByRole('table')).findByRole('link', { name: session.title }));
    const endButton = await getEndButton();
    const end = holdAnswers(fetchStub, (request) => request.method === 'PATCH');

    fireEvent.click(endButton);
    await waitFor(() => expect(end.getHeldCount()).toBe(1));
    act(() => window.history.back());
    const row = (await within(await screen.findByRole('table')).findByRole('link', { name: session.title })).closest('tr') as HTMLElement;
    within(row).getByText(SESSIONS_LABELS.statuses.in_progress);
    await end.release();

    await within(row).findByText(SESSIONS_LABELS.statuses.finished);
    expect(window.location.pathname).toBe('/sessions');
    expect(getPageOpacity()).toBe('');
  });

  it('takes the fade off the page when the student leaves Home during it', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    await renderHome();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(PICKS[0]!.title) }));
    await waitFor(() => expect(getPageOpacity()).toBe('0'));
    await chooseSessionsInMenu();

    expect(getPageOpacity()).toBe('');
    await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
    expect(window.location.pathname).toBe('/sessions');
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
