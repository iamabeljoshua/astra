import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_PAGES, VOICE_LABELS } from '../strings';
import { makeFakeVoice } from '../test/fakeVoice';
import { stubSessionsApi } from '../test/sessionsApi';
import { StudentCaption, TutorCaption } from './Captions';
import type { LiveVoice, LiveVoiceOptions } from './liveVoice';
import { useLiveVoice } from './useLiveVoice';

vi.mock('../auth/session', () => import('../test/signedInSession'));

const ROOM_ACCESS = { url: 'wss://room.test', roomName: 'session-a-session', token: 'room-token' };
const OPEN_ROOM = { access: ROOM_ACCESS, unavailableBecause: null };

// The real start asks for the room beside its audio setup, and refuses to go on with no access.
async function startLikeThePage({ getAccess }: LiveVoiceOptions): Promise<LiveVoice> {
  if (!(await getAccess())) throw new Error('there is no room to join');
  return makeFakeVoice();
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
  beforeEach(() => stubSessionsApi({ liveRoom: OPEN_ROOM }));
  afterEach(() => vi.unstubAllGlobals());

  it('joins with the access the API gave', async () => {
    let access: unknown;
    const start = vi.fn(async ({ getAccess }: LiveVoiceOptions) => {
      access = await getAccess();
      return makeFakeVoice();
    });
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start }));
    await act(async () => void (await result.current.connect()));
    expect(access).toEqual(ROOM_ACCESS);
    expect(result.current.status).toBe('live');
  });

  it.each([
    ['notSetUp', 'unavailable'],
    ['dailyLimit', 'overLimit'],
  ] as const)('joins nothing when the API answers %s, says %s, and keeps the reply on the screen', async (unavailableBecause, status) => {
    stubSessionsApi({ liveRoom: { access: null, unavailableBecause } });
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startLikeThePage }));
    let wasSent = true;
    await act(async () => {
      wasSent = await result.current.sendTyped('Why?');
    });
    expect(wasSent).toBe(false);
    expect(result.current.status).toBe(status);
    expect(result.current.view).toBeNull();
  });

  it('asks the API again on the next try, so a room service that comes up is found', async () => {
    stubSessionsApi();
    const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startLikeThePage }));
    await act(async () => void (await result.current.sendTyped('Why?')));
    expect(result.current.status).toBe('unavailable');
    stubSessionsApi({ liveRoom: OPEN_ROOM });
    await act(async () => void (await result.current.sendTyped('Why?')));
    expect(result.current.status).toBe('live');
  });

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
    await act(() => result.current.openAgain('I am back.'));
    expect(second.sendOpening).toHaveBeenCalledWith('I am back.');
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
    const TOO_MANY = () => new Response(JSON.stringify({ statusCode: 429, message: 'This has been tried too many times.', retryAfterSeconds: 360 }), { status: 429 });
    const OPEN = () => new Response(JSON.stringify(OPEN_ROOM), { status: 200 });

    function stubRoomAnswers(...answers: (() => Response)[]) {
      const asks: (string | null)[] = [];
      vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
        asks.push(new URL(request.url).searchParams.get('startOver'));
        return (answers.length > 1 ? (answers.shift() as () => Response) : (answers[0] as () => Response))();
      }));
      return asks;
    }

    it('says how long the wait truly is', async () => {
      stubRoomAnswers(TOO_MANY);
      const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startLikeThePage }));
      await act(async () => void (await result.current.connect()));
      expect(result.current.status).toBe('tooSoon');
      expect(result.current.waitSeconds).toBe(360);
      expect(VOICE_LABELS.tooSoon(360)).toContain('about 6 minutes');
      expect(VOICE_LABELS.tooSoon(30)).toContain('about 1 minute.');
    });

    it('never joins the dead room again when a typed reply follows, and starts over once the wait has passed', async () => {
      const asks = stubRoomAnswers(OPEN, TOO_MANY, TOO_MANY, OPEN);
      const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startLikeThePage }));
      await act(async () => void (await result.current.connect()));
      await act(() => result.current.openAgain('I am back.'));
      expect(result.current.status).toBe('tooSoon');
      await act(async () => void (await result.current.sendTyped('Are you there?')));
      expect(result.current.status).toBe('tooSoon');
      await act(async () => void (await result.current.sendTyped('Are you there?')));
      expect(result.current.status).toBe('live');
      expect(asks).toEqual([null, 'yes', 'yes', 'yes']);
    });

    it('stops asking to start over once a room has answered', async () => {
      const asks = stubRoomAnswers(OPEN);
      const { result } = renderHook(() => useLiveVoice({ sessionId: 'a-session', start: startLikeThePage }));
      await act(async () => void (await result.current.connect()));
      await act(() => result.current.openAgain('I am back.'));
      await act(() => result.current.openAgain('I am back.'));
      expect(asks).toEqual([null, 'yes', 'yes']);
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
    expect(privacy).toContain('your IP address');
    expect(privacy).toContain("Meta's Muse Voice Transcribe receives your voice");
    expect(privacy).toContain("ElevenLabs receives the tutor's words");
    expect(privacy).toContain('receives what you say and type in a session, the tutor\'s earlier words, and your level, interests, and goal');
    expect(privacy).toContain('We do not send it your name, your date of birth, your email address, or an account ID');
  });

  it('says LiveKit carries voice and messages and does not receive the level, interests, or goal', () => {
    expect(privacy).toContain('LiveKit Cloud carries your voice');
    expect(privacy).toContain('We do not send LiveKit your name, your date of birth, your email address, your level, your interests, or your goal');
  });

  it('says a total of what the tutor cost is stored per day, with no words in it', () => {
    expect(privacy).toContain('A running total of what the tutor cost for you each day');
  });

  it('says plainly that the IP address reaches LiveKit as soon as a session opens, before any press', () => {
    expect(privacy).toContain('When a session opens, your browser joins LiveKit Cloud, even before you press Talk, so LiveKit receives your IP address');
  });

  it('says raw audio is not stored, and does not claim the microphone is unused', () => {
    expect(privacy).toContain('We do not store your voice');
    expect(privacy).not.toContain('does not use your microphone');
  });
});
