import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { formatSessionDate, formatSessionLength } from '../session/formatSession';
import { API_ERROR_LABELS, MENU_LABELS, SESSIONS_LABELS, SIDEBAR_LABELS } from '../strings';
import { makeSession, stubSessionsApi } from '../test/sessionsApi';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));

const SAMPLE_SESSIONS = [
  makeSession({ id: 'one', title: 'Why Saturn has rings', subject: 'Astronomy', startedAt: '2026-10-31T12:00:00Z', durationSeconds: 252 }),
  makeSession({ id: 'two', title: 'Free-body diagrams', subject: 'Physics', startedAt: '2026-10-29T12:00:00Z', durationSeconds: 1120, status: 'finished' }),
];
const FIRST_PAGE_SIZE = 50;

function renderSessionsPage(sessions = SAMPLE_SESSIONS) {
  window.history.replaceState(null, '', '/sessions');
  const fakeApi = stubSessionsApi({ sessions });
  render(<App />);
  return fakeApi;
}

const getSearchBox = () => screen.getByRole<HTMLInputElement>('searchbox', { name: SESSIONS_LABELS.search });
const getRowTitles = () => within(screen.getByRole('table')).getAllByRole('link').map((link) => link.textContent);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the Sessions page', () => {
  it('lists each session in the order the API sends, with its title, subject, date, length, and status', async () => {
    renderSessionsPage();

    await screen.findByRole('table');

    expect(getRowTitles()).toEqual(SAMPLE_SESSIONS.map((session) => session.title));
    const table = screen.getByRole('table');
    const firstRow = within(table).getByRole('link', { name: 'Why Saturn has rings' }).closest('tr') as HTMLElement;
    within(firstRow).getByText('Astronomy');
    within(firstRow).getByText(formatSessionDate(SAMPLE_SESSIONS[0]!.startedAt));
    within(firstRow).getByText('04:12');
    within(firstRow).getByText(SESSIONS_LABELS.statuses.in_progress);
    within(within(table).getByRole('link', { name: 'Free-body diagrams' }).closest('tr') as HTMLElement).getByText(SESSIONS_LABELS.statuses.finished);
  });

  it('asks the API to search and shows what it finds', async () => {
    const { fetchStub } = renderSessionsPage();
    await screen.findByRole('table');

    fireEvent.change(getSearchBox(), { target: { value: '  SATURN ' } });

    await waitFor(() => expect(getRowTitles()).toEqual(['Why Saturn has rings']));
    const searches = fetchStub.mock.calls.map(([request]) => new URL(request.url).searchParams.get('search'));
    expect(searches).toContain('SATURN');
  });

  it('stops the search box at the length the API takes', async () => {
    renderSessionsPage();

    await screen.findByRole('table');

    expect(getSearchBox().maxLength).toBe(200);
  });

  it('says so when a search finds nothing, and shows the list again when the search is cleared', async () => {
    renderSessionsPage();
    await screen.findByRole('table');

    fireEvent.change(getSearchBox(), { target: { value: 'calculus' } });
    await screen.findByText(SESSIONS_LABELS.noMatch);
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.change(getSearchBox(), { target: { value: '' } });
    await screen.findByRole('table');
  });

  it('gives a new student a clear empty state', async () => {
    renderSessionsPage([]);

    await within(screen.getByRole('main')).findByText(SIDEBAR_LABELS.noSessions);
    screen.getByRole('heading', { level: 1, name: MENU_LABELS.sessions });
  });

  it('reaches every session through Show more, and offers it no more once all are shown', async () => {
    const sessions = Array.from({ length: FIRST_PAGE_SIZE + 2 }, (_unused, index) => makeSession({ id: `session-${index}`, title: `Session ${index}` }));
    renderSessionsPage(sessions);
    await screen.findByRole('table');
    expect(getRowTitles()).toHaveLength(FIRST_PAGE_SIZE);

    fireEvent.click(screen.getByRole('button', { name: SESSIONS_LABELS.showMore }));

    await waitFor(() => expect(getRowTitles()).toHaveLength(sessions.length));
    expect(screen.queryByRole('button', { name: SESSIONS_LABELS.showMore })).toBeNull();
  });

  it('opens a session from its row', async () => {
    renderSessionsPage();

    fireEvent.click(await within(await screen.findByRole('table')).findByRole('link', { name: 'Free-body diagrams' }));

    await waitFor(() => expect(window.location.pathname).toBe('/sessions/two'));
  });

  it('says what went wrong and tries again when the list does not load', async () => {
    const { fetchStub } = renderSessionsPage();
    const answerNormally = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementation(async () => new Response('{}', { status: 400 }));

    const main = screen.getByRole('main');
    await within(main).findByText(API_ERROR_LABELS.rejected);
    fetchStub.mockImplementation(answerNormally);
    fireEvent.click(within(main).getByRole('button', { name: SESSIONS_LABELS.tryAgain }));

    await screen.findByRole('table');
  });

  it('offers New session, which goes to Home', async () => {
    renderSessionsPage();

    expect(screen.getByRole('link', { name: SESSIONS_LABELS.newSession }).getAttribute('href')).toBe('/');
  });
});

describe('formatSessionLength', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [252, '04:12'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [37_230, '10:20:30'],
  ])('shows %i seconds as %s', (seconds, expected) => {
    expect(formatSessionLength(seconds)).toBe(expected);
  });
});

describe('formatSessionDate', () => {
  const NOW = new Date(2026, 10, 3, 18, 0);

  it('says today for a session from today, even at another hour', () => {
    expect(formatSessionDate(new Date(2026, 10, 3, 0, 5).toISOString(), NOW)).toBe(SESSIONS_LABELS.today);
  });

  it('shows the day for an earlier date this year, with no year', () => {
    const shown = formatSessionDate(new Date(2026, 9, 31, 12).toISOString(), NOW);

    expect(shown).toContain('31');
    expect(shown).not.toContain('2026');
  });

  it('shows the year for an earlier year', () => {
    expect(formatSessionDate(new Date(2025, 9, 31, 12).toISOString(), NOW)).toContain('2025');
  });
});
