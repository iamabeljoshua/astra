import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_SCREEN_KEY } from '../home/useHomeScreen';
import { RECORD_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { RecordSection } from './RecordSection';

vi.mock('../auth/session', () => ({ getAccessToken: async () => 'test-token', forgetSession: vi.fn(), renewSession: vi.fn() }));

const SIGN_ERROR = {
  id: 'note-1',
  kind: 'struggled',
  topic: 'Moving a term',
  detail: 'Kept the plus when moving the 3',
  evidence: [{ source: 'board', text: '2x = 14', check: 'wrong' }],
  sessionId: 'session-1',
  sessionTitle: 'Solving equations',
  notedAt: '2026-11-03T12:00:00Z',
};
const ROCKETS = {
  id: 'note-2',
  kind: 'cares_about',
  topic: 'Rockets',
  detail: null,
  evidence: [{ source: 'words', text: 'i want to build rockets', check: null }],
  sessionId: 'session-1',
  sessionTitle: 'Solving equations',
  notedAt: '2026-11-03T12:00:00Z',
};

function stubApi(startingNotes: object[], failDeletes = false) {
  let notes = [...startingNotes] as { id: string }[];
  const deleted: string[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (request.method !== 'DELETE') return new Response(JSON.stringify({ notes }));
    if (failDeletes) return new Response(JSON.stringify({ message: 'broken' }), { status: 500 });
    deleted.push(pathname);
    notes = pathname.endsWith('/me/record') ? [] : notes.filter(({ id }) => !pathname.endsWith(id));
    return new Response(null, { status: 204 });
  });
  return deleted;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what the tutor remembers, on the Your notes page', () => {
  it('refreshes Home in the background when a note goes, so its card goes at once', async () => {
    stubApi([SIGN_ERROR]);
    const { queryClient } = renderWithQueryClient(<RecordSection />);
    let homeLoads = 0;
    await queryClient.prefetchQuery({
      queryKey: HOME_SCREEN_KEY,
      queryFn: () => {
        homeLoads += 1;
        return { picks: [] };
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: RECORD_LABELS.removeNamed(SIGN_ERROR.topic) }));

    await waitFor(() => expect(homeLoads).toBe(2));
  });

  it('says so plainly when there is nothing yet', async () => {
    stubApi([]);
    renderWithQueryClient(<RecordSection />);

    await screen.findByText(RECORD_LABELS.empty);
  });

  it('shows each note in plain words with the evidence behind it and where it came from', async () => {
    stubApi([SIGN_ERROR, ROCKETS]);
    renderWithQueryClient(<RecordSection />);

    await screen.findByText(SIGN_ERROR.topic);
    screen.getByText(SIGN_ERROR.detail);
    screen.getByText(RECORD_LABELS.markedWrong('2x = 14'));
    screen.getByText(RECORD_LABELS.saidThis('i want to build rockets'));
    expect(screen.getAllByText(new RegExp(SIGN_ERROR.sessionTitle))).toHaveLength(2);
  });

  it('removes one note and leaves the others', async () => {
    const deleted = stubApi([SIGN_ERROR, ROCKETS]);
    renderWithQueryClient(<RecordSection />);

    fireEvent.click(await screen.findByRole('button', { name: RECORD_LABELS.removeNamed(SIGN_ERROR.topic) }));

    await waitFor(() => expect(screen.queryByText(SIGN_ERROR.topic)).toBeNull());
    screen.getByText(ROCKETS.topic);
    expect(deleted).toEqual(['/api/me/record/notes/note-1']);
  });

  it('forgets everything only after asking', async () => {
    const deleted = stubApi([SIGN_ERROR]);
    renderWithQueryClient(<RecordSection />);

    fireEvent.click(await screen.findByRole('button', { name: RECORD_LABELS.forgetAll }));
    expect(deleted).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: RECORD_LABELS.forgetAllYes }));

    await screen.findByText(RECORD_LABELS.empty);
    expect(deleted).toEqual(['/api/me/record']);
  });

  it('keeps the note and says so when removing it fails', async () => {
    stubApi([SIGN_ERROR], true);
    renderWithQueryClient(<RecordSection />);

    fireEvent.click(await screen.findByRole('button', { name: RECORD_LABELS.removeNamed(SIGN_ERROR.topic) }));

    await screen.findByRole('alert');
    screen.getByText(SIGN_ERROR.topic);
  });
});
