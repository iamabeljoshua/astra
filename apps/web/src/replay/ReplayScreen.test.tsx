import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSession } from '../test/sessionsApi';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { RECAP_LABELS, REPLAY_LABELS } from '../strings';
import { ReplayScreen } from './ReplayScreen';

const stage = vi.hoisted(() => ({ canLoad: true, loaded: new Set<string>(), load: vi.fn(), draws: [] as [string, number][] }));

vi.mock('../scenes/kitSceneStage', () => ({
  createKitSceneStage: (_container: HTMLElement, onChange: () => void) => ({
    load: async (sceneId: string, ...rest: unknown[]) => {
      stage.load(sceneId, ...rest);
      if (stage.canLoad) stage.loaded.add(sceneId);
      onChange();
      return stage.canLoad;
    },
    draw: (sceneId: string, seconds: number) => void stage.draws.push([sceneId, seconds]),
    canDraw: (sceneId: string) => stage.loaded.has(sceneId),
    free: () => stage.loaded.clear(),
  }),
}));

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

function open(opened = session) {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={['/sessions/done']}>
      <Routes>
        <Route path="/sessions/done" element={<ReplayScreen session={opened} />} />
        <Route path="/sessions" element={<p>The list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const seekTo = (atMs: number) => fireEvent.change(screen.getByRole('slider', { name: REPLAY_LABELS.timeline }), { target: { value: String(atMs) } });

describe('the replay screen', () => {
  beforeEach(() => vi.stubGlobal('speechSynthesis', undefined));
  afterEach(() => vi.unstubAllGlobals());

  it('calls a session that moved to another topic by that topic, with no picture from the card it left', async () => {
    stubReplay({ replay: { recap: RECAP, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open({ ...session, artwork: null, subject: 'Astronomy', title: 'Black holes' });
    await screen.findByRole('slider', { name: REPLAY_LABELS.timeline });
    expect(screen.getAllByText('Black holes')).toHaveLength(2);
    expect(screen.queryByText('Astronomy')).toBeNull();
    expect(screen.queryByTestId('board-visual')).toBeNull();
  });

  describe('a lesson that had a scene', () => {
    const SCENE_ID = `scene-${'a'.repeat(40)}`;
    const getSceneLog = (engine: string) => [
      { seq: 0, atMs: 0, kind: 'beatPlayed', turnId: 't1', beat: { id: 'n1-setup', script: [{ kind: 'richScene', id: 'scene-1', engine, sceneId: SCENE_ID, moments: { a: 0, b: 2 }, parts: [], durationSeconds: 5 }, { kind: 'boardMode', mode: 'teach' }, { kind: 'runSimulation', target: 'scene-1', action: 'play', until: 'b', overWords: 4 }, 'Watch the line tilt.'], expectsReply: false }, reportedBy: 'browser', wordStartsMs: [0, 200, 400, 600], durationMs: 800, playedWords: 4, firedCueMs: [0, 0, 0], ending: 'finished', frozen: [] },
      { seq: 1, atMs: 1000, kind: 'beatPlayed', turnId: 't1', beat: { id: 'n1-close', script: ['What would a steeper line tell you?'], expectsReply: true }, reportedBy: 'browser', wordStartsMs: [0, 200, 400, 600, 800, 1000, 1200], durationMs: 1400, playedWords: 7, firedCueMs: [], ending: 'finished', frozen: [] },
      { seq: 2, atMs: 3000, kind: 'beatPlayed', turnId: 't2', beat: { id: 'b2', script: [{ kind: 'text', id: 'note', text: 'slope is rise over run' }, 'So the slope is the rate.'], expectsReply: false }, reportedBy: 'browser', wordStartsMs: [0, 200, 400, 600, 800, 1000], durationMs: 1200, playedWords: 6, firedCueMs: [0], ending: 'finished', frozen: [] },
    ];

    beforeEach(() => {
      vi.stubEnv('VITE_TUTOR_SCENES', '1');
      stage.canLoad = true;
      stage.loaded.clear();
      stage.load.mockClear();
      stage.draws.length = 0;
    });

    it('plays its scene on the same stage and at the same moments as the live lesson, once the scene has loaded', async () => {
      stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: getSceneLog('kit') }] } });
      open({ ...session, artwork: null });
      await screen.findByRole('slider', { name: REPLAY_LABELS.timeline });
      seekTo(500);
      expect(stage.load).toHaveBeenCalledWith(SCENE_ID, 5, 'kit');
      const layer = await screen.findByTestId('scene-layer');
      expect(layer.dataset.scene).toBe(SCENE_ID);
      expect(Number(layer.dataset.seconds)).toBeGreaterThan(0);
      expect(stage.draws.at(-1)?.[0]).toBe(SCENE_ID);
      expect(screen.getByTestId('tutor-caption').textContent).toContain('Watch the line');
    });

    it('plays a stored 2D take the same way', async () => {
      stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: getSceneLog('manimgx') }] } });
      open({ ...session, artwork: null });
      await screen.findByRole('slider', { name: REPLAY_LABELS.timeline });
      seekTo(500);
      expect(stage.load).toHaveBeenCalledWith(SCENE_ID, 5, 'manimgx');
      expect(await screen.findByTestId('scene-layer')).toBeTruthy();
    });

    it('leaves the plain board, saying nothing was drawn, and no box when the scene will not load', async () => {
      stage.canLoad = false;
      stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: getSceneLog('kit') }] } });
      open({ ...session, artwork: null });
      await screen.findByRole('slider', { name: REPLAY_LABELS.timeline });
      seekTo(500);
      await waitFor(() => expect(stage.load).toHaveBeenCalled());
      expect(screen.queryByTestId('scene-layer')).toBeNull();
      expect(screen.queryByTestId('board-visual')).toBeNull();
      expect(screen.getByTestId('board-empty').textContent).toBe(REPLAY_LABELS.emptyBoard);
      seekTo(3500);
      expect(screen.getByText('slope is rise over run')).toBeTruthy();
      expect(screen.queryByTestId('board-empty')).toBeNull();
    });
  });

  it('says what happened where a lesson drew nothing, so a dark board is not a black screen', async () => {
    stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open({ ...session, artwork: null });
    await screen.findByRole('slider', { name: REPLAY_LABELS.timeline });
    seekTo(100);
    expect(screen.getByTestId('board-empty').textContent).toBe(REPLAY_LABELS.emptyBoard);
  });

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

  it('opens with sound off, says how it will sound, and reads aloud only once Sound is pressed', async () => {
    const speak = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(readonly text: string) {} });
    vi.stubGlobal('speechSynthesis', { getVoices: () => [{ localService: true, default: true, lang: 'en-US' }], speak, cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
    stubReplay({ replay: { recap: null, runs: [{ startedAt: 'x', events: LESSON_LOG }] } });
    open();
    const sound = await screen.findByRole('button', { name: REPLAY_LABELS.sound });
    expect(sound.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('replay-sound-note').textContent).toBe(REPLAY_LABELS.soundOffNote);
    expect(REPLAY_LABELS.soundOffNote).toMatch(/won't sound like your tutor/);

    fireEvent.click(screen.getByRole('button', { name: REPLAY_LABELS.play }));
    expect(speak).not.toHaveBeenCalled();

    fireEvent.click(sound);
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    expect(speak).toHaveBeenCalledOnce();
    expect(screen.getByTestId('replay-sound-note').textContent).toBe(REPLAY_LABELS.soundNote);
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
