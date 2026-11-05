import { getBeatText } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLessonPlanner } from '../src/lesson-plan/lesson-planner.ts';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { speakTurn } from '../src/live/speak-turn.ts';
import { LEAD_TIMINGS, LEAD_WORDS } from '../src/live/tutor-lead.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const QUICK = { firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 5, safetyReadWaitMs: 40 };
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const STAMP = { clockId: 'c', browserMs: 1, startedMsAgo: 0 };
const LESSON = { topic: 'Rockets', kind: 'teachFirst' as const, steps: Array.from({ length: 4 }, (_, index) => ({ teach: `idea ${index}`, exercise: 'put these in order' })) };

function makeModel(answer: (words: string, index: number) => string = (_words, index) => `Gravity keeps pulling, line ${index}.`) {
  const asked: { words: string; notes: string[]; isAborted: () => boolean }[] = [];
  const model = {
    getCostUsd: () => 0.01,
    compact: async () => null,
    warm: async () => {},
    async *stream(request: { turns: readonly { role: string; text?: string }[] }, signal: AbortSignal) {
      const lastUserAt = request.turns.map(({ role }) => role).lastIndexOf('user');
      const words = request.turns[lastUserAt]?.text ?? '';
      asked.push({ words, notes: request.turns.slice(lastUserAt + 1).flatMap(({ text }) => text ?? []), isAborted: () => signal.aborted });
      yield { type: 'started' as const, usage: USAGE };
      yield { type: 'text' as const, text: answer(words, asked.length - 1), isNewBlock: false };
      yield { type: 'finished' as const, stopReason: 'finished' as const, refusalCategory: null, usage: USAGE };
    },
  };
  return { model: model as never, asked };
}

const makePlanner = () => {
  const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
  planner.noteCardLesson(LESSON);
  return planner;
};

const collect = async (brain: ReturnType<typeof createTutorBrain>, text: string, lead?: 'next') => {
  const said: string[] = [];
  const beats = [];
  for await (const beat of brain.reply({ text, ...(lead ? { lead } : {}) }, new AbortController().signal)) {
    said.push(getBeatText(beat));
    beats.push(beat);
  }
  return { said: said.join(' '), beats };
};

describe('a lead written ahead', () => {
  it('is the reply the student hears, with no second request', async () => {
    const { model, asked } = makeModel();
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: makePlanner() });
    await collect(brain, 'teach me rockets');
    brain.prepareLead();
    await delay(5);
    expect(asked).toHaveLength(2);
    const { said } = await collect(brain, LEAD_WORDS.next, 'next');
    expect(said).toBe('Gravity keeps pulling, line 1.');
    expect(asked).toHaveLength(2);
  });

  it('sends what the lead itself would have sent, word for word', async () => {
    const planned = makeModel();
    const prepared = createTutorBrain({ model: planned.model, timeouts: QUICK, lessonPlanner: makePlanner() });
    await collect(prepared, 'teach me rockets');
    prepared.prepareLead();
    await delay(5);
    const plain = makeModel();
    const direct = createTutorBrain({ model: plain.model, timeouts: QUICK, lessonPlanner: makePlanner() });
    await collect(direct, 'teach me rockets');
    await collect(direct, LEAD_WORDS.next, 'next');
    expect(planned.asked[1]?.notes).toEqual(plain.asked[1]?.notes);
  });

  it('leaves the lesson as it was when a student cuts in, and what they missed still reaches the next request', async () => {
    const { model, asked } = makeModel();
    const dropped: number[] = [];
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: makePlanner(), onPreparedLeadDropped: (usd) => dropped.push(usd) });
    const { beats } = await collect(brain, 'teach me rockets');
    brain.prepareLead();
    await delay(5);
    brain.noteCut(new Map([[beats[0]?.id as never, 1]]));
    expect(dropped).toEqual([0.01]);
    expect(asked[1]?.isAborted()).toBe(true);
    await collect(brain, 'wait why');
    const last = asked.at(-1);
    expect(last?.words).toBe('wait why');
    expect(last?.notes.join(' ')).toContain('not_heard');
  });

  it('never reads what it wrote, so it has no effect on the board or history if it is dropped', async () => {
    const { model, asked } = makeModel((_words, index) => (index === 1 ? 'Look. {"kind":"writeMath","id":"p1","tex":"1 + 1 = 2","claim":"new"}One and one.' : 'Gravity pulls.'));
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: makePlanner() });
    await collect(brain, 'teach me rockets');
    brain.prepareLead();
    await delay(5);
    brain.dropPreparedLead();
    expect([...brain.getBoard().state.elements.keys()]).not.toContain('p1');
    await collect(brain, 'go on');
    expect(asked.at(-1)?.notes.join(' ')).not.toContain('p1');
  });

  it('lets a note that lands after it wait for the next turn, and is still used', async () => {
    const { model, asked } = makeModel(() => 'Look. {"kind":"writeMath","id":"p1","tex":"1 + 1 = 2","claim":"new"}One and one. {"kind":"highlight","id":"r1","target":"p1","tex":"1"}That one is it.');
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: makePlanner() });
    await collect(brain, 'teach me rockets');
    brain.prepareLead();
    await delay(5);
    brain.noteMarkNotDrawn('r1');
    await collect(brain, LEAD_WORDS.next, 'next');
    expect(asked).toHaveLength(2);
    await collect(brain, LEAD_WORDS.next, 'next');
    expect(asked[2]?.notes.join(' ')).toContain('mark_not_drawn');
  });

  it('is thrown away and asked again when the plan moved on after it was written', async () => {
    const { model, asked } = makeModel();
    const planner = makePlanner();
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    await collect(brain, 'teach me rockets');
    brain.prepareLead();
    await delay(5);
    planner.moveToNextStep();
    const { said } = await collect(brain, LEAD_WORDS.next, 'next');
    expect(asked).toHaveLength(3);
    expect(asked[2]?.notes.join(' ')).toContain('2 of 4');
    expect(said).toBe('Gravity keeps pulling, line 2.');
  });

  it('is not written while the lesson is stopped', async () => {
    const { model, asked } = makeModel();
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: makePlanner() });
    await collect(brain, 'teach me rockets');
    brain.holdLeads();
    brain.prepareLead();
    await delay(5);
    expect(asked).toHaveLength(1);
  });
});

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}
const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('hello', 'greeting', 'Hello there.'), makeTake('prompt', 'prompt', 'Take your time.'), makeTake('lost', 'voiceLost', 'Sorry about that.')];

function makePacedOutput(): VoiceOutput {
  let queuedUntilMs = 0;
  let endWait = () => {};
  return {
    sampleRate: 24000,
    async captureFrame(frame) {
      queuedUntilMs = Math.max(queuedUntilMs, performance.now()) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
      await delay(Math.max(0, queuedUntilMs - performance.now() - 100));
    },
    clearQueue() {
      queuedUntilMs = 0;
      endWait();
    },
    async waitForPlayout() {
      await new Promise<void>((resolve) => {
        endWait = resolve;
        setTimeout(resolve, Math.max(0, queuedUntilMs - performance.now()));
      });
    },
  };
}

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

const SPOKEN_LINE = 'Gravity keeps pulling on every rocket that ever climbed, and the engine keeps pushing back the whole way up until the fuel runs out at last.';

function startPacedLesson() {
  const { model, asked } = makeModel(() => SPOKEN_LINE);
  const dropped: number[] = [];
  const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: makePlanner(), onPreparedLeadDropped: (usd) => dropped.push(usd) });
  const events: { name: string; kind: unknown; atMs: number }[] = [];
  const session = createLiveSession({
    messenger: { send: () => {}, sendOnBothChannels: () => {} },
    line: createVoiceLine(makePacedOutput()),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts() as tts.TTS,
    tutor: brain,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    leadTimings: { ...LEAD_TIMINGS, firstWordAfterMs: 20, afterStudentSignMs: 20, afterKeyMs: 100 },
    trace: (name, fields = {}) => void events.push({ name, kind: fields.kind, atMs: performance.now() }),
  });
  sessions.push(session);
  session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP } as never);
  const type = (text: string) => session.onBrowser({ type: 'typed', text, ...STAMP } as never);
  return { session, asked, dropped, events, type };
}

describe('a teaching reply and the one after it, on a paced voice', () => {
  it('asks for the next reply before this one ends, and speaks it only after this one has finished', async () => {
    const { asked, events, type } = startPacedLesson();
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2), { timeout: 15_000 });
    const askedAtMs = performance.now();
    const isReply = ({ kind }: { kind: unknown }) => kind === 'reply';
    expect(events.filter(({ name }) => name === 'turnFinished').filter(isReply)).toHaveLength(0);
    await vi.waitFor(() => expect(events.filter(({ name }) => name === 'firstFrameCaptured').filter(isReply).length).toBeGreaterThanOrEqual(2), { timeout: 15_000 });
    const frames = events.filter(({ name }) => name === 'firstFrameCaptured').filter(isReply);
    const finished = events.filter(({ name }) => name === 'turnFinished').find(isReply);
    expect(finished?.atMs).toBeGreaterThan(askedAtMs);
    expect(frames[1]?.atMs).toBeGreaterThan(finished?.atMs ?? Infinity);
    expect(asked.length).toBe(2);
  }, 40_000);

  it('throws the written reply away on a key, and answers the student with a new request', async () => {
    const { asked, dropped, session, type } = startPacedLesson();
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2), { timeout: 15_000 });
    session.onBrowser({ type: 'typing', ...STAMP } as never);
    expect(dropped.length).toBe(1);
    type('wait why');
    await vi.waitFor(() => expect(asked.at(-1)?.words).toBe('wait why'), { timeout: 5000 });
    expect(asked.filter(({ words }) => words === LEAD_WORDS.next)).toHaveLength(1);
  }, 30_000);
});

describe('what goes to the voice at once', () => {
  const countFlushes = async (beats: AsyncIterable<never>) => {
    const voice = makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts() as tts.TTS;
    const makeStream = voice.stream.bind(voice);
    let flushes = 0;
    voice.stream = () => {
      const stream = makeStream();
      const flush = stream.flush.bind(stream);
      stream.flush = () => {
        flushes += 1;
        flush();
      };
      return stream;
    };
    const turn = speakTurn({ voice, line: createVoiceLine(makePacedOutput()), messenger: { send: () => {}, sendOnBothChannels: () => {} }, turnId: 'turn-1' as never, beats });
    await turn.finished;
    return flushes;
  };
  const beat = (id: string, words: string) => ({ id, script: [words], expectsReply: false }) as never;

  it('sends beats that are waiting together as one long stretch', async () => {
    async function* written() {
      yield beat('a', 'One two three four,');
      yield beat('b', 'five six seven eight.');
      yield beat('c', 'Nine ten eleven twelve.');
    }
    expect(await countFlushes(written())).toBe(1);
  }, 10_000);

  it('sends the first words alone when the model is still writing, so the first sound stays fast, and the rest as a stretch', async () => {
    async function* written() {
      yield beat('a', 'One two three four,');
      await delay(100);
      yield beat('b', 'five six seven eight.');
      yield beat('c', 'Nine ten eleven twelve.');
    }
    expect(await countFlushes(written())).toBe(2);
  }, 10_000);
});
