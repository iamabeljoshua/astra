import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LEGAL_PAGES } from '../strings';
import { StudentCaption, TutorCaption } from './Captions';
import type { LiveVoice, LiveVoiceView } from './liveVoice';
import { useLiveVoice } from './useLiveVoice';

const BASE_VIEW: LiveVoiceView = { phase: 'live', mic: 'off', isSoundBlocked: false, isHeard: false, isThinking: false, isTutorSpeaking: false, studentLines: [], tutorHeard: [], tutorComing: [] };

function makeFakeVoice(view: Partial<LiveVoiceView> = {}): LiveVoice {
  let current = { ...BASE_VIEW, ...view };
  const listeners = new Set<() => void>();
  return {
    records: {} as LiveVoice['records'],
    player: {} as LiveVoice['player'],
    getView: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getBoardNow: () => ({ board: { elements: new Map(), focus: null }, atMs: 0 }),
    sendTyped: vi.fn(),
    setMicOn: vi.fn(async (isOn: boolean) => {
      current = { ...current, mic: isOn ? 'on' : 'off' };
      listeners.forEach((listener) => listener());
    }),
    turnOnSound: vi.fn(),
    mark: vi.fn(),
    close: vi.fn(async () => {}),
  };
}

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

const VENDOR_KEY_NAMES = /ELEVENLABS_API_KEY|META_API_KEY|LIVEKIT_API_KEY|LIVEKIT_API_SECRET|ANTHROPIC_API_KEY/;

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
    expect(privacy).toContain('receives what you say and type in a session, the tutor\'s earlier words, and your level, interests, and goal');
    expect(privacy).toContain('It does not receive your name, your date of birth, your email address, or an account ID');
  });

  it('says raw audio is not stored, and does not claim the microphone is unused', () => {
    expect(privacy).toContain('We do not store your voice');
    expect(privacy).not.toContain('does not use your microphone');
  });
});
