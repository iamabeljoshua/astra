import { initializeLogger } from '@livekit/agents';
import type { AgentMessage, BrowserMessage, TurnId } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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
    await delay(1000);
    expect(messages).toContainEqual({ type: 'heard' });
    expect((find('firstFrameCaptured', 'greeting')?.atMs as number) - sentAtMs).toBeLessThan(200);
    expect(find('firstFrameCaptured', 'reply')?.atMs as number).toBeGreaterThan(find('firstFrameCaptured', 'greeting')?.atMs as number);
    await session.close();
  });

  it('says it is thinking until the first beat, so the dot explains the quiet', async () => {
    const { session, messages } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 50 }));
    session.onBrowser(typed('Why does it fall?'));
    await delay(300);
    const thinking = messages.filter((message) => message.type === 'thinking');
    expect(thinking.map((message) => message.isThinking)).toEqual([true, false]);
    await session.close();
  });

  it('never reads a slow model as a failed voice', async () => {
    const { session, notes, model } = setup(() => ({ pieces: ['Okay, here we go.'], firstTextMs: 10_000 }));
    session.onBrowser(typed('Why does it fall?'));
    await delay(600);
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
    await delay(150);
    expect(model.aborted.streams).toBe(1);
    expect(model.aborted.piecesNotSent).toBeGreaterThan(20);
    expect(model.requests).toHaveLength(2);
    expect(messages.filter((message) => message.type === 'heard')).toHaveLength(2);
    await session.close();
  });

  it('passes what played to the brain, so the next turn knows what was heard', async () => {
    const { session, model, messages } = setup(() => ({ pieces: ['Okay, one two three four.'] }));
    session.onBrowser(typed('count'));
    await delay(250);
    const turnId = (messages.find((message) => message.type === 'turnStarted' && message.turnId !== 'turn-1') as { turnId: TurnId }).turnId;
    session.onBrowser({ type: 'played', turnId, beatId: 't1-b0' as never, wordStartsMs: [0, 280], durationMs: 560, playedWords: 2, firedCueMs: [], ending: 'interrupted', frozen: [], ...STAMP });
    session.onBrowser(typed('wait'));
    await delay(300);
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
  await delay(500);
};

describe('a ring the board could not draw', () => {
  it('reaches the next request as a note', async () => {
    const { session, model } = setup((_request, attempt) => (attempt === 1 ? { pieces: ['Okay, ', '{"kind":"writeMath","id":"steps","tex":"x = 1"}', 'see this ', '{"kind":"highlight","id":"ring","target":"steps","tex":"x"}', 'letter here.'] } : { pieces: ['Got it.'] }));
    session.onBrowser(typed('show me'));
    await delay(1500);
    session.onBrowser({ type: 'markNotDrawn', markId: 'ring', ...STAMP });
    session.onBrowser(typed('where?'));
    await delay(400);
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
    await delay(2100);
    expect(JSON.stringify(model.requests.at(-1)?.turns)).toContain('line 149');
    await session.close();
  });

  it('keeps a loop of forged reports from cutting and resuming the voice again and again', async () => {
    const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
    const { session, notes, messages } = setup(() => ({ pieces: [words] }));
    session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP });
    session.onBrowser(typed('count'));
    await delay(400);
    for (let index = 0; index < 6; index += 1) {
      const turnId = (messages.filter((message) => message.type === 'turnStarted').at(-1) as { turnId: TurnId }).turnId;
      session.onBrowser({ type: 'played', turnId, beatId: 't1-b0' as never, ...PLAYED });
      await delay(120);
    }
    expect(notes.filter((note) => note.name === 'browserFroze').length).toBeLessThanOrEqual(1);
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
    await delay(TURN_TIMINGS.transcriptGraceMs + 1800);
    const spoken = messages.flatMap((message) => (message.type === 'words' ? message.words.map((word) => word.text) : []));
    expect(spoken.join(' ')).toContain('Delta');
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
    await delay(1200);
    expect(messages).toContainEqual({ type: 'tutorClosed', reason: 'dailyLimit' });
    const turnsBefore = messages.filter((message) => message.type === 'turnStarted').length;
    session.onBrowser(typed('two'));
    await delay(300);
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
    await delay(1500);
    session.onBrowser(typed('FIRST'));
    await delay(400);
    await speakOverTheTutor(session, 'SECOND wait a second please');
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
    await delay(500);
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
    await delay(50);
    expect(model.aborted.streams).toBe(1);
    expect(summaries).toHaveLength(1);
  });
});
