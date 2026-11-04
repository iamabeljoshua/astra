import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { BOARD_WORK_LABELS, REPLY_BOX_LABELS, SESSION_LABELS, VOICE_LABELS } from '../strings';
import { makeSession, stubSessionsApi } from '../test/sessionsApi';
import type { LiveVoice, LiveVoiceView } from './liveVoice';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));

const startLiveVoice = vi.hoisted(() => vi.fn());
vi.mock('./liveVoice', async (importOriginal) => ({ ...(await importOriginal<typeof import('./liveVoice')>()), startLiveVoice }));

const BASE_VIEW: LiveVoiceView = { phase: 'live', mic: 'off', isSoundBlocked: false, isQuietWarning: false, isHeard: false, isThinking: false, isTutorSpeaking: false, closedBecause: null, firstWord: null, isStopped: false, typingNotes: 0, costUsd: null, startedFresh: false, hasTutorStarted: false, studentLines: [], tutorHeard: [], tutorComing: [] };

function makeVoice() {
  let view = BASE_VIEW;
  const listeners = new Set<() => void>();
  const voice = {
    records: {},
    player: {},
    getView: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getBoardNow: () => ({ board: { elements: new Map(), focus: null, stage: null }, atMs: 0 }),
    getLoudness: () => 0,
    sendPause: () => {},
    noteTyping() {
      view = { ...view, typingNotes: view.typingNotes + 1 };
      listeners.forEach((listener) => listener());
    },
    sendWork: vi.fn(),
    stopTutor: () => {},
    sendTyped: vi.fn(),
    reportMarkNotDrawn: vi.fn(),
    toggleMic: vi.fn(async () => {}),
    sayStillHere: vi.fn(),
    turnOnSound: vi.fn(),
    mark: vi.fn(),
    close: vi.fn(async () => {}),
  };
  return {
    voice: voice as unknown as LiveVoice & typeof voice,
    setView(changes: Partial<LiveVoiceView>) {
      view = { ...view, ...changes };
      listeners.forEach((listener) => listener());
    },
  };
}

const getChatBox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: REPLY_BOX_LABELS.label });
const getBox = () => screen.getByRole<HTMLInputElement>('textbox', { name: BOARD_WORK_LABELS.entry });

async function openVoice(first = makeVoice()) {
  startLiveVoice.mockResolvedValueOnce(first.voice);
  const session = makeSession();
  window.history.replaceState(null, '', `/sessions/${session.id}`);
  stubSessionsApi({ sessions: [session] });
  render(<App />);
  await waitFor(() => getBox());
  return first;
}

describe('what the student sees of a room', () => {
  beforeEach(() => startLiveVoice.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['ended', VOICE_LABELS.ended, VOICE_LABELS.tryAgain],
    ['tutorLost', VOICE_LABELS.tutorLost, VOICE_LABELS.tryAgain],
    ['noTutor', VOICE_LABELS.unavailable, VOICE_LABELS.tryAgain],
    ['closedForQuiet', VOICE_LABELS.closedForQuiet, VOICE_LABELS.openAgain],
  ] as const)('in %s it says why and offers a way back, and typing cannot vanish into the closed room', async (phase, note, action) => {
    const { voice, setView } = await openVoice();
    act(() => setView({ phase }));
    expect(screen.getByText(note)).toBeTruthy();
    expect(screen.getByRole('button', { name: action })).toBeTruthy();
    expect(getBox().disabled).toBe(true);
    fireEvent.change(getBox(), { target: { value: 'Hello' } });
    fireEvent.submit(getBox());
    expect(voice.sendWork).not.toHaveBeenCalled();
  });

  it('at the limit on starting tutors says the real wait, keeps the reply box closed, and joins nothing when the student types', async () => {
    const { voice, setView } = await openVoice();
    act(() => setView({ phase: 'tutorLost' }));
    startLiveVoice.mockImplementationOnce(async ({ getAccess }: { getAccess(): Promise<unknown> }) => {
      if (!(await getAccess())) throw new Error('no room');
      return voice;
    });
    const answerOtherRoutes = globalThis.fetch;
    vi.stubGlobal('fetch', async (request: Request) => (request.url.endsWith('/live-room?startOver=yes') ? new Response(JSON.stringify({ statusCode: 429, message: 'Wait', retryAfterSeconds: 360 }), { status: 429 }) : answerOtherRoutes(request)));
    fireEvent.click(screen.getByRole('button', { name: VOICE_LABELS.tryAgain }));
    await waitFor(() => expect(screen.getByText(VOICE_LABELS.tooSoon(360))).toBeTruthy());
    expect(getChatBox().readOnly).toBe(true);
    expect(screen.getByRole('button', { name: VOICE_LABELS.tryAgain })).toBeTruthy();
    expect(startLiveVoice).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(getChatBox(), { key: 'Enter' });
    expect(startLiveVoice).toHaveBeenCalledTimes(2);
  });

  it('opens a new room when the student asks for one, and leaves the old one', async () => {
    const { voice, setView } = await openVoice();
    act(() => setView({ phase: 'tutorLost' }));
    const second = makeVoice();
    startLiveVoice.mockResolvedValueOnce(second.voice);
    fireEvent.click(screen.getByRole('button', { name: VOICE_LABELS.tryAgain }));
    await waitFor(() => expect(startLiveVoice).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(voice.close).toHaveBeenCalled());
    await waitFor(() => expect(getBox().disabled).toBe(false));
    await waitFor(() => expect(second.voice.sendTyped).toHaveBeenCalledWith(SESSION_LABELS.carryOnWith(makeSession().title)));
  });

  it('says in one line that the tutor started fresh after the page landed in a new room', async () => {
    const { setView } = await openVoice();
    act(() => setView({ startedFresh: true }));
    expect(screen.getByText(VOICE_LABELS.startedFresh)).toBeTruthy();
    expect(screen.queryByRole('button', { name: VOICE_LABELS.tryAgain })).toBeNull();
    act(() => setView({ startedFresh: false }));
    expect(screen.queryByText(VOICE_LABELS.startedFresh)).toBeNull();
  });

  it('offers no new room to a tutor closed for spending, because another room would only start it over', async () => {
    const { setView } = await openVoice();
    act(() => setView({ closedBecause: 'sessionLimit', phase: 'closedForQuiet' }));
    expect(screen.getByText(VOICE_LABELS.sessionLimit)).toBeTruthy();
    expect(screen.queryByRole('button', { name: VOICE_LABELS.openAgain })).toBeNull();
    expect(screen.queryByRole('button', { name: VOICE_LABELS.tryAgain })).toBeNull();
  });

  it('shows one clear prompt to tap when the browser blocks sound, not a blank wait', async () => {
    const { voice, setView } = await openVoice();
    act(() => setView({ isSoundBlocked: true }));
    fireEvent.click(screen.getByRole('button', { name: VOICE_LABELS.tapToHear }));
    expect(voice.turnOnSound).toHaveBeenCalled();
  });

  it('shows a calm line while the tutor has not said anything yet, and drops it for the first words', async () => {
    const { setView } = await openVoice();
    act(() => setView({ phase: 'connecting' }));
    expect(screen.getByText(VOICE_LABELS.connecting)).toBeTruthy();
    act(() => setView({ phase: 'live' }));
    expect(screen.getByText(VOICE_LABELS.connecting)).toBeTruthy();
    act(() => setView({ hasTutorStarted: true }));
    expect(screen.queryByText(VOICE_LABELS.connecting)).toBeNull();
  });

  it('does not say it is connecting between turns, when one turn has ended and the next has no words yet', async () => {
    const { setView } = await openVoice();
    act(() => setView({ hasTutorStarted: true, tutorHeard: ['Hello.'] }));
    act(() => setView({ tutorHeard: [], tutorComing: [], isThinking: true }));
    expect(screen.queryByText(VOICE_LABELS.connecting)).toBeNull();
  });

  describe('once the tutor has finished and the student has not acted', () => {
    const FINISHED = { tutorHeard: ['What', 'is', 'x?'], tutorComing: [], isTutorSpeaking: false };
    const openAndFinish = async () => {
      const opened = await openVoice();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      act(() => opened.setView(FINISHED));
      return opened;
    };
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    afterEach(() => vi.useRealTimers());

    it('shows a quiet prompt after about 8 s, and not before', async () => {
      await openAndFinish();
      wait(7900);
      expect(screen.queryByText(VOICE_LABELS.answerPrompt)).toBeNull();
      wait(200);
      expect(screen.getByText(VOICE_LABELS.answerPrompt)).toBeTruthy();
    });

    it('takes it down when the tutor speaks again, and starts the wait over after', async () => {
      const { setView } = await openAndFinish();
      wait(8100);
      act(() => setView({ tutorComing: ['And'], isTutorSpeaking: true }));
      expect(screen.queryByText(VOICE_LABELS.answerPrompt)).toBeNull();
      act(() => setView(FINISHED));
      expect(screen.queryByText(VOICE_LABELS.answerPrompt)).toBeNull();
      wait(8100);
      expect(screen.getByText(VOICE_LABELS.answerPrompt)).toBeTruthy();
    });

    it('starts over when the student says or types something', async () => {
      const { setView } = await openAndFinish();
      wait(7000);
      act(() => setView({ studentLines: [{ text: 'Hello', isFinal: true }] }));
      wait(7000);
      expect(screen.queryByText(VOICE_LABELS.answerPrompt)).toBeNull();
      wait(1100);
      expect(screen.getByText(VOICE_LABELS.answerPrompt)).toBeTruthy();
    });

    it('starts over while the student is writing a reply', async () => {
      await openAndFinish();
      wait(7000);
      fireEvent.change(getBox(), { target: { value: 'I think' } });
      wait(7000);
      expect(screen.queryByText(VOICE_LABELS.answerPrompt)).toBeNull();
    });

    it.each([
      ['the microphone is on', { mic: 'on' }],
      ['the tutor is thinking', { isThinking: true }],
      ['the room is dropping', { phase: 'reconnecting' }],
      ['the tutor has closed', { closedBecause: 'sessionLimit' }],
    ] as const)('stays away when %s', async (_name, view) => {
      const { setView } = await openAndFinish();
      act(() => setView(view));
      wait(9000);
      expect(screen.queryByText(VOICE_LABELS.answerPrompt)).toBeNull();
    });
  });

  it('tells the student a new tutor starts fresh, whichever way the room closed', () => {
    for (const note of [VOICE_LABELS.tutorLost, VOICE_LABELS.closedForQuiet]) expect(note).toContain('start fresh, without what was said so far');
  });

  it('warns before a quiet room closes, and the student can keep it open', async () => {
    const { voice, setView } = await openVoice();
    act(() => setView({ isQuietWarning: true }));
    expect(screen.getByText(VOICE_LABELS.quietWarning)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: VOICE_LABELS.stillHere }));
    expect(voice.sayStillHere).toHaveBeenCalled();
  });

  it.each([
    ['denied', VOICE_LABELS.micDenied],
    ['noDevice', VOICE_LABELS.micNoDevice],
    ['failed', VOICE_LABELS.micFailed],
  ] as const)('says truly why the microphone is off when it is %s', async (mic, note) => {
    const { setView } = await openVoice();
    act(() => setView({ mic }));
    expect(screen.getByText(note)).toBeTruthy();
  });
});
