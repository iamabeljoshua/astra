import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { REVIEW_LABELS, SIDEBAR_LABELS } from '../strings';
import { stubFetchWithHomeScreen } from '../test/homeScreenApi';
import { REVIEW_PATH } from './reviewPath';
import { getWaitText } from './getWaitText';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));

const STUDENT_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000011';
const FLAG_ID = '00000000-0000-4000-8000-000000000021';
const HOURS_MS = 3_600_000;

const OPEN_FLAG = {
  id: FLAG_ID,
  studentId: STUDENT_ID,
  sessionId: SESSION_ID,
  kind: 'self_harm',
  source: 'student',
  createdAt: new Date(Date.now() - 3 * HOURS_MS).toISOString(),
  reviewedAt: null,
  reviewedBy: null,
};
const REVIEWED_FLAG = { ...OPEN_FLAG, reviewedAt: new Date().toISOString(), reviewedBy: STUDENT_ID };

function stubReviewApi({ flags, status = 200 }: { flags: object[]; status?: number }) {
  const fetchHomeScreen = stubFetchWithHomeScreen();
  let currentFlags = flags;
  const fetchFromApp = vi.fn((input: Request | string, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    const answer = (body: unknown, answerStatus = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status: answerStatus, headers: { 'content-type': 'application/json' } }));
    if (url.pathname === '/api/review/flags') return answer(status === 200 ? currentFlags : { statusCode: status }, status);
    if (url.pathname === `/api/review/flags/${FLAG_ID}/reviewed`) {
      currentFlags = [REVIEWED_FLAG];
      return answer(REVIEWED_FLAG);
    }
    return fetchHomeScreen(input, init);
  });
  vi.stubGlobal('fetch', fetchFromApp);
  return fetchFromApp;
}

beforeEach(() => {
  window.history.pushState({}, '', REVIEW_PATH);
});

describe('the review page', () => {
  it('shows a flag in plain words, with who it came from, both IDs, and the wait against the promise', async () => {
    stubReviewApi({ flags: [OPEN_FLAG] });

    render(<App />);

    const row = (await screen.findByRole('heading', { name: REVIEW_LABELS.kinds.self_harm })).closest('li') as HTMLElement;
    expect(within(row).getByText(REVIEW_LABELS.sources.student)).toBeTruthy();
    expect(within(row).getByText(STUDENT_ID)).toBeTruthy();
    expect(within(row).getByText(SESSION_ID)).toBeTruthy();
    expect(within(row).getByText(REVIEW_LABELS.waitingInTime(3, 21))).toBeTruthy();
  });

  it('says plainly that a flag holds no words', async () => {
    stubReviewApi({ flags: [] });

    render(<App />);

    await screen.findByText(REVIEW_LABELS.about);
    expect(REVIEW_LABELS.about).toContain('holds no words');
  });

  it('marks a flag reviewed with its button', async () => {
    const fetchFromApp = stubReviewApi({ flags: [OPEN_FLAG] });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: REVIEW_LABELS.markReviewed }));

    await waitFor(() => expect(screen.queryByRole('button', { name: REVIEW_LABELS.markReviewed })).toBeNull());
    expect(fetchFromApp.mock.calls.some(([input]) => String(typeof input === 'string' ? input : input.url).endsWith(`/review/flags/${FLAG_ID}/reviewed`))).toBe(true);
  });

  it('sends a non-reviewer where any unknown path goes', async () => {
    stubReviewApi({ flags: [], status: 404 });

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: REVIEW_LABELS.pageTitle })).toBeNull();
    expect(screen.getByRole('navigation', { name: SIDEBAR_LABELS.menu })).toBeTruthy();
  });
});

describe('getWaitText', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * HOURS_MS).toISOString();

  it.each([
    [0, REVIEW_LABELS.waitingInTime(0, 24)],
    [23, REVIEW_LABELS.waitingInTime(23, 1)],
    [24, REVIEW_LABELS.waitingTooLong(24, 0)],
    [30, REVIEW_LABELS.waitingTooLong(30, 6)],
  ])('after %i hours says %s', (hours, text) => {
    expect(getWaitText(hoursAgo(hours), now)).toBe(text);
  });
});
