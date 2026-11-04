import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_PAGES } from '../strings';
import { makeFakeVoice } from '../test/fakeVoice';
import { stubSessionsApi } from '../test/sessionsApi';
import { StudentCaption, TutorCaption } from './Captions';
import type { LiveVoice } from './liveVoice';
import { useLiveVoice } from './useLiveVoice';

vi.mock('../auth/session', () => import('../test/signedInSession'));

const ROOM_ACCESS = { url: 'wss://room.test', roomName: 'session-a-session', token: 'room-token' };
const OPEN_ROOM = { access: ROOM_ACCESS, unavailableBecause: null };
describe('the captions', () => {
  it('highlights the word playing now, and shows what is coming apart from what was heard', () => {
    render(<TutorCaption heard={['The', 'ball', 'leaves']} coming={['your', 'hand.']} />);
    expect(screen.getByTestId('current-word').textContent).toBe('leaves');
    expect(screen.getByTestId('tutor-caption').textContent).toBe('The ball leaves your hand.');
  });

  it('shows the student their own words, with an interim line beside the last final', () => {
    render(<StudentCaption lines={[{ text: 'Wait.', isFinal: true }, { text: 'why does', isFinal: false }]} />);
    expect(screen.getByTestId('student-caption').textContent).toContain('Wait. why does');
  });

  it('shows nothing before the student has spoken', () => {
    const { container } = render(<StudentCaption lines={[]} />);
    expect(container.textContent).toBe('');
  });
});

describe('useLiveVoice', () => {
  beforeEach(() => stubSessionsApi({ liveRoom: OPEN_ROOM }));
  afterEach(() => vi.unstubAllGlobals());

  it('joins with the access the API gave', async () => {
    const start = vi.fn(async () => makeFakeVoice());
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    await act(async () => void (await result.current.connect()));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ access: ROOM_ACCESS }));
    expect(result.current.status).toBe('live');
  });

  it.each([
    ['notSetUp', 'unavailable'],
    ['dailyLimit', 'overLimit'],
  ] as const)('starts nothing when the API answers %s, says %s, and keeps the reply on the screen', async (unavailableBecause, status) => {
    stubSessionsApi({ liveRoom: { access: null, unavailableBecause } });
    const start = vi.fn(async () => makeFakeVoice());
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    let wasSent = true;
    await act(async () => {
      wasSent = await result.current.sendTyped('Why?');
    });
    expect(start).not.toHaveBeenCalled();
    expect(wasSent).toBe(false);
    expect(result.current.status).toBe(status);
    expect(result.current.view).toBeNull();
  });

  it('asks the API again on the next try, so a room service that comes up is found', async () => {
    stubSessionsApi();
    const start = vi.fn(async () => makeFakeVoice());
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    await act(async () => void (await result.current.sendTyped('Why?')));
    expect(start).not.toHaveBeenCalled();
    stubSessionsApi({ liveRoom: OPEN_ROOM });
    await act(async () => void (await result.current.sendTyped('Why?')));
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('live');
  });

  it('asks for the microphone only when the student presses Talk, and a typed reply opens the room with it off', async () => {
    const voice = makeFakeVoice();
    const start = vi.fn(async () => voice);
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    await act(async () => void (await result.current.sendTyped('Why?')));
    expect(voice.sendTyped).toHaveBeenCalledWith('Why?');
    expect(voice.setMicOn).not.toHaveBeenCalled();
    await act(() => result.current.toggleTalk());
    expect(voice.setMicOn).toHaveBeenCalledWith(true);
    expect(result.current.view?.mic).toBe('on');
    await act(() => result.current.toggleTalk());
    expect(voice.setMicOn).toHaveBeenLastCalledWith(false);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('says the tutor is unavailable when the room will not open, and lets the student try again', async () => {
    const voice = makeFakeVoice();
    const start = vi.fn<() => Promise<LiveVoice>>().mockRejectedValueOnce(new Error('503')).mockResolvedValue(voice);
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    await act(async () => void (await result.current.sendTyped('Why?')));
    expect(result.current.status).toBe('unavailable');
    await act(async () => void (await result.current.sendTyped('Why?')));
    expect(result.current.status).toBe('live');
  });

  it('closes the room when the screen goes, so a closed session leaves nothing running', async () => {
    const voice = makeFakeVoice();
    const { result, unmount } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: async () => voice }));
    await act(async () => void (await result.current.connect()));
    unmount();
    await act(async () => {});
    expect(voice.close).toHaveBeenCalled();
  });
});

const VENDOR_KEY_NAMES = /ELEVENLABS_API_KEY|META_API_KEY|LIVEKIT_API_KEY|LIVEKIT_API_SECRET|ANTHROPIC_API_KEY|ASTRA_AGENT_KEY/;

describe('vendor keys', () => {
  it('appear nowhere in the browser code, which only ever holds a room token from our API', () => {
    const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const named = Object.entries(sources).filter(([path, source]) => !path.includes('.test.') && VENDOR_KEY_NAMES.test(source));
    expect(named.map(([path]) => path)).toEqual([]);
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });
});

describe('the Privacy Policy on voice', () => {
  const privacy = LEGAL_PAGES.privacy.sections.flatMap((section) => section.today).join(' ');

  it('names everyone who receives a student voice or words, in plain words', () => {
    expect(privacy).toContain('LiveKit Cloud carries your voice');
    expect(privacy).toContain("Meta's Muse Voice Transcribe receives your voice");
    expect(privacy).toContain("ElevenLabs receives the tutor's words");
    expect(privacy).toContain('receives what you say and type in a session, including lines on the board, a line you paused on without sending, and a picture of anything you write with the pen, the tutor\'s earlier words, and your level, interests, and goal');
    expect(privacy).toContain('We do not send it your name, your date of birth, your email address, or an account ID');
  });

  it('says LiveKit carries voice and messages and does not receive the level, interests, or goal', () => {
    expect(privacy).toContain('LiveKit Cloud carries your voice');
    expect(privacy).toContain('We do not send LiveKit your name, your date of birth, your email address, your level, your interests, or your goal');
  });

  it('says a total of what the tutor cost is stored per day, with no words in it', () => {
    expect(privacy).toContain('A running total of what the tutor cost for you each day');
  });

  it('says raw audio is not stored, and does not claim the microphone is unused', () => {
    expect(privacy).toContain('We do not store your voice');
    expect(privacy).not.toContain('does not use your microphone');
  });
});
