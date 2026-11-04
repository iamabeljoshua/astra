import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { BOARD_WORK_LABELS, SESSION_LABELS, VOICE_LABELS } from '../strings';
import { makeFakeVoice } from '../test/fakeVoice';
import { makeSession, stubSessionsApi } from '../test/sessionsApi';
import { startLiveVoice } from '../voice/liveVoice';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));
vi.mock('../voice/liveVoice', async (importOriginal) => ({ ...(await importOriginal<typeof import('../voice/liveVoice')>()), startLiveVoice: vi.fn() }));

const OPEN_ROOM = { access: { url: 'wss://room.test', roomName: 'session-a-session', isTutorThere: false, token: 'room-token' }, unavailableBecause: null };
const CLOSED_NOTES = [
  ['sessionLimit', VOICE_LABELS.sessionLimit],
  ['dailyLimit', VOICE_LABELS.dailyLimit],
  ['broken', VOICE_LABELS.broken],
] as const;

function renderOpenRoom(view: Parameters<typeof makeFakeVoice>[0]) {
  const voice = makeFakeVoice(view);
  vi.mocked(startLiveVoice).mockResolvedValue(voice);
  stubSessionsApi({ sessions: [makeSession({ durationSeconds: 65 })], liveRoom: OPEN_ROOM });
  window.history.replaceState(null, '', '/sessions/a-session');
  render(<App />);
  return voice;
}

const findEntry = () => screen.findByRole<HTMLInputElement>('textbox', { name: BOARD_WORK_LABELS.entry });

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion'), addEventListener: () => undefined, removeEventListener: () => undefined }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a tutor that has closed', () => {
  it.each(CLOSED_NOTES)('says why for %s, over any other note', async (closedBecause, note) => {
    renderOpenRoom({ closedBecause, phase: 'reconnecting', mic: 'on' });

    await screen.findByText(note);
    expect(screen.queryByText(VOICE_LABELS.reconnecting)).toBeNull();
    expect(screen.queryByText(VOICE_LABELS.micOn)).toBeNull();
  });

  it('stills the dot, even if the last words are still playing', async () => {
    renderOpenRoom({ closedBecause: 'broken', isTutorSpeaking: true, isThinking: true });

    await screen.findByText(CLOSED_NOTES[2][1]);
    expect(screen.getByTestId('tutor-dot').dataset.lively).toBe('false');
  });

  it('closes the board\'s line and sends nothing, because no tutor is left to answer it', async () => {
    const voice = renderOpenRoom({ closedBecause: 'sessionLimit' });

    const entry = await findEntry();
    expect(entry.disabled).toBe(true);
    fireEvent.change(entry, { target: { value: 'Gravity, I think.' } });
    fireEvent.submit(entry);

    expect(voice.sendWork).not.toHaveBeenCalled();
  });
});

describe('a tutor that is open', () => {
  it('keeps the dot lively while it speaks, and sends the reply', async () => {
    const voice = renderOpenRoom({ isTutorSpeaking: true });

    const entry = await findEntry();
    fireEvent.change(entry, { target: { value: 'Gravity, I think.' } });
    fireEvent.submit(entry);

    await vi.waitFor(() => expect(voice.sendWork).toHaveBeenCalledWith(expect.objectContaining({ way: 'write', text: 'Gravity, I think.' }), 0));
    await vi.waitFor(() => expect(screen.getByTestId('tutor-dot').dataset.lively).toBe('true'));
    expect(screen.queryByText(SESSION_LABELS.replyNotSent)).toBeNull();
  });
});
