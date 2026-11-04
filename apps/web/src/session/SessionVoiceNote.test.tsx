import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { REPLY_BOX_LABELS, SESSION_LABELS, VOICE_LABELS } from '../strings';
import { makeFakeVoice } from '../test/fakeVoice';
import { makeSession, stubSessionsApi } from '../test/sessionsApi';
import { startLiveVoice } from '../voice/liveVoice';

vi.mock('../auth/session', () => import('../test/signedInSession'));
vi.mock('../auth/useAccount', () => import('../test/activeAccount'));
vi.mock('../voice/liveVoice', () => ({ startLiveVoice: vi.fn() }));

const OPEN_ROOM = { access: { url: 'wss://room.test', roomName: 'session-a-session', token: 'room-token' }, unavailableBecause: null };
const CLOSED_NOTES = [
  ['sessionLimit', 'This session has reached its limit. Start a new session to carry on.'],
  ['dailyLimit', 'That is all your tutor time for today. Come back tomorrow. Your sessions are kept.'],
  ['broken', 'Your tutor has stopped working in this session. Start a new one to carry on.'],
] as const;

function renderOpenRoom(view: Parameters<typeof makeFakeVoice>[0]) {
  const voice = makeFakeVoice(view);
  vi.mocked(startLiveVoice).mockResolvedValue(voice);
  stubSessionsApi({ sessions: [makeSession({ durationSeconds: 65 })], liveRoom: OPEN_ROOM });
  window.history.replaceState(null, '', '/sessions/a-session');
  render(<App />);
  return voice;
}

async function sendReply(text: string) {
  const replyBox = await screen.findByRole('textbox', { name: REPLY_BOX_LABELS.label });
  fireEvent.change(replyBox, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: REPLY_BOX_LABELS.send }));
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a tutor that has closed', () => {
  it.each(CLOSED_NOTES)('says why for %s, over any other note', async (closedBecause, note) => {
    renderOpenRoom({ closedBecause, phase: 'reconnecting', mic: 'on' });

    await sendReply('Gravity, I think.');

    await screen.findByText(note);
    expect(screen.queryByText(VOICE_LABELS.reconnecting)).toBeNull();
    expect(screen.queryByText(VOICE_LABELS.micOn)).toBeNull();
  });

  it('stills the dot, even if the last words are still playing', async () => {
    renderOpenRoom({ closedBecause: 'broken', isTutorSpeaking: true, isThinking: true });

    await sendReply('Gravity, I think.');

    await screen.findByText(CLOSED_NOTES[2][1]);
    expect(screen.getByTestId('tutor-dot').dataset.lively).toBe('false');
  });

  it('keeps a reply on the screen and sends it nowhere, because no tutor is left to answer it', async () => {
    const voice = renderOpenRoom({ closedBecause: 'sessionLimit' });

    await sendReply('Gravity, I think.');

    await screen.findByText('Gravity, I think.');
    screen.getByText(SESSION_LABELS.replyNotSent);
    expect(voice.sendTyped).not.toHaveBeenCalled();
  });
});

describe('a tutor that is open', () => {
  it('keeps the dot lively while it speaks, and sends the reply', async () => {
    const voice = renderOpenRoom({ isTutorSpeaking: true });

    await sendReply('Gravity, I think.');

    await vi.waitFor(() => expect(voice.sendTyped).toHaveBeenCalledWith('Gravity, I think.'));
    await vi.waitFor(() => expect(screen.getByTestId('tutor-dot').dataset.lively).toBe('true'));
    expect(screen.queryByText(SESSION_LABELS.replyNotSent)).toBeNull();
  });
});
