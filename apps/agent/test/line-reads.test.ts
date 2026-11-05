import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAnswerWithUnit } from '@astra/board/shared';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLessonPlanner } from '../src/lesson-plan/lesson-planner.ts';
import { getLeadWordsProblem, getLessonWordsProblem } from '../src/lesson-plan/lesson-rules.ts';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { LEAD_TIMINGS, LEAD_WORDS } from '../src/live/tutor-lead.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import type { SafetyWatch } from '../src/safety/safety-watch.ts';
import type { StudentReading } from '../src/safety/student-reading.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STAMP = { clockId: 'c', browserMs: 1, startedMsAgo: 0 };
const FAST = { ...LEAD_TIMINGS, firstWordAfterMs: 20, slowFirstWordAfterMs: 400, afterQuestionMs: 150, afterQuestionAgainMs: 100, afterTaskMs: 200, afterTaskAgainMs: 150, afterTaskTriedMs: 50, afterKeyMs: 250 };
const QUICK = { firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 5, safetyReadWaitMs: 200, lineReadWaitMs: 150, readLimitMs: 300, safetyReadLimitMs: 300 };
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const STILL_MS = 400;

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}
const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('hello', 'greeting', 'Hello there.'), makeTake('prompt', 'prompt', 'Take your time.'), makeTake('lost', 'voiceLost', 'Sorry about that.')];
const makeSilentOutput = () => ({ sampleRate: 24000, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} });

interface Asked {
  words: string;
  notes: string[];
}

function makeModel(answer: (words: string, index: number) => string | null) {
  const asked: Asked[] = [];
  const model = {
    getCostUsd: () => 0,
    compact: async () => null,
    warm: async () => {},
    async *stream(request: { turns: readonly { role: string; text?: string }[] }) {
      const lastUserAt = request.turns.map(({ role }) => role).lastIndexOf('user');
      const words = request.turns[lastUserAt]?.text ?? '';
      asked.push({ words, notes: request.turns.slice(lastUserAt + 1).flatMap(({ text }) => text ?? []) });
      const text = answer(words, asked.length - 1);
      if (text === null) {
        yield { type: 'finished' as const, stopReason: 'refused' as const, refusalCategory: 'other', usage: USAGE };
        return;
      }
      yield { type: 'text' as const, text, isNewBlock: false };
      yield { type: 'finished' as const, stopReason: 'finished' as const, usage: USAGE };
    },
  };
  return { model: model as never, asked };
}

const makeWatch = (read: (text: string) => Promise<StudentReading>): SafetyWatch & { helps: () => number } => {
  let shown = 0;
  return { helps: () => shown, readStudent: read, noteTurnEnd: () => {}, showHelp: () => void (shown += 1), showHelpIfRaised: () => void (shown += 1), readSession: async () => 'none', flush: async () => {} };
};

const LESSON = { topic: 'Rockets', kind: 'teachFirst' as const, steps: Array.from({ length: 8 }, (_, index) => ({ teach: `idea ${index}`, exercise: `work out ${index} plus 1` })) };
const TASK = (tex: string) => `Your turn. {"kind":"boardMode","mode":"handsOn"}{"kind":"writeMath","id":"p1","tex":${JSON.stringify(tex)},"claim":"new"}Work it out. {"kind":"task","id":"a1","way":"write","on":"p1"}Have a go.`;

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

type Wishes = Record<string, string>;

function startLesson({ answer = (_words: string, index: number) => `Gravity keeps pulling, beat ${index}.`, wishes = {}, safety, promises = () => false, readMeaning, getNowMs, swapReaders }: { getNowMs?: () => number; answer?: (words: string, index: number) => string | null; wishes?: Wishes; safety?: SafetyWatch; promises?: (spoken: string) => boolean | 'asks'; readMeaning?: (words: string) => Promise<'needsAPerson' | null>; swapReaders?: Record<string, unknown> } = {}) {
  const { model, asked } = makeModel(answer);
  const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
  planner.noteCardLesson(LESSON);
  const lineReads: string[] = [];
  const lineFacts: unknown[] = [];
  const readers = {
    readLine: async (line: string, facts: unknown) => {
      lineReads.push(line);
      lineFacts.push(facts);
      return (wishes[line] ?? 'talk') as never;
    },
    readPromise: async (spoken: string) => {
      const promise = promises(spoken);
      return promise === 'asks' ? ('asks' as const) : promise ? ('waits' as const) : ('continues' as const);
    },
    ...swapReaders,
  };
  const decided: { name: string; fields: Record<string, unknown> }[] = [];
  const trace = (name: string, fields: Record<string, unknown> = {}) => void decided.push({ name, fields });
  const turns: { studentText: string; spokenText: string; attempts: number; firstBeatMs: number | null }[] = [];
  const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner, readers, trace, onTurnEnd: (turn: (typeof turns)[number]) => turns.push(turn), ...(safety ? { safety } : {}) } as never);
  const session = createLiveSession({
    messenger: { send: () => {}, sendOnBothChannels: () => {} },
    line: createVoiceLine(makeSilentOutput()),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts() as tts.TTS,
    tutor: brain,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    leadTimings: FAST,
    trace,
    ...(readMeaning ? { readMeaning: readMeaning as never } : {}),
    ...(getNowMs ? { getNowMs } : {}),
  });
  sessions.push(session);
  session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP } as never);
  session.onBrowser({ type: 'hello', ...STAMP } as never);
  let lineNumber = 0;
  const type = (text: string) => session.onBrowser({ type: 'typed', text, ...STAMP } as never);
  const typeInBox = (text: string) => {
    lineNumber += 1;
    const task = brain.getBoard().openTask;
    session.onBrowser({ type: 'worked', ...STAMP, work: { way: 'write', id: `s${lineNumber}`, text, ...(task ? { task } : {}) } } as never);
  };
  const leadsAsked = () => asked.filter(({ words }) => Object.values(LEAD_WORDS).includes(words as never)).length;
  const waitForLead = () => vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 3000 });
  return { session, brain, asked, type, typeInBox, leadsAsked, waitForLead, lineReads, lineFacts, decided, turns };
}

const leadsAfter = async (run: { leadsAsked(): number }, act: () => void) => {
  const before = run.leadsAsked();
  act();
  await delay(STILL_MS);
  return run.leadsAsked() - before;
};

describe('a line typed in the box, as the page sends it', () => {
  it.each(['wait', 'hold on', 'let me think', 'one sec'])('%s stops every lead', async (line) => {
    const run = startLesson();
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox(line))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it.each(['ok', 'okay', 'thanks'])('%s does not end a stop', async (line) => {
    const run = startLesson();
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox('please stop talking');
    await delay(STILL_MS);
    expect(await leadsAfter(run, () => run.typeInBox(line))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('a stop in a language no list knows stops it', async () => {
    const run = startLesson({ wishes: { 'biko kwusi': 'stop', attends: 'stop', 'e duro': 'stop', dakata: 'stop' } });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox('biko kwusi'))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
  });
});

describe('a line with a word from the danger list', () => {
  it.each(['so when it hits 11.2 km/s it escapes?', 'did anyone die on the challenger', 'what if it hits a satellite', 'my brain hurts lol', 'the rocket beats gravity right?', 'why did they kill the king'])('%s goes on once the read is clean', async (line) => {
    const safety = makeWatch(async () => 'school');
    const run = startLesson({ safety });
    run.type('teach me rockets');
    await run.waitForLead();
    const before = run.leadsAsked();
    run.typeInBox(line);
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(before), { timeout: 3000 });
    expect(safety.helps()).toBe(0);
  });

  it("a line with a danger word read as a stop still gets the model's own reply, with no note to hold", async () => {
    const run = startLesson({ safety: makeWatch(async () => 'school'), wishes: { 'i cant go on': 'stop' } });
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox('i cant go on');
    await vi.waitFor(() => expect(run.asked.some(({ words }) => words === 'i cant go on')).toBe(true), { timeout: 1000 });
    await delay(STILL_MS);
    expect(run.asked.filter(({ words }) => words === 'i cant go on').map(({ notes }) => notes.join(' ').includes('hold_on'))).toEqual([false]);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('no lead fires while the read is out, and a real crisis stays stopped', async () => {
    let land: (reading: StudentReading) => void = () => {};
    const safety = makeWatch((text) => (text.includes('die') ? new Promise((resolve) => (land = resolve)) : Promise.resolve('school')));
    const run = startLesson({ safety });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox('i want to die'))).toBe(0);
    land('self_harm');
    await delay(STILL_MS);
    expect(run.brain.canLead()).toBe(false);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('a failed read stays stopped, names help, and says what to do', async () => {
    const safety = makeWatch(async (text) => (text === 'i want to die' ? 'unread' : 'school'));
    const run = startLesson({ safety });
    run.type('teach me rockets');
    await run.waitForLead();
    const said: string[] = [];
    run.decided.length = 0;
    const before = run.leadsAsked();
    run.typeInBox('i want to die');
    await delay(STILL_MS);
    for (const { name, fields } of run.decided) if (name === 'lineSpoken') said.push(String(fields.use));
    expect(run.leadsAsked()).toBe(before);
    expect(run.brain.isLeadStopped()).toBe(true);
    expect(said).toContain('waitingAfterFailedRead');
  });
});

describe('an unsent draft read as danger', () => {
  it('goes on if the safety check then reads it clean', async () => {
    const safety = makeWatch(async () => 'school');
    const run = startLesson({ safety, readMeaning: async () => 'needsAPerson' });
    run.type('teach me rockets');
    await run.waitForLead();
    const before = run.leadsAsked();
    run.session.onBrowser({ type: 'paused', seconds: 4, draft: 'the crew were in danger', ...STAMP } as never);
    await vi.waitFor(() => expect(run.asked.some(({ words }) => words === '(has paused)')).toBe(true), { timeout: 1000 });
    run.session.onBrowser({ type: 'paused', seconds: 5, ...STAMP } as never);
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(before), { timeout: 3000 });
  });
});

describe('a reply beside a line that read as ordinary', () => {
  it('names an emergency number in a lesson, and the lesson goes on', async () => {
    const safety = makeWatch(async () => 'school');
    const run = startLesson({ safety, answer: (words, index) => (words === 'what do i do if a fire starts' ? 'Leave the room and call your local emergency number.' : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    const before = run.leadsAsked();
    run.typeInBox('what do i do if a fire starts');
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(before), { timeout: 3000 });
  });

  it('asks whether they are alright, and waits for them', async () => {
    const safety = makeWatch(async () => 'school');
    const run = startLesson({ safety, answer: (words, index) => (words === 'i hate this' ? 'Is everything okay? If anything is worrying you, tell an adult you trust.' : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox('i hate this'))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
  });
});

describe('a line code writes about the board', () => {
  it('holds a board word from the danger list and is not a failed read', async () => {
    const safety = makeWatch(async () => 'school');
    const run = startLesson({ safety });
    run.type('teach me rockets');
    await run.waitForLead();
    run.decided.length = 0;
    await run.session.onBrowser({ type: 'worked', ...STAMP, work: { way: 'pick', part: 'hits' } } as never);
    await delay(STILL_MS);
    expect(run.decided.filter(({ name, fields }) => name === 'lineSpoken' && fields.use === 'waitingAfterFailedRead')).toEqual([]);
    expect(run.brain.isLeadStopped()).toBe(false);
  });
});

describe('a plain answer that opens on a stop word', () => {
  it.each(['enough speed to escape', 'a second stage', 'a bit more than eleven', 'a minute', 'no more fuel', 'stop the engines', 'wait 11.2', 'one sec i think its 4.67'])('%s gets an answer and the lesson goes on', async (line) => {
    const run = startLesson();
    run.type('teach me rockets');
    await run.waitForLead();
    const before = run.leadsAsked();
    run.typeInBox(line);
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(before), { timeout: 3000 });
    expect(run.asked.find(({ words }) => words === line)?.notes.join(' ')).not.toContain('hold_on');
  });
});

describe('the tutor keeps its word', () => {
  it.each(['Sure, we can stop there. Come back whenever you want to pick up rockets.', 'Catch you later.', 'Okay, stopping.', 'Sure, pausing.', "I won't continue."])('after "%s" nothing goes on', async (goodbye) => {
    const run = startLesson({ answer: (words, index) => (words === 'anyway' ? goodbye : `Gravity keeps pulling, beat ${index}.`), promises: (spoken) => spoken === goodbye });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox('anyway'))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('a line read as leaving has no teaching after it', async () => {
    const run = startLesson({ wishes: { 'im done for today': 'leave', 'gotta go': 'leave' } });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox('im done for today'))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
  });
});

describe('what the page writes is not the student', () => {
  it('a reload does not end a stop', async () => {
    const run = startLesson();
    run.type('teach me rockets');
    await run.waitForLead();
    run.session.onBrowser({ type: 'stopTutor', ...STAMP } as never);
    await delay(STILL_MS);
    const before = run.asked.length;
    run.session.onBrowser({ type: 'hello', ...STAMP, clockId: 'second' } as never);
    run.session.onBrowser({ type: 'typed', text: "I'm back to carry on with this: Rockets", isOpening: true, ...STAMP } as never);
    await delay(STILL_MS);
    expect(run.asked.length).toBe(before);
    expect(run.brain.isLeadStopped()).toBe(true);
    expect(run.lineReads).not.toContain("I'm back to carry on with this: Rockets");
  });

  it('a reload with no stop is not read as the student, and the lesson goes on', async () => {
    const run = startLesson();
    run.type('teach me rockets');
    await run.waitForLead();
    run.session.onBrowser({ type: 'typed', text: "I'm back to carry on with this: Rockets", isOpening: true, ...STAMP } as never);
    await delay(STILL_MS);
    expect(run.lineReads).not.toContain("I'm back to carry on with this: Rockets");
    expect(run.brain.canLead()).toBe(true);
  });

  it('the line that opens a room is read for danger, and starts the reply', async () => {
    const reads: string[] = [];
    const safety = makeWatch(async (text) => (reads.push(text), 'self_harm'));
    const run = startLesson({ safety });
    run.session.onBrowser({ type: 'typed', text: 'i want to die', isOpening: true, ...STAMP } as never);
    await delay(STILL_MS);
    expect(reads).toEqual(['i want to die']);
    expect(run.asked.map(({ words }) => words)).toEqual(['i want to die']);
    expect(run.lineReads).toEqual([]);
    expect(run.brain.canLead()).toBe(false);
  });

  it('the help note comes back after a reload', async () => {
    const safety = makeWatch(async () => 'self_harm');
    const run = startLesson({ safety });
    run.type('i want to die');
    await delay(STILL_MS);
    const shown = safety.helps();
    run.session.onBrowser({ type: 'hello', ...STAMP, clockId: 'second' } as never);
    expect(safety.helps()).toBeGreaterThan(shown);
  });
});

describe('an answer with a spelled unit', () => {
  it.each([['20m/s^{2}', true], ['a=20m/s^{2}', true], ['5km', true], ['2x', false], ['5m', false], ['y=2x', false]])('%s reads as %s', (tex, reads) => expect(isAnswerWithUnit(tex)).toBe(reads));
});

describe('a right typed answer with its working', () => {
  it.each([['\\frac{11.2}{2.4}', '11.2/2.4 = 4.67'], ['100 - 30', '100 - 30 = 70'], ['g = \\frac{9.6}{4}', '9.6/4 = 2.4'], ['g = \\frac{9.6}{4}', '2.4 m/s²'], ['a = \\frac{60000}{3000}', '20 m/s²'], ['a = \\frac{60000}{3000}', '60000/3000 = 20']])('on %s, %s gets a reply at once', async (tex, line) => {
    const run = startLesson({ answer: (_words, index) => (index === 0 ? TASK(tex) : 'Good, that works.') });
    run.type('give me one');
    await vi.waitFor(() => expect(run.brain.getBoard().openTask).not.toBeNull(), { timeout: 2000 });
    await delay(50);
    run.typeInBox(line);
    await vi.waitFor(() => expect(run.asked.some(({ words }) => words === line)).toBe(true), { timeout: 1500 });
  });
});

describe('a stray word', () => {
  const heard = (session: LiveSession, words: string) => {
    session.onEars({ type: 'voiceStarted' });
    session.onEars({ type: 'words', text: words, isFinal: true });
    session.onEars({ type: 'voiceEnded' });
    session.onEars({ type: 'turnDecided', text: words });
  };

  it.each(['the', 'ok thanks'])('%s after a stop says nothing and leaves it stopped', async (line) => {
    const run = startLesson({ wishes: { the: 'filler', 'ok thanks': 'filler' } });
    run.type('teach me rockets');
    await run.waitForLead();
    run.type('stop');
    await delay(STILL_MS);
    run.decided.length = 0;
    const before = run.leadsAsked();
    heard(run.session, line);
    await delay(STILL_MS);
    expect(run.leadsAsked()).toBe(before);
    expect(run.brain.isLeadStopped()).toBe(true);
    expect(run.turns.filter(({ studentText }) => studentText === line).map(({ spokenText }) => spokenText)).toEqual(['']);
  });
});

describe('the tutor is not the student', () => {
  it.each(['Try this at home with an adult you trust nearby.', 'Your local emergency number is the same idea, one number for everyone.', 'The crew were in danger when the seal failed.'])('a lead saying "%s" stops nothing', async (line) => {
    let helps = 0;
    const safety = { ...makeWatch(async () => 'school'), showHelp: () => void (helps += 1) };
    const run = startLesson({ safety, answer: (_words, index) => (index === 1 ? line : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(1), { timeout: 3000 });
    expect(helps).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(false);
  });

  it('a refused lead tells nobody they did nothing wrong, and the next lead runs', async () => {
    const safety = makeWatch(async () => 'school');
    const run = startLesson({ safety, answer: (_words, index) => (index === 1 ? null : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(1), { timeout: 3000 });
    expect(run.decided.filter(({ name, fields }) => name === 'lineSpoken' && String(fields.use).startsWith('refused'))).toEqual([]);
    expect(safety.helps()).toBe(0);
  });
});

describe('an unsent draft in any script', () => {
  it.each(['أريد أن أموت', 'मैं मरना चाहता हूँ', '我想死', 'я хочу умереть', 'i want to die'])('%s is read for danger', async (draft) => {
    const seen: string[] = [];
    const run = startLesson({ readMeaning: async (words) => (seen.push(words), 'needsAPerson') });
    run.type('teach me rockets');
    await run.waitForLead();
    run.session.onBrowser({ type: 'paused', seconds: 4, draft, ...STAMP } as never);
    await vi.waitFor(() => expect(seen).toContain(draft), { timeout: 1000 });
    await vi.waitFor(() => expect(run.brain.isLeadStopped()).toBe(true), { timeout: 1000 });
  });

  it('a draft of math is not read', async () => {
    const seen: string[] = [];
    const run = startLesson({ readMeaning: async (words) => (seen.push(words), null) });
    run.type('teach me rockets');
    await run.waitForLead();
    run.session.onBrowser({ type: 'paused', seconds: 4, draft: '11.2/2.4 = 4', ...STAMP } as never);
    await delay(50);
    expect(seen).toEqual([]);
  });
});

describe('a draft left on the line', () => {
  it('holds the lesson for a minute, and not until the room closes', async () => {
    let skippedMs = 0;
    const run = startLesson({ getNowMs: () => performance.now() + skippedMs });
    run.type('teach me rockets');
    await run.waitForLead();
    run.session.onBrowser({ type: 'paused', seconds: 4, draft: 'hmm so', ...STAMP } as never);
    await delay(STILL_MS);
    const held = run.leadsAsked();
    await delay(STILL_MS);
    expect(run.leadsAsked()).toBe(held);
    skippedMs = 61_000;
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(held), { timeout: 3000 });
  });
});

describe('words a lead must not say', () => {
  it.each(['Last piece: the stage falls away.', 'Last sum. Try this one.', "That's the whole story of escaping Earth."])('%s goes back', (line) => expect(getLeadWordsProblem(line)).not.toBeNull());
  it.each(['Something is off with what I just said.', 'Careful, that line was muddled.'])('%s goes back', (line) => expect(getLessonWordsProblem(line)).not.toBeNull());
});

describe('the code path for whole lines', () => {
  it.each([['um wait', 'stop'], ['ok wait', 'stop'], ['hm wait', 'stop'], ['hmm let me think', 'stop'], ['ok next', 'go_on'], ['ok thanks', 'filler'], ['ok', 'filler'], ['wait 11.2', null], ['ok 4 m', null]])('reads %s as %s', async (line, wish) => {
    const { getPlainWish } = await import('../src/lesson-plan/student-wish.ts');
    expect(getPlainWish(line)).toBe(wish);
  });


  it('never disagrees with the labelled set', async () => {
    const { getPlainWish } = await import('../src/lesson-plan/student-wish.ts');
    const lines = JSON.parse(readFileSync(join(import.meta.dirname, '../../../evals/tutor-turns/student-lines.json'), 'utf8')) as { text: string; label: string; tutorSaid: string }[];
    const wrong = lines.filter(({ text, label }) => {
      const wish = (getPlainWish as (words: string) => unknown)(text);
      return wish !== null && wish !== label;
    });
    expect(wrong.map(({ text, label }) => `${text}: ${label}`)).toEqual([]);
  });
});

const HELP_REPLY = 'What do you mean by that? If anything is worrying you, tell an adult you trust now.';
const spokenTo = (run: { turns: { studentText: string; spokenText: string }[] }, line: string) => run.turns.filter(({ studentText }) => studentText === line).map(({ spokenText }) => spokenText);
const asksFor = (run: { asked: Asked[] }, line: string) => run.asked.filter(({ words }) => words === line);

describe('a read decides what comes next, and the reply stays the tutor\'s own', () => {
  it.each(['im done with all of it', 'make it stop', 'je veux que ca sarrete', 'ike agwula m', 'я больше не могу', 'no me importa, ya no quiero estar aqui'])('%s read as leave keeps the reply that names help, with one model call and no note to hold', async (line) => {
    const safety = makeWatch(async () => 'school');
    const run = startLesson({ safety, wishes: { [line]: 'leave' }, answer: (words, index) => (words === line ? HELP_REPLY : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox(line))).toBe(0);
    expect(asksFor(run, line).map(({ notes }) => notes.join(' ').includes('hold_on'))).toEqual([false]);
    expect(spokenTo(run, line)).toEqual([HELP_REPLY]);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('a read of a stop while the model is still writing does not cut what the model writes', async () => {
    const line = 'stop i cant breathe';
    const run = startLesson({ wishes: { [line]: 'stop' }, answer: (words, index) => (words === line ? HELP_REPLY : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox(line);
    await delay(STILL_MS);
    expect(run.turns.find(({ studentText }) => studentText === line)?.attempts).toBe(1);
  });
});

describe('a student who comes back to a held lesson', () => {
  it.each(['im back', 'hey', 'yes please', 'sorry', 'im still here', 'got it'])('%s read as filler still gets the reply, and the stop stays', async (line) => {
    const run = startLesson({ wishes: { [line]: 'filler' }, answer: (words, index) => (words === line ? 'Still here.' : words === 'brb' ? 'Sure, take your time.' : `Gravity keeps pulling, beat ${index}.`), promises: (spoken) => spoken.includes('take your time') });
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox('brb');
    await delay(STILL_MS);
    expect(await leadsAfter(run, () => run.typeInBox(line))).toBe(0);
    expect(spokenTo(run, line)).toEqual(['Still here.']);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('the read is told the tutor is waiting and what it last said', async () => {
    const run = startLesson({ wishes: { brb: 'leave' }, answer: (words, index) => (words === 'brb' ? 'Sure, tell me when you are back.' : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox('brb');
    await delay(STILL_MS);
    run.typeInBox('yes');
    await delay(STILL_MS);
    expect(run.lineFacts.at(-1)).toMatchObject({ tutorSaid: 'Sure, tell me when you are back.', isTutorWaiting: true });
  });

  it('a nod says nothing, and the next line is still read against what the tutor last said', async () => {
    const run = startLesson({ wishes: { brb: 'leave' }, answer: (words, index) => (words === 'brb' ? 'Sure, tell me when you are back.' : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox('brb');
    await delay(STILL_MS);
    run.typeInBox('ok');
    await delay(STILL_MS);
    run.typeInBox('yes');
    await delay(STILL_MS);
    expect(run.lineFacts.at(-1)).toMatchObject({ tutorSaid: 'Sure, tell me when you are back.' });
  });

  it.each(['im back', 'lets go'])('%s read as go on brings the lesson back', async (line) => {
    const run = startLesson({ wishes: { brb: 'leave', [line]: 'go_on' } });
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox('brb');
    await delay(STILL_MS);
    const before = run.leadsAsked();
    run.typeInBox(line);
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(before), { timeout: 3000 });
    expect(spokenTo(run, line)[0]).not.toBe('');
  });

  it.each(['ok', 'k', 'thanks'])('%s after a stop is truly nothing: no model call, and it stays stopped', async (line) => {
    const run = startLesson();
    run.type('teach me rockets');
    await run.waitForLead();
    run.typeInBox('please stop talking');
    await delay(STILL_MS);
    const asked = run.asked.length;
    run.typeInBox(line);
    await delay(STILL_MS);
    expect(run.asked.length).toBe(asked);
    expect(run.brain.isLeadStopped()).toBe(true);
  });
});

describe('a student who says they finished an exercise', () => {
  it('the read is told an exercise is open', async () => {
    const run = startLesson({ answer: (_words, index) => (index === 0 ? TASK('11.2 / 2.4') : 'What did you get?') });
    run.type('give me one');
    await vi.waitFor(() => expect(run.brain.getBoard().openTask).not.toBeNull(), { timeout: 2000 });
    await delay(50);
    run.typeInBox('done');
    await delay(STILL_MS);
    expect(run.lineFacts.at(-1)).toMatchObject({ isTaskOpen: true });
  });
});

describe('a word on an exercise with numbers', () => {
  it.each(['done', 'finished', 'i finished'])('%s is no try, so the exercise keeps its own wait', async (line) => {
    const run = startLesson({ answer: (_words, index) => (index === 0 ? TASK('11.2 / 2.4') : 'Type the number you got, and I will check it.') });
    run.type('give me one');
    await vi.waitFor(() => expect(run.brain.getBoard().openTask).not.toBeNull(), { timeout: 2000 });
    await delay(50);
    run.typeInBox(line);
    await delay(STILL_MS);
    expect(run.asked.map(({ words }) => words)).not.toContain(LEAD_WORDS.taskTried);
  });
});

describe('the tutor said it would stop', () => {
  it.each(['Okay, stopping.', 'Okay, stopping. What part do you think is wrong?', 'Okay, stopping there. Just say when.', 'Sure, pausing here.'])('"%s" holds with the reads down', async (reply) => {
    const run = startLesson({ answer: (words, index) => (words === 'anyway' ? reply : `Gravity keeps pulling, beat ${index}.`), swapReaders: { readPromise: async () => 'unread' } });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox('anyway'))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it.each(['The rocket is stopping its engines now.', 'Stopping the burn early costs speed.'])('"%s" is about the lesson and holds nothing', async (reply) => {
    const { promisesToWait } = await import('../src/lesson-plan/lesson-rules.ts');
    expect(promisesToWait(reply)).toBe(false);
  });
});

describe('the reads fail', () => {
  it.each(['lemme think', 'gimme a min', 'hold up', 'shh', 'abeg wait', 'so how fast is that'])('%s with nothing read holds the lesson, gets a reply, and says it will wait', async (line) => {
    const run = startLesson({ swapReaders: { readLine: async () => 'unread', readPromise: async () => 'unread' } });
    run.type('hello');
    await delay(STILL_MS);
    expect(await leadsAfter(run, () => run.typeInBox(line))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
    expect(spokenTo(run, line)[0]).toContain('Tell me when you want to carry on');
  });

  it('a failed read does not stop a lesson nobody spoke into', async () => {
    const run = startLesson({ swapReaders: { readPromise: async () => 'unread' } });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(run.brain.isLeadStopped()).toBe(false);
  });

  it('go on still works with the reads down', async () => {
    const run = startLesson({ swapReaders: { readLine: async () => 'unread', readPromise: async () => 'unread' } });
    run.type('hello');
    await delay(STILL_MS);
    run.typeInBox('wait what');
    await delay(STILL_MS);
    const before = run.leadsAsked();
    run.typeInBox('keep going');
    await vi.waitFor(() => expect(run.leadsAsked()).toBeGreaterThan(before), { timeout: 3000 });
  });
});

describe('a reply that asks after them, or cannot read them', () => {
  it.each(["That looks like Igbo, and I can't read it well enough to be sure. Is someone hurting you?", "I can't read that one. Try other words?", 'Sorry, that didn\'t come through. Try again?', 'Not sure what "mo fe ku" means. Did you mean to type something else?', "Sorry, I can't follow that last bit. Could you type it in English?"])('"%s" holds until they speak and names help', async (reply) => {
    const line = 'mo fe ku';
    const run = startLesson({ safety: makeWatch(async () => 'school'), answer: (words, index) => (words === line ? reply : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox(line))).toBe(0);
    expect(run.brain.isLeadStopped()).toBe(true);
    expect(spokenTo(run, line)[0]).toMatch(/adult you trust/);
  });

  it('a reply read as asking after them holds, even with an exercise open', async () => {
    const line = 'ndi be anyi na-eti m';
    const asksAfter = 'Onye na-eti gi?';
    const run = startLesson({ safety: makeWatch(async () => 'school'), promises: (spoken) => (spoken === asksAfter ? 'asks' : false), answer: (words, index) => (index === 0 ? TASK('11.2 / 2.4') : words === line ? asksAfter : `Gravity keeps pulling, beat ${index}.`) });
    run.type('give me one');
    await vi.waitFor(() => expect(run.brain.getBoard().openTask).not.toBeNull(), { timeout: 2000 });
    await delay(50);
    run.type(line);
    await delay(STILL_MS);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('a reply read as asking after them names help, in any words', async () => {
    const line = 'make it stop';
    const asksAfter = 'Do you mean the lesson, or is something else going on?';
    const run = startLesson({ safety: makeWatch(async () => 'school'), promises: (spoken) => (spoken === asksAfter ? 'asks' : false), answer: (words, index) => (words === line ? asksAfter : `Gravity keeps pulling, beat ${index}.`) });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox(line))).toBe(0);
    expect(spokenTo(run, line)[0]).toMatch(/adult you trust/);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('take your time with an exercise open holds nothing', async () => {
    const run = startLesson({ promises: (spoken) => spoken === 'Take your time.', answer: (words, index) => (index === 0 ? TASK('11.2 / 2.4') : words === 'let me try' ? 'Take your time.' : `Gravity keeps pulling, beat ${index}.`) });
    run.type('give me one');
    await vi.waitFor(() => expect(run.brain.getBoard().openTask).not.toBeNull(), { timeout: 2000 });
    await delay(50);
    run.type('let me try');
    await delay(STILL_MS);
    expect(run.brain.canLead()).toBe(true);
  });
});

describe('a read that never lands or throws', () => {
  it('a line read that never resolves holds for its limit and then the lesson is not silent for good', async () => {
    const run = startLesson({ swapReaders: { readLine: () => new Promise(() => {}) } });
    run.type('hello');
    await delay(STILL_MS + 100);
    run.typeInBox('keep going');
    await delay(STILL_MS);
    expect(run.brain.isLeadStopped()).toBe(false);
    expect(run.brain.canLead()).toBe(true);
  });

  it('a promise read that never resolves does not stop every lead for good', async () => {
    const run = startLesson({ swapReaders: { readPromise: () => new Promise(() => {}) } });
    run.type('teach me rockets');
    await delay(STILL_MS);
    expect(run.brain.canLead()).toBe(true);
  });

  it.each(['readLine', 'readPromise'])('a %s that rejects raises nothing unhandled', async (name) => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const run = startLesson({ swapReaders: { [name]: () => Promise.reject(new Error('read down')) } });
    run.type('hello');
    await delay(STILL_MS);
    run.typeInBox('so how fast is it');
    await delay(STILL_MS);
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
    expect(spokenTo(run, 'so how fast is it')[0]).not.toBe('');
  });

  it('a safety read that rejects holds the lesson and raises nothing unhandled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const run = startLesson({ safety: makeWatch(() => Promise.reject(new Error('read down'))) });
    run.type('hello');
    await delay(STILL_MS);
    run.typeInBox('so how fast is it');
    await delay(STILL_MS);
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
    expect(run.brain.isLeadStopped()).toBe(true);
  });

  it('a hung read does not hold the words of a reply', async () => {
    const run = startLesson({ swapReaders: { readLine: () => new Promise(() => {}) } });
    run.typeInBox('so how fast is it');
    await vi.waitFor(() => expect(run.turns.length).toBeGreaterThan(0), { timeout: 2000 });
    expect(run.turns[0]?.firstBeatMs).toBeLessThan(100);
  });
});
