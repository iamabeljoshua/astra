import { initializeLogger } from '@livekit/agents';
import type { AgentMessage, BrowserMessage, TurnId } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createLiveSession, VOICE_STALL_MS } from '../src/live/live-session.ts';
import { createTakePicker, loadTakes } from '../src/live/reactions.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { type FakeReply, makeFakeTutorModel } from '../src/providers/fake-model.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import type { TutorModelRequest } from '../src/providers/types.ts';
import { createTutorBrain, TUTOR_TIMEOUTS, type TurnSummary } from '../src/tutor/brain.ts';
import { TURN_TIMINGS } from '../src/live/turn-rule.ts';

initializeLogger({ pretty: false, level: 'silent' });

// These run a real session on real timers, so a busy machine takes longer, and a wait for the thing to happen does not change what is checked.
vi.setConfig({ testTimeout: 40_000 });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (isDone: () => boolean, limitMs = 30_000) => {
  for (let waited = 0; waited < limitMs && !isDone(); waited += 10) await delay(10);
};
const STAMP = { clockId: 'test', browserMs: 0, startedMsAgo: 0 };
const typed = (text: string): BrowserMessage => ({ type: 'typed', text, ...STAMP });
const QUICK = { ...TUTOR_TIMEOUTS, stillWorkingMs: 60, firstTextMs: 200, betweenTextMs: 200 };

function setup(getReply: (request: TutorModelRequest, attempt: number) => FakeReply, timeouts = QUICK) {
  const summaries: TurnSummary[] = [];
  const notes: { name: string; fields: Record<string, unknown>; atMs: number }[] = [];
  const messages: AgentMessage[] = [];
  const model = makeFakeTutorModel(getReply);
  const allTakes = loadTakes();
  const trace = (name: string, fields: Record<string, unknown> = {}) => notes.push({ name, fields, atMs: performance.now() });
  const session = createLiveSession({
    messenger: { send: (message) => messages.push(message), sendOnBothChannels: (message) => messages.push(message) },
    line: createVoiceLine({ sampleRate: 24000, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} }),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(),
    tutor: createTutorBrain({ model, trace, timeouts, onTurnEnd: (summary) => summaries.push(summary) }),
    takes: createTakePicker(allTakes),
    allTakes,
    setTurnCap: () => {},
    trace,
  });
  const find = (name: string, kind?: string) => notes.find((note) => note.name === name && (kind === undefined || note.fields.kind === kind));
  return { session, notes, messages, model, find, summaries };
}

describe('the brain in a live session', () => {
  it('reacts from code first, with no model in the path, and the model speaks after', async () => {
    const { session, find, messages } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 300 }));
    const sentAtMs = performance.now();
    session.onBrowser(typed('Why does it fall?'));
    await until(() => find('firstFrameCaptured', 'reply') !== undefined);
    expect(messages).toContainEqual({ type: 'heard' });
    expect((find('firstFrameCaptured', 'greeting')?.atMs as number) - sentAtMs).toBeLessThan(200);
    expect(find('firstFrameCaptured', 'reply')?.atMs as number).toBeGreaterThan(find('firstFrameCaptured', 'greeting')?.atMs as number);
    await session.close();
  });

  it('says it is thinking until the first beat, so the dot explains the quiet', async () => {
    const { session, messages } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 50 }));
    session.onBrowser(typed('Why does it fall?'));
    await until(() => messages.filter((message) => message.type === 'thinking').length === 2);
    const thinking = messages.filter((message) => message.type === 'thinking');
    expect(thinking.map((message) => message.isThinking)).toEqual([true, false]);
    await session.close();
  });

  it('never reads a slow model as a failed voice', async () => {
    const { session, notes, model } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 10_000 }));
    session.onBrowser(typed('Why does it fall?'));
    await until(() => model.requests.length > 1);
    expect(notes.map((note) => note.name)).not.toContain('voiceFailed');
    expect(model.requests.length).toBeGreaterThan(1);
    await session.close();
  });

  it('never reads a model that stalls between beats as a failed voice', async () => {
    const { session, notes } = setup(() => ({ pieces: ['Okay, one two. ', 'And then more.'], stall: { beforePiece: 1, ms: 10_000 } }), { ...QUICK, betweenTextMs: 10_000 });
    session.onBrowser(typed('Why does it fall?'));
    await delay(VOICE_STALL_MS + 1500);
    expect(notes.map((note) => note.name)).not.toContain('voiceFailed');
    await session.close();
  });

  it('stops the model when a new message arrives, spends nothing more on it, and answers that instead', async () => {
    const { session, model, messages } = setup(() => ({ pieces: Array.from({ length: 40 }, (_, index) => `word${index} `), msPerPiece: 15 }));
    session.onBrowser(typed('First question'));
    await delay(200);
    session.onBrowser(typed('Actually, a second one'));
    await until(() => model.requests.length === 2 && model.aborted.streams === 1);
    expect(model.aborted.streams).toBe(1);
    expect(model.aborted.piecesNotSent).toBeGreaterThan(20);
    expect(model.requests).toHaveLength(2);
    expect(messages.filter((message) => message.type === 'heard')).toHaveLength(2);
    await session.close();
  });

  it('passes what played to the brain, so the next turn knows what was heard', async () => {
    const { session, model, messages } = setup(() => ({ pieces: ['Okay, one two three four.'] }));
    session.onBrowser(typed('count'));
    await until(() => messages.filter((message) => message.type === 'turnStarted').length === 2);
    const turnId = (messages.findLast((message) => message.type === 'turnStarted') as { turnId: TurnId }).turnId;
    session.onBrowser({ type: 'played', turnId, beatId: 't1-b0' as never, wordStartsMs: [0, 280], durationMs: 560, playedWords: 2, firedCueMs: [], ending: 'interrupted', frozen: [], ...STAMP });
    session.onBrowser(typed('wait'));
    await until(() => model.requests.length === 2);
    const last = model.requests.at(-1)?.turns.at(-1);
    expect(last && 'text' in last ? (JSON.parse(last.text) as { cut: { heard: string } }).cut.heard : null).toBe('Okay, one');
    await session.close();
  });
});

const SLOW_THEN_QUICK = (_request: TutorModelRequest, attempt: number, firstAttempts = 1): FakeReply =>
  attempt <= firstAttempts ? { pieces: Array.from({ length: 12 }, (_, index) => `Thought ${index} here. `), msPerPiece: 500 } : { pieces: ['Okay, sure thing. What next?'] };

const getUsers = (request: TutorModelRequest | undefined) => (request?.turns ?? []).flatMap((turn) => (turn.role === 'user' ? [turn.text] : []));
const getSystemNotes = (request: TutorModelRequest | undefined) => (request?.turns ?? []).flatMap((turn) => (turn.role === 'system' ? [turn.text] : []));

const speakOverTheTutor = async (session: ReturnType<typeof setup>['session'], text: string) => {
  session.onEars({ type: 'voiceStarted' });
  await delay(TURN_TIMINGS.wordlessStopMs + 700);
  session.onEars({ type: 'words', text, isFinal: true });
  session.onEars({ type: 'voiceEnded' });
  session.onEars({ type: 'turnDecided', text });
};

describe('a ring the board could not draw', () => {
  it('reaches the next request as a note', async () => {
    const { session, model, summaries } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Okay, ', '{"kind":"writeMath","id":"steps","tex":"x = 1"}', 'see this ', '{"kind":"highlight","id":"ring","target":"steps","tex":"x"}', 'letter here.'] } : { pieces: ['Got it.'] }));
    session.onBrowser(typed('show me'));
    await until(() => summaries.length === 1);
    session.onBrowser({ type: 'markNotDrawn', markId: 'ring', ...STAMP });
    await delay(10);
    session.onBrowser(typed('where?'));
    await until(() => model.requests.length === 2);
    expect(getSystemNotes(model.requests.at(-1)).join()).toContain('mark_not_drawn');
    await session.close();
  });
});

describe('hostile data messages', () => {
  const PLAYED = { wordStartsMs: [0], durationMs: 100, playedWords: 1, firedCueMs: [], ending: 'interrupted' as const, frozen: [], ...STAMP };

  it('starts few replies from 150 forged typed lines in a burst, and loses no words', async () => {
    const { session, model, messages } = setup(() => ({ pieces: ['Okay, here we go.'] }));
    for (let index = 0; index < 150; index += 1) session.onBrowser(typed(`line ${index}`));
    await delay(200);
    expect(model.requests.length).toBeLessThanOrEqual(3);
    expect(messages.filter((message) => message.type === 'heard').length).toBeLessThanOrEqual(3);
    await until(() => JSON.stringify(model.requests.at(-1)?.turns).includes('line 149'));
    expect(JSON.stringify(model.requests.at(-1)?.turns)).toContain('line 149');
    await session.close();
  });

  it('keeps a loop of forged reports from cutting and resuming the voice again and again', async () => {
    const { session, notes, messages } = setup(() => ({ pieces: ['Okay, one two. ', 'And then more.'], stall: { beforePiece: 1, ms: 5000 } }), { ...QUICK, betweenTextMs: 8000 });
    session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP });
    session.onBrowser(typed('count'));
    await delay(400);
    for (let index = 0; index < 3; index += 1) {
      const turnId = (messages.filter((message) => message.type === 'turnStarted').at(-1) as { turnId: TurnId }).turnId;
      session.onBrowser({ type: 'played', turnId, beatId: 't1-b0' as never, ...PLAYED });
      await delay(1100);
    }
    expect(notes.filter((note) => note.name === 'browserFroze')).toHaveLength(1);
    await session.close();
  });

  it('drops a flood of other messages, so the log stays bounded', () => {
    const { session, notes } = setup(() => ({ pieces: ['Okay.'] }));
    for (let index = 0; index < 5000; index += 1) session.onBrowser({ type: 'acted', action: { kind: 'stroke', elementId: 'x', points: [] } as never, ...STAMP });
    expect(session.getLog().length).toBeLessThan(1000);
    expect(notes.filter((note) => note.name === 'messagesDropped').length).toBeGreaterThan(0);
    void session.close();
  });
});

describe('a beat still on its way when a cut keeps the thought', () => {
  it('is said when the tutor carries on', async () => {
    const { session, messages } = setup(() => ({ pieces: ['Alpha beta. ', 'Delta now.'], stall: { beforePiece: 1, ms: 3500 } }), { ...QUICK, betweenTextMs: 6000 });
    session.onBrowser(typed('count'));
    await delay(400);
    session.onEars({ type: 'voiceStarted' });
    await delay(TURN_TIMINGS.wordlessStopMs + 100);
    session.onEars({ type: 'voiceEnded' });
    const getSpoken = () => messages.flatMap((message) => (message.type === 'words' ? message.words.map((word) => word.text) : [])).join(' ');
    await until(() => getSpoken().includes('Delta'));
    expect(getSpoken()).toContain('Delta');
    await session.close();
  });
});

describe('a tutor that has closed', () => {
  it('says why once, tells the page, and plays no reaction with nothing after it', async () => {
    const messages: AgentMessage[] = [];
    const model = makeFakeTutorModel(() => ({ pieces: ['Okay, here we go.'] }));
    const notes: string[] = [];
    const allTakes = loadTakes();
    const trace = (name: string) => notes.push(name);
    const session = createLiveSession({
      messenger: { send: (message) => messages.push(message), sendOnBothChannels: (message) => messages.push(message) },
      line: createVoiceLine({ sampleRate: 24000, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} }),
      voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts(),
      tutor: createTutorBrain({ model, trace, timeouts: QUICK, getSpendLimit: () => 'dailyLimit' }),
      takes: createTakePicker(allTakes),
      allTakes,
      setTurnCap: () => {},
      trace,
    });
    session.onBrowser(typed('one'));
    await until(() => messages.some((message) => message.type === 'tutorClosed'));
    await until(() => notes.filter((note) => note === 'turnFinished').length >= 1);
    expect(messages).toContainEqual({ type: 'tutorClosed', reason: 'dailyLimit' });
    const turnsBefore = messages.filter((message) => message.type === 'turnStarted').length;
    session.onBrowser(typed('two'));
    await until(() => messages.filter((message) => message.type === 'turnStarted').length > turnsBefore);
    await delay(100);
    expect(model.requests).toHaveLength(0);
    expect(messages.filter((message) => message.type === 'turnStarted').length).toBe(turnsBefore + 1);
    await session.close();
  });
});

describe('an interrupted request', () => {
  const BETWEEN = { ...QUICK, betweenTextMs: 5000 };

  it('stops when the student talks over the tutor while the model writes, and the next request keeps the question', async () => {
    const { session, model, summaries } = setup((request, attempt) => SLOW_THEN_QUICK(request, attempt), BETWEEN);
    session.onBrowser(typed('FIRST'));
    await delay(400);
    await speakOverTheTutor(session, 'SECOND wait a second please');
    await until(() => summaries.length === 2);
    expect(model.aborted.streams).toBe(1);
    expect(summaries.map((summary) => summary.studentText)).toEqual(['FIRST', 'SECOND wait a second please']);
    expect(summaries[0]?.endedAs).toBe('aborted');
    expect(getUsers(model.requests.at(-1))).toEqual(['FIRST', 'SECOND wait a second please']);
    expect(getSystemNotes(model.requests.at(-1)).join()).toContain('"cut"');
    await session.close();
  });

  it('does the same on a later turn, when no greeting holds the line', async () => {
    const { session, model, summaries } = setup((request, attempt) => (attempt === 1 ? { pieces: ['Okay, sure thing. What next?'] } : SLOW_THEN_QUICK(request, attempt, 2)), BETWEEN);
    session.onBrowser(typed('ZERO'));
    await until(() => summaries.length === 1);
    await delay(100);
    session.onBrowser(typed('FIRST'));
    await delay(400);
    await speakOverTheTutor(session, 'SECOND wait a second please');
    await until(() => summaries.length === 3);
    expect(model.aborted.streams).toBe(1);
    expect(summaries.map((summary) => summary.studentText)).toEqual(['ZERO', 'FIRST', 'SECOND wait a second please']);
    expect(getUsers(model.requests.at(-1))).toEqual(['ZERO', 'FIRST', 'SECOND wait a second please']);
    await session.close();
  });

  it('stops when the link is lost mid reply and the student then types', async () => {
    const { session, model, summaries } = setup((request, attempt) => SLOW_THEN_QUICK(request, attempt), BETWEEN);
    session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP });
    session.onBrowser(typed('FIRST'));
    await delay(400);
    session.onBrowser({ type: 'audioState', isRunning: false, ...STAMP });
    await delay(600);
    session.onBrowser(typed('SECOND'));
    await until(() => model.requests.length === 2);
    expect(model.aborted.streams).toBe(1);
    expect(summaries[0]?.studentText).toBe('FIRST');
    expect(getUsers(model.requests.at(-1))).toEqual(['FIRST', 'SECOND']);
    expect(getSystemNotes(model.requests.at(-1)).join()).toContain('"cut"');
    await session.close();
  });

  it('keeps a flood of typed messages to a request every two seconds', async () => {
    const { session, model } = setup(() => ({ pieces: ['Okay, here we go.'] }));
    for (let index = 0; index < 30; index += 1) {
      session.onBrowser(typed(`message ${index}`));
      await delay(10);
    }
    await delay(100);
    expect(model.requests.length).toBeLessThanOrEqual(3);
    await session.close();
  });

  it('finishes and charges a turn when the room closes while the model writes', async () => {
    const { session, model, summaries } = setup((request, attempt) => SLOW_THEN_QUICK(request, attempt), BETWEEN);
    session.onBrowser(typed('FIRST'));
    await delay(400);
    await session.close();
    await until(() => summaries.length === 1);
    expect(model.aborted.streams).toBe(1);
    expect(summaries).toHaveLength(1);
  });
});

describe('a reply in short stretches', () => {
  const FIRST = 'Okay, plants make food from light, water and air.';
  const SECOND = 'The leaf is where all of it happens every day.';
  const spokenWords = (messages: readonly AgentMessage[]) => messages.flatMap((message) => (message.type === 'words' ? message.words.map((word) => word.text) : [])).join(' ');
  const replyTurns = (notes: ReturnType<typeof setup>['notes']) => notes.filter((note) => note.name === 'turnStarted' && note.fields.kind === 'reply');
  const firstStretchDone = (notes: ReturnType<typeof setup>['notes']) => until(() => notes.some((note) => note.name === 'turnFinished' && note.fields.kind === 'reply'));

  it('speaks each stretch as its own turn, with a breath the line can show', async () => {
    const { session, notes, messages } = setup(() => ({ pieces: [`${FIRST}\n${SECOND}`] }));
    session.onBrowser(typed('what is photosynthesis'));
    await firstStretchDone(notes);
    const stretchEndedAtMs = performance.now();
    await until(() => replyTurns(notes).length === 2);
    expect(replyTurns(notes)).toHaveLength(2);
    expect((replyTurns(notes)[1]?.atMs as number) - stretchEndedAtMs).toBeGreaterThanOrEqual(200);
    await until(() => spokenWords(messages).includes('leaf'));
    expect(spokenWords(messages)).toContain('leaf');
    await session.close();
  });

  it('keeps a log row for the first beat of a later stretch, because the log refuses what it does not know', async () => {
    const { session, notes, messages } = setup(() => ({ pieces: [`${FIRST}\n${SECOND}`] }));
    session.onBrowser(typed('what is photosynthesis'));
    await until(() => replyTurns(notes).length === 2 && spokenWords(messages).includes('leaf'));
    const turnId = (messages.findLast((message) => message.type === 'turnStarted') as { turnId: TurnId }).turnId;
    const beatId = (messages.findLast((message) => message.type === 'words') as unknown as { beatId: string }).beatId;
    session.onBrowser({ type: 'played', turnId, beatId: beatId as never, wordStartsMs: [0], durationMs: 100, playedWords: 1, firedCueMs: [], ending: 'interrupted', frozen: [], ...STAMP });
    expect(notes.filter((note) => note.name === 'reportRefused').map((note) => note.fields.problem)).toEqual([]);
    expect(session.getLog().some((event) => event.kind === 'beatPlayed' && event.beat.id === beatId)).toBe(true);
    await session.close();
  });

  it('lets a typed message in the breath replace the next stretch, which the next request knows was not heard', async () => {
    const { session, notes, messages, model } = setup(() => ({ pieces: [`${FIRST}\n${SECOND}`] }));
    session.onBrowser(typed('what is photosynthesis'));
    await firstStretchDone(notes);
    session.onBrowser(typed('wait, what about roots'));
    await until(() => model.requests.length === 2 && messages.some((message) => message.type === 'words'));
    expect(model.requests).toHaveLength(2);
    expect(JSON.stringify(model.requests[1]?.turns.filter((turn) => turn.role === 'system'))).toMatch(/not_heard[^}]*leaf/);
    expect(messages.filter((message) => message.type === 'words').length).toBeGreaterThan(0);
    await session.close();
  });

  it('holds the next stretch while the student is talking, and carries on when it was only a noise', async () => {
    const { session, notes } = setup(() => ({ pieces: [`${FIRST}\n${SECOND}`] }));
    session.onBrowser(typed('what is photosynthesis'));
    await firstStretchDone(notes);
    session.onEars({ type: 'voiceStarted' });
    await delay(700);
    expect(replyTurns(notes)).toHaveLength(1);
    session.onEars({ type: 'voiceEnded' });
    await until(() => replyTurns(notes).length === 2);
    expect(replyTurns(notes)).toHaveLength(2);
    await session.close();
  });

  describe('with a student jumping in', () => {
    const ONE = 'Plants make their food from light and air.';
    const TWO = 'The leaf is where all of it happens daily.';
    const THREE = 'Roots pull the water up from the soil below.';
    const THREE_STRETCHES = { pieces: [`${ONE}\n`, `${TWO}\n`, `${THREE}\n`] };
    const THEN_SHORT = (_request: TutorModelRequest, attempt: number): FakeReply => (attempt === 1 ? THREE_STRETCHES : { pieces: ['Okay, roots then.'] });
    const JUMP_IN = 'wait, what about the roots';
    const getCut = (request: TutorModelRequest | undefined) => getSystemNotes(request).map((note) => JSON.parse(note) as { cut?: { heard: string; not_heard: string } }).find((note) => note.cut)?.cut;
    const lastAssistant = (request: TutorModelRequest | undefined) => (request?.turns ?? []).flatMap((turn) => (turn.role === 'assistant' ? [turn.text] : [])).at(-1);
    const reportHeard = (session: ReturnType<typeof setup>['session'], messages: readonly AgentMessage[], beatId: string, playedWords: number, ending: 'finished' | 'interrupted') => {
      const turnId = (messages.findLast((message) => message.type === 'turnStarted') as { turnId: TurnId }).turnId;
      session.onBrowser({ type: 'played', turnId, beatId: beatId as never, wordStartsMs: Array.from({ length: playedWords }, (_, index) => index * 280), durationMs: playedWords * 280, playedWords, firedCueMs: [], ending, frozen: [], ...STAMP });
    };
    const askAloud = (session: ReturnType<typeof setup>['session'], text: string) => {
      session.onEars({ type: 'voiceStarted' });
      session.onEars({ type: 'words', text, isFinal: true });
      session.onEars({ type: 'voiceEnded' });
      session.onEars({ type: 'turnDecided', text });
    };
    const stretchIsSounding = (notes: ReturnType<typeof setup>['notes'], index: number) => notes.some((note) => note.name === 'firstFrameCaptured' && note.fields.turnId === replyTurns(notes)[index]?.fields.turnId);

    it('in the first stretch, answers the new words alone, with the question once in the history and the next stretch told as not heard', async () => {
      const { session, notes, model } = setup(THEN_SHORT);
      askAloud(session, 'what is photosynthesis');
      await until(() => stretchIsSounding(notes, 0));
      askAloud(session, JUMP_IN);
      await until(() => model.requests.length === 2);
      expect(getUsers(model.requests[1])).toEqual(['what is photosynthesis', JUMP_IN]);
      expect(getCut(model.requests[1])?.not_heard).toContain('The leaf is where');
      expect(lastAssistant(model.requests[1])).not.toContain('Roots');
      await session.close();
    });

    it('in a later stretch, knows the first was heard and the last was not, and nothing is repeated', async () => {
      const { session, notes, messages, model } = setup(THEN_SHORT);
      askAloud(session, 'what is photosynthesis');
      await firstStretchDone(notes);
      reportHeard(session, messages, 't1-b0', 8, 'finished');
      await until(() => stretchIsSounding(notes, 1));
      session.onEars({ type: 'voiceStarted' });
      session.onEars({ type: 'words', text: JUMP_IN, isFinal: false });
      reportHeard(session, messages, 't1-b1', 3, 'interrupted');
      session.onEars({ type: 'words', text: JUMP_IN, isFinal: true });
      session.onEars({ type: 'voiceEnded' });
      session.onEars({ type: 'turnDecided', text: JUMP_IN });
      await until(() => model.requests.length === 2);
      expect(getUsers(model.requests[1])).toEqual(['what is photosynthesis', JUMP_IN]);
      const cut = getCut(model.requests[1]);
      expect(cut?.heard).toBe('Plants make their food from light and air. The leaf is');
      expect(cut?.not_heard).toContain('where all of it happens daily');
      await session.close();
    });

    it('in a breath, tells the stretch still to come as not heard, and carries nothing the brain holds', async () => {
      const { session, notes, messages, model } = setup(THEN_SHORT);
      askAloud(session, 'what is photosynthesis');
      await firstStretchDone(notes);
      reportHeard(session, messages, 't1-b0', 8, 'finished');
      askAloud(session, JUMP_IN);
      await until(() => model.requests.length === 2);
      expect(getUsers(model.requests[1])).toEqual(['what is photosynthesis', JUMP_IN]);
      const cut = getCut(model.requests[1]);
      expect(cut?.heard).toBe('Plants make their food from light and air.');
      expect(cut?.not_heard).toContain('The leaf is where');
      await session.close();
    });
  });
});
