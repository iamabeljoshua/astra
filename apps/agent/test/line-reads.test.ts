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
const QUICK = { firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 5, safetyReadWaitMs: 200, lineReadWaitMs: 150 };
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

function startLesson({ answer = (_words: string, index: number) => `Gravity keeps pulling, beat ${index}.`, wishes = {}, safety, promises = () => false, readMeaning, getNowMs }: { getNowMs?: () => number; answer?: (words: string, index: number) => string | null; wishes?: Wishes; safety?: SafetyWatch; promises?: (spoken: string) => boolean; readMeaning?: (words: string) => Promise<'needsAPerson' | null> } = {}) {
  const { model, asked } = makeModel(answer);
  const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
  planner.noteCardLesson(LESSON);
  const lineReads: string[] = [];
  const readers = {
    readLine: async (line: string) => {
      lineReads.push(line);
      return (wishes[line] ?? 'talk') as never;
    },
    readPromise: async (spoken: string) => (promises(spoken) ? ('waits' as const) : ('continues' as const)),
  };
  const decided: { name: string; fields: Record<string, unknown> }[] = [];
  const trace = (name: string, fields: Record<string, unknown> = {}) => void decided.push({ name, fields });
  const turns: { studentText: string; spokenText: string }[] = [];
  const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner, readers, trace, onTurnEnd: (turn: { studentText: string; spokenText: string }) => turns.push(turn), ...(safety ? { safety } : {}) } as never);
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
  return { session, brain, asked, type, typeInBox, leadsAsked, waitForLead, lineReads, decided, turns };
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
    expect(run.asked.at(-1)?.notes.join(' ')).toContain('hold_on');
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
    const safety = makeWatch(async () => 'unread');
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

  it('a line read as leaving gets the hold note and no teaching after it', async () => {
    const run = startLesson({ wishes: { 'im done for today': 'leave', 'gotta go': 'leave' } });
    run.type('teach me rockets');
    await run.waitForLead();
    expect(await leadsAfter(run, () => run.typeInBox('im done for today'))).toBe(0);
    expect(run.asked.at(-1)?.notes.join(' ')).toContain('hold_on');
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
    await vi.waitFor(() => expect(run.asked.some(({ words }) => words === line)).toBe(true), { timeout: 200 });
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

