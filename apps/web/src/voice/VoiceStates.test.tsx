import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { REPLY_BOX_LABELS, VOICE_LABELS } from '../strings';
import { makeSession, stubSessionsApi } from '../test/sessionsApi';
import type { LiveVoice, LiveVoiceView } from './liveVoice';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));

const startLiveVoice = vi.hoisted(() => vi.fn());
vi.mock('./liveVoice', async (importOriginal) => ({ ...(await importOriginal<typeof import('./liveVoice')>()), startLiveVoice }));

const BASE_VIEW: LiveVoiceView = { phase: 'live', mic: 'off', isRoomNoisy: false, isSoundBlocked: false, isQuietWarning: false, isHeard: false, isTutorSpeaking: false, studentLines: [], tutorHeard: [], tutorComing: [] };

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
    getBoardNow: () => ({ board: { elements: new Map(), focus: null }, atMs: 0 }),
    sendTyped: vi.fn(),
    toggleMic: vi.fn(async () => {}),
    isMicOn: () => false,
    setMic: vi.fn(async () => {}),
    endLine: vi.fn(),
    lowerTutor: vi.fn(),
    tellHoldStarted: vi.fn(),
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

const getBox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: REPLY_BOX_LABELS.label });

async function openVoice(first = makeVoice()) {
  startLiveVoice.mockResolvedValueOnce(first.voice);
  const session = makeSession();
  window.history.replaceState(null, '', `/sessions/${session.id}`);
  stubSessionsApi({ sessions: [session] });
  render(<App />);
  await waitFor(() => getBox());
  fireEvent.change(getBox(), { target: { value: 'Hello' } });
  fireEvent.keyDown(getBox(), { key: 'Enter' });
  await waitFor(() => expect(first.voice.sendTyped).toHaveBeenCalledWith('Hello'));
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
    expect(getBox().readOnly).toBe(true);
    voice.sendTyped.mockClear();
    fireEvent.keyDown(getBox(), { key: 'Enter' });
    expect(voice.sendTyped).not.toHaveBeenCalled();
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
    expect(getBox().readOnly).toBe(true);
    expect(screen.getByRole('button', { name: VOICE_LABELS.tryAgain })).toBeTruthy();
    expect(startLiveVoice).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(getBox(), { key: 'Enter' });
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
    await waitFor(() => expect(getBox().readOnly).toBe(false));
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
