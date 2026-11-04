import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSession } from '../test/sessionsApi';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { RECAP_LABELS, REPLAY_LABELS } from '../strings';
import { ReplayScreen } from './ReplayScreen';

const LESSON_LOG = [
  { seq: 0, atMs: 0, kind: 'beatPlayed', turnId: 't1', beat: { id: 'b0', script: ['Look at this line.'], expectsReply: false }, reportedBy: 'browser', wordStartsMs: [0, 200, 400, 600], durationMs: 800, playedWords: 4, firedCueMs: [], ending: 'finished', frozen: [] },
  { seq: 1, atMs: 2000, kind: 'studentSpoke', text: 'why does that work', source: 'typed', isReaction: false, durationMs: 0 },
];
const RECAP = { kind: 'lesson', covered: 'We took three from both sides.', gotRight: 'You got x equals 4 right.', tryNext: 'Try one more on your own.' };
const session = makeSession({ id: 'done', title: 'Solving for x', status: 'finished', canReplay: true, durationSeconds: 90 });

function stubReplay(answers: { replay?: object | null; deleteStatus?: number }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    calls.push(`${request.method} ${new URL(request.url).pathname}`);
    if (request.method === 'DELETE' || request.method === 'PUT') return new Response(null, { status: answers.deleteStatus ?? 204 });
    if (new URL(request.url).pathname.endsWith('/replay')) return answers.replay === null ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(answers.replay), { status: 200 });
    return new Response('[]', { status: 200 });
  }));
  return calls;
}

function open() {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={['/sessions/done']}>
      <Routes>
        <Route path="/sessions/done" element={<ReplayScreen session={session} />} />
        <Route path="/sessions" element={<p>The list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const seekTo = (atMs: number) => fireEvent.change(screen.getByRole('slider', { name: REPLAY_LABELS.timeline }), { target: { value: String(atMs) } });

describe('the replay screen', () => {
  beforeEach(() => vi.stubGlobal('speechSynthesis', undefined));
  afterEach(() => vi.unstubAllGlobals());

  it('opens on the recap, with the lesson ready to play', async () => {
    stubReplay({ replay: { recap: RECAP, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    expect(await screen.findByText(RECAP.covered)).toBeTruthy();
    expect(screen.getByText(RECAP.gotRight)).toBeTruthy();
    expect(screen.getByText(RECAP.tryNext)).toBeTruthy();
    expect(screen.getByRole('button', { name: REPLAY_LABELS.play })).toBeTruthy();
  });

  it('shows the tutor\'s words and the student\'s line at the moment seeked to', async () => {
    stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    await screen.findByRole('slider', { name: REPLAY_LABELS.timeline });
    seekTo(500);
    expect(screen.getByTestId('tutor-caption').textContent).toContain('Look at this');
    expect(screen.getByTestId('current-word').textContent?.trim()).toBe('this');
    expect(screen.queryByTestId('replay-student-line')).toBeNull();
    seekTo(2100);
    expect(screen.getByTestId('replay-student-line').textContent).toContain('why does that work');
    seekTo(100);
    expect(screen.queryByTestId('replay-student-line')).toBeNull();
  });

  it('says plainly what plays when the device has no voice to read it', async () => {
    stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    expect((await screen.findByTestId('replay-sound-note')).textContent).toBe(REPLAY_LABELS.noSoundNote);
    expect(screen.queryByRole('button', { name: REPLAY_LABELS.sound })).toBeNull();
  });

  it('takes no work, because this has already happened', async () => {
    stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    await screen.findByRole('slider', { name: REPLAY_LABELS.timeline });
    seekTo(100);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('asks before deleting, then deletes and returns to the list', async () => {
    const calls = stubReplay({ replay: { recap: RECAP, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: REPLAY_LABELS.deleteReplay }));
    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: REPLAY_LABELS.confirmDelete }));
    expect(await screen.findByText('The list')).toBeTruthy();
    expect(calls).toContain('DELETE /api/sessions/done/replay');
  });

  it('keeps the replay when the student changes their mind', async () => {
    const calls = stubReplay({ replay: { recap: RECAP, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: REPLAY_LABELS.deleteReplay }));
    fireEvent.click(screen.getByRole('button', { name: REPLAY_LABELS.keep }));
    await waitFor(() => expect(screen.getByRole('button', { name: REPLAY_LABELS.deleteReplay })).toBeTruthy());
    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
  });

  it('saves the student\'s own answer to the thing to try', async () => {
    const calls = stubReplay({ replay: { recap: RECAP, recapAnswer: null, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    fireEvent.change(await screen.findByRole('textbox', { name: RECAP_LABELS.yourAnswer }), { target: { value: '3x = 15' } });
    fireEvent.click(screen.getByRole('button', { name: RECAP_LABELS.save }));
    await screen.findByRole('button', { name: RECAP_LABELS.saved });
    expect(calls).toContain('PUT /api/sessions/done/recap-answer');
  });

  it('shows an answer saved before', async () => {
    stubReplay({ replay: { recap: RECAP, recapAnswer: '3x = 15', runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    expect((await screen.findByRole<HTMLInputElement>('textbox', { name: RECAP_LABELS.yourAnswer })).value).toBe('3x = 15');
  });

  it('says so when a log holds nothing it can play', async () => {
    stubReplay({ replay: { recap: null, runs: [] } });
    open();
    expect(await screen.findByText(REPLAY_LABELS.noneLeft)).toBeTruthy();
  });

  it('says so when the replay will not load', async () => {
    stubReplay({ replay: null });
    open();
    expect(await screen.findByText(REPLAY_LABELS.couldNotLoad, undefined, { timeout: 8000 })).toBeTruthy();
  }, 10_000);
});
