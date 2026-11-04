import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/apiError';
import { LEGAL_PAGES, VOICE_LABELS } from '../strings';
import { StudentCaption, TutorCaption } from './Captions';
import type { LiveVoice, LiveVoiceView } from './liveVoice';
import { useLiveVoice } from './useLiveVoice';

const api = vi.hoisted(() => ({ post: vi.fn<(route: string, options: { params: { query: object } }) => Promise<unknown>>() }));
vi.mock('../api/client', () => ({ api }));

const BASE_VIEW: LiveVoiceView = { phase: 'live', mic: 'off', isSoundBlocked: false, isQuietWarning: false, isHeard: false, isTutorSpeaking: false, studentLines: [], tutorHeard: [], tutorComing: [] };

function makeFakeVoice(view: Partial<LiveVoiceView> = {}): LiveVoice {
  let current = { ...BASE_VIEW, ...view };
  const listeners = new Set<() => void>();
  const setMic = (isOn: boolean) => {
    current = { ...current, mic: isOn ? 'on' : 'off' };
    listeners.forEach((listener) => listener());
  };
  return {
    records: {} as LiveVoice['records'],
    player: {} as LiveVoice['player'],
    getView: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getBoardNow: () => ({ board: { elements: new Map(), focus: null, refusedSliders: [] }, atMs: 0 }),
    sendTyped: vi.fn(),
    toggleMic: vi.fn(async () => setMic(current.mic !== 'on')),
    sayStillHere: vi.fn(),
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
    expect(voice.getView().mic).toBe('off');
    await act(() => result.current.toggleTalk());
    expect(result.current.view?.mic).toBe('on');
    await act(() => result.current.toggleTalk());
    expect(result.current.view?.mic).toBe('off');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('takes a second press while the room opens as off, so a double press never leaves the microphone on', async () => {
    const voice = makeFakeVoice();
    let open: (opened: LiveVoice) => void = () => {};
    const start = vi.fn(() => new Promise<LiveVoice>((resolve) => { open = resolve; }));
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    let presses: Promise<void>[] = [];
    act(() => {
      presses = [result.current.toggleTalk(), result.current.toggleTalk()];
    });
    await act(async () => {
      open(voice);
      await Promise.all(presses);
    });
    expect(voice.getView().mic).toBe('off');
    expect(voice.toggleMic).not.toHaveBeenCalled();
  });

  it('shows the press at once while the room opens, so it cannot look like a press that missed', async () => {
    const voice = makeFakeVoice();
    let open: (opened: LiveVoice) => void = () => {};
    const start = vi.fn(() => new Promise<LiveVoice>((resolve) => { open = resolve; }));
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    let press: Promise<void> = Promise.resolve();
    act(() => {
      press = result.current.toggleTalk();
    });
    expect(result.current.isTalkOn).toBe(true);
    await act(async () => {
      open(voice);
      await press;
    });
    expect(result.current.view?.mic).toBe('on');
    expect(result.current.isTalkOn).toBe(true);
  });

  it('opens a new room with a new tutor when asked, and leaves the old one', async () => {
    const [first, second] = [makeFakeVoice(), makeFakeVoice()];
    const start = vi.fn<() => Promise<LiveVoice>>().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    await act(async () => void (await result.current.connect()));
    await act(() => result.current.openAgain());
    expect(first.close).toHaveBeenCalled();
    expect(result.current.voice).toBe(second);
    expect(start).toHaveBeenCalledTimes(2);
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

  describe('at the limit on starting tutors', () => {
    const TOO_MANY = new ApiError({ kind: 'rejected', status: 429, retryAfterSeconds: 360 });
    const startAsking = vi.fn(async ({ getAccess }: { getAccess(): Promise<unknown> }) => {
      if (!(await getAccess())) throw new Error('no room');
      return makeFakeVoice();
    }) as unknown as typeof import('./liveVoice').startLiveVoice;
    const asks = () => api.post.mock.calls.map(([, options]) => options.params.query);

    beforeEach(() => {
      api.post.mockReset();
    });

    it('says how long the wait truly is', async () => {
      api.post.mockRejectedValue(TOO_MANY);
      const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startAsking }));
      await act(async () => void (await result.current.connect()));
      expect(result.current.status).toBe('tooSoon');
      expect(result.current.waitSeconds).toBe(360);
      expect(VOICE_LABELS.tooSoon(360)).toContain('about 6 minutes');
      expect(VOICE_LABELS.tooSoon(30)).toContain('about 1 minute.');
    });

    it('never joins the dead room again when a typed reply follows, and starts over once the wait has passed', async () => {
      api.post.mockResolvedValueOnce({ url: 'u', token: 't' }).mockRejectedValueOnce(TOO_MANY).mockRejectedValueOnce(TOO_MANY).mockResolvedValue({ url: 'u', token: 't' });
      const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startAsking }));
      await act(async () => void (await result.current.connect()));
      await act(() => result.current.openAgain());
      expect(result.current.status).toBe('tooSoon');
      await act(async () => void (await result.current.sendTyped('Are you there?')));
      expect(result.current.status).toBe('tooSoon');
      await act(async () => void (await result.current.sendTyped('Are you there?')));
      expect(result.current.status).toBe('live');
      expect(asks()).toEqual([{}, { startOver: 'yes' }, { startOver: 'yes' }, { startOver: 'yes' }]);
    });

    it('stops asking to start over once a room has answered', async () => {
      api.post.mockResolvedValue({ url: 'u', token: 't' });
      const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startAsking }));
      await act(async () => void (await result.current.connect()));
      await act(() => result.current.openAgain());
      await act(() => result.current.openAgain());
      expect(asks()).toEqual([{}, { startOver: 'yes' }, { startOver: 'yes' }]);
    });
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
    expect(privacy).toContain('your IP address');
    expect(privacy).toContain("Meta's Muse Voice Transcribe receives your voice");
    expect(privacy).toContain('ElevenLabs receives your words too');
  });

  it('says raw audio is not stored, and does not claim the microphone is unused', () => {
    expect(privacy).toContain('We do not store your voice');
    expect(privacy).not.toContain('does not use your microphone');
  });
});
