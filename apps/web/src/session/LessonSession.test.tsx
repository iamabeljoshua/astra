import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { ApiError } from '../api/apiError';
import { type LabSessionOptions, startLabSession } from '../lab/labSession';
import { SCENE_LABELS } from '../strings';
import LessonSession from './LessonSession';
import type { Session } from './sessionQueries';

vi.mock('../api/client', () => ({ api: { post: vi.fn() } }));
vi.mock('../lab/labSession', () => ({ startLabSession: vi.fn() }));
vi.mock('../scenes/sceneEngine', () => ({ getCanPlayScenes: async () => false }));
vi.mock('../scenes/sceneStage', () => ({ createSceneStage: () => ({ free: () => {}, load: async () => false, canDraw: () => false, draw: () => {} }) }));
vi.mock('./useSessionRun', () => ({ useSessionRun: () => ({ seconds: 3, endSession: vi.fn(), isEnding: false, endProblem: null }) }));

const SESSION = { id: 'session-1', title: 'What a derivative really measures', subject: 'Math', status: 'in_progress', durationSeconds: 0, artwork: null } as unknown as Session;
const post = vi.mocked(api.post);
const startSession = vi.mocked(startLabSession);

function makeLab({ caption = 'Words from the tutor', messages = [{ type: 'words' }] as object[] } = {}) {
  return { records: { frames: [], agentMessages: messages, log: [] }, player: { getCaption: () => caption }, getBoardNow: () => ({ board: { elements: new Map(), focus: null, refusedSliders: [] }, atMs: 0 }), sendScene: vi.fn(), command: vi.fn(), close: vi.fn(async () => {}) } as never;
}

const open = () => render(<MemoryRouter><LessonSession session={SESSION} /></MemoryRouter>);
const untilStarted = () => vi.waitFor(() => expect(startSession).toHaveBeenCalled());
const getClosedHandler = () => (startSession.mock.calls.at(-1)?.[0] as LabSessionOptions & { onClosed(reason: string): void }).onClosed;

describe('a lesson that cannot reach a student', () => {
  beforeEach(() => {
    post.mockReset();
    startSession.mockReset();
    post.mockResolvedValue({ url: 'ws://room', token: 'token' } as never);
    startSession.mockResolvedValue(makeLab());
  });

  afterEach(() => vi.useRealTimers());

  it('says so when the lesson service is down, and can try again', async () => {
    post.mockRejectedValueOnce(new ApiError({ kind: 'server', status: 503 }));
    open();
    expect(await screen.findByText(SCENE_LABELS.lessonDown)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: SCENE_LABELS.tryAgain }));
    await untilStarted();
    expect(post).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(screen.queryByText(SCENE_LABELS.lessonDown)).toBeNull());
  });

  it('says so when a student has opened too many lessons', async () => {
    post.mockRejectedValueOnce(new ApiError({ kind: 'rejected', status: 429 }));
    open();
    expect(await screen.findByText(SCENE_LABELS.tooManyLessons)).toBeTruthy();
  });

  it.each([
    [{ refused: 'twoOpen' }, SCENE_LABELS.twoLessonsOpen],
    [{ refused: 'tooManyStarts', retryAfterSeconds: 240 }, SCENE_LABELS.tooManyStarts(240)],
    [{ refused: 'studentSpent', retryAfterSeconds: 7200 }, SCENE_LABELS.studentSpent(7200)],
    [{ refused: 'everyoneSpent', retryAfterSeconds: 7200 }, SCENE_LABELS.everyoneSpent(7200)],
  ])('tells a student the limit they hit and the real wait: %j', async (responseBody, label) => {
    post.mockRejectedValueOnce(new ApiError({ kind: 'rejected', status: 429, responseBody }));
    open();
    expect(await screen.findByText(label)).toBeTruthy();
  });

  it('states a wait in plain time, and no wait where there is none', () => {
    expect(SCENE_LABELS.tooManyStarts(240)).toMatch(/about 4 minutes/);
    expect(SCENE_LABELS.tooManyStarts(30)).toMatch(/about 1 minute\b/);
    expect(SCENE_LABELS.studentSpent(7200)).toMatch(/about 2 hours/);
    expect(SCENE_LABELS.everyoneSpent(1800)).toMatch(/about 30 minutes/);
    expect(SCENE_LABELS.twoLessonsOpen).not.toMatch(/wait/i);
  });

  it('offers a way back and no reply box when the lesson has no words of its own', async () => {
    open();
    await untilStarted();
    const { onSceneMessage } = startSession.mock.calls.at(-1)?.[0] as LabSessionOptions;
    await vi.waitFor(() => expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0));
    act(() => onSceneMessage?.({ type: 'noLesson' }));
    expect(await screen.findByRole('link', { name: SCENE_LABELS.backToHome })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says why a student is hearing a tone past the voice limit', async () => {
    open();
    await untilStarted();
    const { onSceneMessage } = startSession.mock.calls.at(-1)?.[0] as LabSessionOptions;
    await vi.waitFor(() => expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0));
    act(() => onSceneMessage?.({ type: 'voiceAtLimit' }));
    expect(await screen.findByText(SCENE_LABELS.voiceAtLimit)).toBeTruthy();
  });

  it('tells the old tab where the lesson went when a second tab takes it', async () => {
    open();
    await untilStarted();
    act(() => getClosedHandler()('moved'));
    expect(await screen.findByText(SCENE_LABELS.lessonMoved)).toBeTruthy();
    expect(screen.getByRole('button', { name: SCENE_LABELS.tryAgain })).toBeTruthy();
  });

  it('says the room was lost, and a retry opens the lesson again', async () => {
    open();
    await untilStarted();
    act(() => getClosedHandler()('lost'));
    expect(await screen.findByText(SCENE_LABELS.lessonLost)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: SCENE_LABELS.tryAgain }));
    await vi.waitFor(() => expect(startSession).toHaveBeenCalledTimes(2));
  });

  it('says the lesson has ended when the tutor has finished', async () => {
    open();
    await untilStarted();
    act(() => getClosedHandler()('ended'));
    expect(await screen.findByText(SCENE_LABELS.lessonEnded)).toBeTruthy();
  });

  it('does not stay silent if the tutor sends no words, as a page once sat blank for 35 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    startSession.mockResolvedValue(makeLab({ caption: '', messages: [] }));
    open();
    await vi.waitFor(() => expect(startSession).toHaveBeenCalled());
    await act(() => vi.advanceTimersByTimeAsync(16_000));
    expect(screen.getByText(SCENE_LABELS.lessonSilent)).toBeTruthy();
  });

  it('stays quiet once words have come', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    await vi.waitFor(() => expect(startSession).toHaveBeenCalled());
    await act(() => vi.advanceTimersByTimeAsync(16_000));
    expect(screen.queryByText(SCENE_LABELS.lessonSilent)).toBeNull();
  });
});

describe('words on the plain board', () => {
  it('carry the same label as a scene, because no person has checked them either', async () => {
    post.mockResolvedValue({ url: 'ws://room', token: 'token' } as never);
    startSession.mockResolvedValue(makeLab());
    open();
    expect(await screen.findByText(SCENE_LABELS.wordsNotChecked)).toBeTruthy();
  });
});

describe('proof hooks', () => {
  it('put nothing on the window in a test build, which has the same flag a production build reads', async () => {
    const onWindow = window as unknown as Record<string, unknown>;
    for (const name of ['sceneLesson', 'sceneStage', 'holdLessonFrame']) delete onWindow[name];
    vi.stubEnv('DEV', false);
    post.mockResolvedValue({ url: 'ws://room', token: 'token' } as never);
    startSession.mockReset();
    startSession.mockResolvedValue(makeLab());
    open();
    await untilStarted();
    await vi.waitFor(() => expect(screen.getAllByTestId('caption').length).toBeGreaterThan(0));
    expect(onWindow.sceneLesson).toBeUndefined();
    expect(onWindow.sceneStage).toBeUndefined();
    expect(onWindow.holdLessonFrame).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
