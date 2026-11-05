import { getBeatText } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askMoreSteps } from '../src/lesson-plan/ask-planner.ts';
import { asksToBeTaught, createLessonPlanner } from '../src/lesson-plan/lesson-planner.ts';
import { getLessonWordsProblem } from '../src/lesson-plan/lesson-rules.ts';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { getLead, LEAD_TIMINGS, LEAD_WORDS } from '../src/live/tutor-lead.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { TRY_NEXT_FROM_CODE } from '../src/recap/recap-rules.ts';
import { writeLessonRecap } from '../src/recap/write-recap.ts';
import type { StudentReading } from '../src/safety/student-reading.ts';
import type { SafetyWatch } from '../src/safety/safety-watch.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';
import type { LineWish } from '../src/tutor/line-read/read-line.ts';
import { MAY_BE_ABOUT_SAFETY } from '../src/tutor/safety-words.ts';
import { decideWatch } from '../src/tutor/watcher/watch-rule.ts';
import type { WordMeaning } from '../src/tutor/watcher/watch-rule.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STAMP = { clockId: 'c', browserMs: 1, startedMsAgo: 0 };
const FAST = { ...LEAD_TIMINGS, firstWordAfterMs: 20, afterStudentSignMs: 20, slowFirstWordAfterMs: 400, afterQuestionMs: 150, afterQuestionAgainMs: 100, afterTaskMs: 200, afterTaskAgainMs: 150, afterTaskTriedMs: 50, afterKeyMs: 250 };
const QUICK = { firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 5, safetyReadWaitMs: 40 };
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

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

function makeModel(answer: (words: string, index: number) => string, latencyMs = 0) {
  const asked: Asked[] = [];
  const model = {
    getCostUsd: () => 0,
    compact: async () => null,
    warm: async () => {},
    async *stream(request: { turns: readonly { role: string; text?: string }[] }, signal: AbortSignal) {
      const lastUserAt = request.turns.map(({ role }) => role).lastIndexOf('user');
      const words = request.turns[lastUserAt]?.text ?? '';
      asked.push({ words, notes: request.turns.slice(lastUserAt + 1).flatMap(({ text }) => text ?? []) });
      if (latencyMs > 0) await delay(latencyMs);
      if (signal.aborted) return;
      yield { type: 'text' as const, text: answer(words, asked.length - 1), isNewBlock: false };
      yield { type: 'finished' as const, stopReason: 'finished' as const, usage: USAGE };
    },
  };
  return { model: model as never, asked };
}

const makePlanner = (fields: Record<string, unknown> = {}) => createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {}, ...fields });
const HOLD_LINES: readonly string[] = ['hold on let me think for a minute', 'please dont go on', 'dont teach me more', 'i dont want you to carry on', 'stop, dont keep going', 'dont move on yet i dont get it', 'brb gimme a bit'];
const fakeReaders = { readLine: async (line: string): Promise<LineWish> => (HOLD_LINES.includes(line) ? 'stop' : 'talk'), readPromise: async () => 'continues' as const };
const LESSON = { topic: 'Rockets', kind: 'teachFirst' as const, steps: Array.from({ length: 8 }, (_, index) => ({ teach: `idea ${index}`, exercise: `work out ${index} plus 1` })) };

const makeWatch = (read: (text: string) => Promise<StudentReading>): SafetyWatch & { reads: string[] } => {
  const reads: string[] = [];
  return { reads, readStudent: (text) => (reads.push(text), read(text)), noteTurnEnd: () => {}, showHelp: () => {}, readSession: async () => 'none', flush: async () => {} };
};

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

type BrainFields = Partial<Parameters<typeof createTutorBrain>[0]>;

function startLesson({ answer = (_words: string, index: number) => `Gravity keeps pulling, beat ${index}.`, latencyMs = 0, brain: brainFields = {}, readMeaning, leadTimings = FAST }: { answer?: (words: string, index: number) => string; latencyMs?: number; brain?: BrainFields; readMeaning?: (words: string) => Promise<WordMeaning | null>; leadTimings?: typeof FAST } = {}) {
  const { model, asked } = makeModel(answer, latencyMs);
  const planner = makePlanner();
  planner.noteCardLesson(LESSON);
  const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner, readers: fakeReaders, ...brainFields });
  const decided: { name: string; fields: Record<string, unknown> }[] = [];
  const session = createLiveSession({
    messenger: { send: () => {}, sendOnBothChannels: () => {} },
    line: createVoiceLine(makeSilentOutput()),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts() as tts.TTS,
    tutor: brain,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    leadTimings,
    trace: (name, fields = {}) => void decided.push({ name, fields }),
    ...(readMeaning ? { readMeaning } : {}),
  });
  sessions.push(session);
  session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP } as never);
  const type = (text: string) => session.onBrowser({ type: 'typed', text, ...STAMP } as never);
  const cough = () => {
    session.onEars({ type: 'voiceStarted' });
    session.onEars({ type: 'voiceEnded' });
  };
  const leadsAsked = () => asked.filter(({ words }) => Object.values(LEAD_WORDS).includes(words as never)).length;
  return { session, brain, asked, type, cough, leadsAsked, decided };
}

const say = async (brain: ReturnType<typeof createTutorBrain>, text: string, lead?: 'next' | 'taskLeft') => {
  const said: string[] = [];
  if (lead) brain.noteLead(lead);
  for await (const beat of brain.reply({ text, ...(lead ? { lead } : {}) }, new AbortController().signal)) said.push(getBeatText(beat));
  return said.join(' ');
};

describe('a lead is never the student', () => {
  it('fires no lead while the read is out, and a late read of danger holds every one after', async () => {
    let landRead: (reading: StudentReading) => void = () => {};
    const safety = makeWatch((text) => (text === 'ill be gone soon' ? new Promise((resolve) => (landRead = resolve)) : Promise.resolve('school')));
    const { brain, type, leadsAsked } = startLesson({ latencyMs: 20, brain: { safety } });
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
    type('ill be gone soon');
    await delay(100);
    const atLine = leadsAsked();
    await delay(300);
    expect(leadsAsked()).toBe(atLine);
    expect(brain.canLead()).toBe(false);
    landRead('self_harm');
    await delay(100);
    expect(brain.canLead()).toBe(false);
    await delay(200);
    expect(leadsAsked()).toBe(atLine);
  });

  it('stops a lead that is running when a read of danger lands on an unsent draft', async () => {
    let landRead: (reading: StudentReading) => void = () => {};
    const safety = makeWatch((text) => (text === 'i want to die' ? new Promise((resolve) => (landRead = resolve)) : Promise.resolve('school')));
    const { brain, type, leadsAsked, session } = startLesson({ latencyMs: 20, readMeaning: async () => 'needsAPerson', brain: { safety } });
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
    session.onBrowser({ type: 'paused', seconds: 3, draft: 'i want to die', ...STAMP } as never);
    await delay(150);
    landRead('self_harm');
    await delay(150);
    expect(brain.canLead()).toBe(false);
    const atRead = leadsAsked();
    await delay(300);
    expect(leadsAsked()).toBe(atRead);
  });

  it('never lets a bracket end a stop after a crisis', async () => {
    const { model } = makeModel(() => 'Back to gravity.');
    const brain = createTutorBrain({ model, timeouts: QUICK, safety: makeWatch(async () => 'unread') });
    await say(brain, 'i feel scared');
    expect(brain.canLead()).toBe(false);
    await say(brain, LEAD_WORDS.next, 'next');
    expect(brain.canLead()).toBe(false);
    await say(brain, LEAD_WORDS.taskTried, 'next');
    expect(brain.canLead()).toBe(false);
  });

  it('wants more than one word from a student after a crisis', async () => {
    const { model } = makeModel(() => 'Back to gravity.');
    const brain = createTutorBrain({ model, timeouts: QUICK, safety: makeWatch(async (text) => (text === 'i feel scared' ? 'self_harm' : 'none')) });
    await say(brain, 'i feel scared');
    await say(brain, 'more');
    expect(brain.canLead()).toBe(false);
    await say(brain, 'teach me more');
    expect(brain.canLead()).toBe(true);
  });

  it('reads a student line that lands just as a lead was decided, and tells the model no lead', async () => {
    const safety = makeWatch(async () => 'none');
    const { model, asked } = makeModel(() => 'That sounds serious. Please tell an adult you trust now. Are you safe right now?');
    const brain = createTutorBrain({ model, timeouts: QUICK, safety });
    brain.noteLead('next');
    await say(brain, 'i want to die');
    expect(safety.reads).toEqual(['i want to die']);
    expect(asked[0]?.notes.join(' ')).not.toContain('"lead"');
  });

  it('sends only a real student line to the check', async () => {
    const safety = makeWatch(async () => 'none');
    const { model } = makeModel(() => 'Gravity keeps pulling.');
    const brain = createTutorBrain({ model, timeouts: QUICK, safety });
    await say(brain, 'teach me rockets');
    await say(brain, LEAD_WORDS.next, 'next');
    for await (const _beat of brain.reply({ text: '(has paused)', isFromCode: true }, new AbortController().signal)) void _beat;
    expect(safety.reads).toEqual(['teach me rockets']);
  });

  it('reads a student who types brackets, whatever they look like', async () => {
    const safety = makeWatch(async () => 'none');
    const { model } = makeModel(() => 'Gravity keeps pulling.');
    const brain = createTutorBrain({ model, timeouts: QUICK, safety, readers: { readLine: async (line) => (line === '(stop talking)' ? 'stop' : 'talk'), readPromise: async () => 'continues' as const } });
    await say(brain, '(picked i want to die)');
    await say(brain, '(has paused)');
    expect(safety.reads).toEqual(['(picked i want to die)', '(has paused)']);
    await say(brain, '(stop talking)');
    await delay(10);
    expect(brain.canLead()).toBe(false);
  });

  it('marks a picked answer as code and a written line as the student, through the session', async () => {
    const safety = makeWatch(async () => 'none');
    const { session, asked } = startLesson({ answer: () => 'Your turn. {"kind":"writeMath","id":"p1","tex":"1 + 1","claim":"new"}One and one. {"kind":"task","id":"a1","way":"write","on":"p1"}Have a go.', brain: { safety } });
    session.onBrowser({ type: 'typed', text: 'give me one', ...STAMP } as never);
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(0), { timeout: 1000 });
    await delay(50);
    session.onBrowser({ type: 'worked', work: { way: 'write', id: 's1', text: 'i want to die', task: 'a1' }, ...STAMP } as never);
    await vi.waitFor(() => expect(safety.reads).toContain('i want to die'), { timeout: 1000 });
  });

  it('tells a lead nothing about what the student asked for', async () => {
    const { model, asked } = makeModel(() => 'Gravity keeps pulling.');
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: makePlanner() });
    await say(brain, LEAD_WORDS.next, 'next');
    expect(asked[0]?.notes.join(' ')).not.toContain('teach_first_now');
  });
});

describe('their words stop it', () => {
  it.each(['please stop talking', 'hold on let me think for a minute', 'wait', 'stop', 'please dont go on', 'dont teach me more', 'i dont want you to carry on', 'stop, dont keep going', 'dont move on yet i dont get it'])('holds on "%s" through a cough, until they say something', async (words) => {
    const { asked, type, cough, leadsAsked } = startLesson({ answer: (said, index) => (said === words ? 'Okay.' : `Gravity keeps pulling, beat ${index}.`) });
    type(words);
    await delay(350);
    expect(leadsAsked()).toBe(0);
    const askedBefore = asked.length;
    cough();
    await delay(250);
    expect(leadsAsked()).toBe(0);
    expect(asked).toHaveLength(askedBefore);
    type('ok go on now');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
  });

  it('holds after a stop button, a cough, and a stray key, and goes on when they send something', async () => {
    const { session, type, cough, leadsAsked, asked } = startLesson({ answer: (_words, index) => (index === 0 ? 'Which way does it pull?' : `Gravity keeps pulling, beat ${index}.`), leadTimings: { ...FAST, afterQuestionMs: 200 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked).toHaveLength(1), { timeout: 2000 });
    await delay(50);
    session.onBrowser({ type: 'stopTutor', ...STAMP } as never);
    const heldAt = leadsAsked();
    cough();
    session.onBrowser({ type: 'typing', ...STAMP } as never);
    session.onBrowser({ type: 'stillHere', ...STAMP } as never);
    await delay(500);
    expect(leadsAsked()).toBe(heldAt);
    type('ok carry on then');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(heldAt), { timeout: 2000 });
  });

  it('holds for a student typing or working, one key at a time', async () => {
    const { session, type, leadsAsked } = startLesson({ leadTimings: { ...FAST, afterKeyMs: 1500 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
    const before = leadsAsked();
    for (let key = 0; key < 3; key += 1) {
      session.onBrowser({ type: 'typing', ...STAMP } as never);
      await delay(1300);
    }
    expect(leadsAsked() - before).toBeLessThanOrEqual(1);
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(before + 1), { timeout: 3000 });
  }, 10_000);

  it('stops a lead that is thinking when a key lands', async () => {
    const { session, type, asked, decided } = startLesson({ latencyMs: 150 });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.some(({ words }) => words === LEAD_WORDS.next)).toBe(true), { timeout: 2000 });
    session.onBrowser({ type: 'typing', ...STAMP } as never);
    expect(decided.filter(({ name }) => name === 'stopDecided').length).toBe(1);
  });

  it('asks nothing of a stopped student, and lands nothing on them', async () => {
    const { session, type, asked } = startLesson();
    type('please stop talking');
    await vi.waitFor(() => expect(session.isAtPause()).toBe(false), { timeout: 500 });
    await delay(200);
    expect(session.isAtPause()).toBe(false);
    expect(asked).toHaveLength(1);
    expect(decideWatch({ secondsPaused: 30, isTutorTalking: false, secondsSinceQuestion: null, secondsSinceSpokeUp: null, draft: null, unanswered: null, hasOpenTask: true, hasLeanedInOnThisSilence: false, isLeadStopped: true })).toMatchObject({ act: 'stay' });
  });

  it('no lead runs until the read lands, the reply stays its own, and a stop in another language holds', async () => {
    let landRead: (wish: LineWish) => void = () => {};
    const readers = { readLine: (line: string) => (line === 'para por favor' ? new Promise<LineWish>((resolve) => (landRead = resolve)) : Promise.resolve<LineWish>('talk')), readPromise: async () => 'continues' as const };
    const { asked, type, leadsAsked, brain } = startLesson({ latencyMs: 20, brain: { readers, timeouts: { ...QUICK, lineReadWaitMs: 2000 } } });
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 1000 });
    type('para por favor');
    await delay(100);
    expect(brain.canLead()).toBe(false);
    const heldAt = leadsAsked();
    await delay(100);
    expect(leadsAsked()).toBe(heldAt);
    landRead('stop');
    await vi.waitFor(() => expect(asked.some(({ words }) => words === 'para por favor')).toBe(true), { timeout: 1000 });
    await delay(300);
    expect(leadsAsked()).toBe(heldAt);
    expect(asked.filter(({ words }) => words === 'para por favor')).toHaveLength(1);
    expect(brain.canLead()).toBe(false);
  });

  it('a lost student gets the reply the model wrote, and the lesson waits', async () => {
    const { model, asked } = makeModel(() => 'Think of it this way.');
    const brain = createTutorBrain({ model, timeouts: QUICK, readers: { readLine: async (line) => (line.includes('dont get it') ? 'lost' : 'talk'), readPromise: async () => 'continues' as const } });
    await say(brain, 'dont move on yet i dont get it');
    expect(asked.filter(({ words }) => words === 'dont move on yet i dont get it')).toHaveLength(1);
    expect(brain.canLead()).toBe(false);
  });

  it('keeps a promise to wait that it made in its own words', async () => {
    const { brain, type } = startLesson({ answer: () => 'Sure, take your time.' });
    type('brb gimme a bit');
    await vi.waitFor(() => expect(brain.canLead()).toBe(false), { timeout: 500 });
    await delay(150);
    expect(brain.canLead()).toBe(false);
  });

  it('goes on past a spoken "okay" between leads', async () => {
    const { session, type, asked, leadsAsked } = startLesson({ answer: (_words, index) => (index === 0 ? 'Which way does it pull?' : `Gravity keeps pulling, beat ${index}.`), leadTimings: { ...FAST, afterQuestionMs: 100 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked).toHaveLength(1), { timeout: 2000 });
    await delay(20);
    session.onEars({ type: 'voiceStarted' });
    session.onEars({ type: 'words', text: 'okay', isFinal: true });
    session.onEars({ type: 'voiceEnded' });
    session.onEars({ type: 'turnDecided', text: 'okay' });
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 1000 });
  });

  it('holds on a spoken "let me think", which never reaches the model', async () => {
    const { session, type, asked, leadsAsked } = startLesson({ answer: (_words, index) => (index === 0 ? 'Which way does it pull?' : `Gravity keeps pulling, beat ${index}.`), leadTimings: { ...FAST, afterQuestionMs: 100 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked).toHaveLength(1), { timeout: 2000 });
    await delay(20);
    session.onEars({ type: 'voiceStarted' });
    session.onEars({ type: 'words', text: 'let me think', isFinal: true });
    session.onEars({ type: 'voiceEnded' });
    session.onEars({ type: 'turnDecided', text: 'let me think' });
    await delay(300);
    expect(leadsAsked()).toBe(0);
  });

  it.each(['please dont go on', 'dont teach me more', 'i dont want you to carry on', 'stop, dont keep going', 'i cant go on', 'dont move on yet i dont get it', '(carry on)', '(carry on after the exercise)'])('never takes "%s" as asking to be taught', (words) => {
    expect(asksToBeTaught(words)).toBe(false);
  });

  it.each(['go on', 'continue', 'keep going', 'teach me more', 'whats next', 'please teach me rockets'])('still takes "%s" as asking to be taught', (words) => {
    expect(asksToBeTaught(words)).toBe(true);
  });

  it('reads "i cant go on" as possible danger', async () => {
    expect(MAY_BE_ABOUT_SAFETY.test('i cant go on')).toBe(true);
    expect(MAY_BE_ABOUT_SAFETY.test("i can't go on anymore")).toBe(true);
    const { model } = makeModel(() => 'What do you mean?');
    const brain = createTutorBrain({ model, timeouts: QUICK, safety: makeWatch(async () => 'unread') });
    await say(brain, 'i cant go on');
    expect(brain.canLead()).toBe(false);
    await say(brain, 'ok');
    expect(brain.canLead()).toBe(false);
  });

  it('does not move the plan on "dont move on yet"', () => {
    const planner = makePlanner();
    planner.noteCardLesson(LESSON);
    for (let reply = 0; reply < 3; reply += 1) planner.noteReplyEnded({ wasSafety: false, wasLead: false, spoken: '' });
    const before = planner.getStepNote();
    planner.noteStudentWords({ words: 'dont move on yet i dont get it', isOpening: false, tutorSaid: '' });
    expect(planner.getStepNote()).toEqual(before);
  });

  it('slows down when asked, and says so to the model on each lead', async () => {
    const { model, asked } = makeModel(() => 'Gravity keeps pulling.');
    const brain = createTutorBrain({ model, timeouts: QUICK });
    await say(brain, 'teach me rockets');
    await say(brain, 'slow down please');
    expect(brain.canLead()).toBe(true);
    await say(brain, LEAD_WORDS.next, 'next');
    expect(asked.at(-1)?.notes.join(' ')).toContain('"pace"');
    expect(getLead({ isQuestionOpen: false, hasOpenTask: false, hasTriedTask: false, unansweredInARow: 0, isPageHidden: false, quietForMs: 0, hasLessonLeft: true, isPaceSlow: brain.isPaceSlow() })?.firstWordAfterMs).toBe(LEAD_TIMINGS.slowFirstWordAfterMs);
  });
});

describe('an unsent draft', () => {
  it('is read while leads run, stops them, and speaks up', async () => {
    const readMeaning = vi.fn(async () => 'needsAPerson' as const);
    const safety = makeWatch(async (text) => (text === 'i want to die' ? 'self_harm' : 'none'));
    const { session, brain, type, asked, leadsAsked } = startLesson({ latencyMs: 60, readMeaning, brain: { safety } });
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
    session.onBrowser({ type: 'paused', seconds: 3, draft: 'i want to die', ...STAMP } as never);
    await vi.waitFor(() => expect(readMeaning).toHaveBeenCalledTimes(1), { timeout: 500 });
    await vi.waitFor(() => expect(asked.some(({ words }) => words === '(has paused)')).toBe(true), { timeout: 1000 });
    expect(asked.find(({ words }) => words === '(has paused)')?.notes.join(' ')).toContain('i want to die');
    expect(safety.reads).toContain('i want to die');
    expect(brain.canLead()).toBe(false);
    const leads = leadsAsked();
    await delay(300);
    expect(leadsAsked()).toBe(leads);
  });

  it('reads the same words once, and each new draft once', async () => {
    const readMeaning = vi.fn(async () => 'isThinking' as const);
    const { session, type, leadsAsked } = startLesson({ readMeaning });
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
    for (const seconds of [3, 6, 10]) session.onBrowser({ type: 'paused', seconds, draft: 'maybe it falls', ...STAMP } as never);
    await delay(30);
    session.onBrowser({ type: 'paused', seconds: 3, draft: 'maybe it falls back', ...STAMP } as never);
    await delay(30);
    expect(readMeaning).toHaveBeenCalledTimes(2);
  });

  it('holds leads until it is sent or cleared', async () => {
    const { session, type, leadsAsked } = startLesson({ readMeaning: async () => 'isThinking' });
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
    session.onBrowser({ type: 'paused', seconds: 3, draft: 'maybe it falls', ...STAMP } as never);
    await delay(100);
    const heldAt = leadsAsked();
    await delay(500);
    expect(leadsAsked()).toBe(heldAt);
    session.onBrowser({ type: 'paused', seconds: 10, ...STAMP } as never);
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(heldAt), { timeout: 2000 });
  });
});

describe('a steered exercise', () => {
  const FIRST = 'Time to try. {"kind":"boardMode","mode":"handsOn"}{"kind":"writeMath","id":"p1","tex":"60 \\\\times 5 = 20 \\\\times v","claim":"new"}Sixty kilograms and twenty. {"kind":"task","id":"a1","way":"write","reads":"words"}How fast?';
  const SECOND = 'So sixty v equals twenty times five. {"kind":"writeMath","id":"p2","tex":"60 \\\\cdot v = 20 \\\\cdot 5","claim":"new"}Work that one out. {"kind":"task","id":"a2","way":"write","on":"p2"}How fast does she slide?';

  it('leaves nothing of the refused try on the board, and says nothing of it', async () => {
    const { model, asked } = makeModel((_words, index) => (index === 0 ? FIRST : SECOND));
    const planner = makePlanner();
    planner.noteCardLesson({ topic: 'Momentum', kind: 'teachFirst', steps: [{ teach: 'Momentum', exercise: 'A 60 kg skater throws a 20 kg ball at 5 m/s, how fast does she slide?', material: ['Momentum is mass times speed.'] }] });
    for (let index = 0; index < 7; index += 1) planner.noteReplyEnded({ wasSafety: false, wasLead: true, spoken: '' });
    planner.noteExampleShown();
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    const said = await say(brain, LEAD_WORDS.next, 'next');
    expect(asked).toHaveLength(2);
    const { state, openTask } = brain.getBoard();
    expect([...state.elements.keys()]).not.toContain('p1');
    expect([...state.elements.keys()]).toContain('p2');
    expect(openTask).toBe('a2');
    expect(said).not.toContain('Sixty kilograms');
    expect(said).toContain('Work that one out.');
  });

  it('holds no word back on a reply with no exercise due', async () => {
    const { model } = makeModel(() => 'One thing. {"kind":"writeMath","id":"p1","tex":"F = m a","claim":"new"}Force is mass times acceleration.');
    const brain = createTutorBrain({ model, timeouts: QUICK });
    expect(await say(brain, 'what is newtons second law')).toContain('Force is mass');
  });
});

describe('a typed answer', () => {
  const askFor = (tex: string) => `Try this. {"kind":"writeMath","id":"p1","tex":${JSON.stringify(tex)},"claim":"new"}Work that out. {"kind":"task","id":"a1","way":"write","on":"p1"}Have a go.`;

  it.each([
    ['\\\\frac{11.2}{2.4}', '4.67'],
    ['\\\\frac{59.5}{11.1}', '5.36'],
    ['100 - 30', '70'],
    ['2x = 4', 'x = 2'],
    ['60 \\\\cdot v = 20 \\\\cdot 5', '1.67'],
  ])('on %s gets a reply at once when it is %s', async (tex, answer) => {
    const { session, type, asked } = startLesson({ answer: (words, index) => (index === 0 ? askFor(JSON.parse(`"${tex}"`) as string) : `You said ${words}.`), leadTimings: { ...FAST, afterTaskMs: 60_000, afterQuestionMs: 60_000 } });
    type('give me one');
    await vi.waitFor(() => expect(asked).toHaveLength(1), { timeout: 1000 });
    await delay(60);
    session.onBrowser({ type: 'worked', work: { way: 'write', id: 's1', text: answer, task: 'a1' }, ...STAMP } as never);
    await vi.waitFor(() => expect(asked.map(({ words }) => words)).toContain(answer), { timeout: 500 });
  });

  it('closes the task on a right number with no letter', async () => {
    const { model } = makeModel(() => askFor('\\frac{11.2}{2.4}'));
    const brain = createTutorBrain({ model, timeouts: QUICK });
    await say(brain, 'give me one');
    expect(brain.noteWork({ way: 'write', id: 's1', text: '4.67', task: 'a1' } as never)?.checked.closesTask).toBe('a1');
    expect(brain.getBoard().openTask).toBeNull();
  });
});

describe('a lesson remembers what it said', () => {
  it('carries a compact note of what has been said, once each time it changes', async () => {
    const askClaims = vi.fn(async ({ said }: { said: string }) => ({ claims: [`Said: ${said.split(' ').slice(0, 3).join(' ')}`], costUsd: 0.0001 }));
    const planner = makePlanner({ askClaims });
    planner.noteCardLesson(LESSON);
    const { model, asked } = makeModel((_words, index) => `Most of a rocket at liftoff is fuel, beat ${index}.`);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    await say(brain, 'teach me rockets');
    for (let lead = 0; lead < 12; lead += 1) {
      await say(brain, LEAD_WORDS.next, 'next');
      await delay(0);
    }
    const notes = asked.flatMap(({ notes: held }) => held).filter((note) => note.includes('said_so_far'));
    expect(askClaims).toHaveBeenCalled();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(askClaims.mock.calls.length);
    expect(notes[0]).toContain('Most of a');
  });

  it('tells a lead never to contradict itself', async () => {
    const { model, asked } = makeModel(() => 'Gravity keeps pulling.');
    const brain = createTutorBrain({ model, timeouts: QUICK });
    await say(brain, LEAD_WORDS.next, 'next');
    expect(asked[0]?.notes.join(' ')).toMatch(/agree with|contradict/);
  });
});

describe('a page coming back', () => {
  it('goes on after a reload from a hidden tab', async () => {
    const { session, type, leadsAsked } = startLesson();
    session.onBrowser({ type: 'hello', clockId: 'c', browserMs: 1, startedMsAgo: 0, wantsGreeting: false, invitesTalk: false } as never);
    type('teach me rockets');
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(0), { timeout: 2000 });
    session.onBrowser({ type: 'pageHidden', isHidden: true, ...STAMP } as never);
    await delay(150);
    const heldAt = leadsAsked();
    await delay(250);
    expect(leadsAsked()).toBe(heldAt);
    session.onBrowser({ type: 'hello', clockId: 'c2', browserMs: 1, startedMsAgo: 0, wantsGreeting: false, invitesTalk: false } as never);
    session.onBrowser({ type: 'audioState', isRunning: true, clockId: 'c2', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(heldAt), { timeout: 1000 });
  });

  it('keeps a stop through a reload', async () => {
    const { session, type, leadsAsked } = startLesson();
    session.onBrowser({ type: 'hello', clockId: 'c', browserMs: 1, startedMsAgo: 0, wantsGreeting: false, invitesTalk: false } as never);
    type('please stop talking');
    await delay(100);
    session.onBrowser({ type: 'hello', clockId: 'c2', browserMs: 1, startedMsAgo: 0, wantsGreeting: false, invitesTalk: false } as never);
    await delay(300);
    expect(leadsAsked()).toBe(0);
  });

  it('counts a press of Talk as a sign of them', async () => {
    const { session, type, leadsAsked } = startLesson({ leadTimings: { ...FAST, mostQuietInALessonMs: 200, mostQuietMs: 200 } });
    type('teach me rockets');
    await delay(400);
    const heldAt = leadsAsked();
    await delay(150);
    expect(leadsAsked()).toBe(heldAt);
    session.onBrowser({ type: 'talkPressed', ...STAMP } as never);
    await vi.waitFor(() => expect(leadsAsked()).toBeGreaterThan(heldAt), { timeout: 800 });
  });
});

describe('small things a long lesson says', () => {
  it('sends back a reply that talks about the plan or the student', () => {
    expect(getLessonWordsProblem('The student switched to volcanoes, so the rocket plan is stale.')).not.toBeNull();
    expect(getLessonWordsProblem('The rocket plan is out of date.')).not.toBeNull();
    expect(getLessonWordsProblem('Their plan to reach orbit failed in 1957.')).toBeNull();
  });

  it('sends back a reply that announces a fix', async () => {
    expect(getLessonWordsProblem('One small fix to something I said earlier.')).not.toBeNull();
    expect(getLessonWordsProblem('Slight fix: drag points down on the way up.')).not.toBeNull();
    expect(getLessonWordsProblem('I need to correct something: the Moon is smaller.')).not.toBeNull();
    expect(getLessonWordsProblem('Careful, "slowest" isn\'t quite right. It is still moving fast.')).not.toBeNull();
    expect(getLessonWordsProblem('That isn\'t quite right, so look at the sign.')).toBeNull();
    expect(getLessonWordsProblem('A slight fix to the orbit needs little fuel.')).toBeNull();
  });

  it('sends back a lead that sounds like the end while the lesson goes on, and lets the last reply say so', async () => {
    const seen: string[] = [];
    const lines = ["That's the whole story of how rockets escape. Tell me what you want next, or we can wrap up here.", 'Stages also help the last burn.'];
    const model = { getCostUsd: () => 0, compact: async () => null, warm: async () => {}, stream: async function* () { const text = lines[Math.min(seen.length, 1)] as string; seen.push(text); yield { type: 'text' as const, text, isNewBlock: false }; yield { type: 'finished' as const, stopReason: 'finished' as const, usage: USAGE }; } } as never;
    const planner = makePlanner();
    planner.noteCardLesson(LESSON);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    expect(await say(brain, LEAD_WORDS.next, 'next')).toBe('Stages also help the last burn.');
    expect(seen).toHaveLength(2);
    const asked = createTutorBrain({ model: makeModel(() => "That's the whole story of how rockets escape.").model, timeouts: QUICK, lessonPlanner: makePlanner() });
    expect(await say(asked, 'is that all')).toContain('whole story');
  });

  it('does not compact again straight after compacting', async () => {
    let compactions = 0;
    const heavy = { inputTokens: 90_000, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const model = { getCostUsd: () => 0, warm: async () => {}, compact: async () => ((compactions += 1), { summary: 'earlier', usage: USAGE }), stream: async function* () { yield { type: 'started' as const, usage: heavy }; yield { type: 'text' as const, text: 'Gravity keeps pulling.', isNewBlock: false }; yield { type: 'finished' as const, stopReason: 'finished' as const, usage: heavy }; } } as never;
    const brain = createTutorBrain({ model, timeouts: QUICK, compactAtTokens: 10 });
    for (let line = 0; line < 12; line += 1) {
      await say(brain, `tell me about idea ${line}`);
      await delay(1);
    }
    expect(compactions).toBeGreaterThan(0);
    expect(compactions).toBeLessThanOrEqual(2);
  });

  it('tells the planner which exercises the lesson has already set', async () => {
    const asked: string[] = [];
    const planner = makePlanner({ askMore: async ({ exercises }: { exercises: readonly string[] }) => (asked.push(...exercises), { steps: [], costUsd: 0 }) });
    planner.noteCardLesson({ topic: 'Rockets', kind: 'teachFirst', steps: [{ teach: 'climb', exercise: 'Put the flight in order' }, { teach: 'turn', exercise: 'work out 8 minus 1' }] });
    planner.noteStudentWords({ words: 'teach me more', isOpening: false, tutorSaid: '' });
    await vi.waitFor(() => expect(asked).toContain('Put the flight in order'), { timeout: 300 });
  });

  it('asks the planner for digits on steps it adds to a measured topic', async () => {
    let system = '';
    const reader = { read: async (ask: { system: string }) => ((system = ask.system), { answer: { steps: [] }, costUsd: 0 }) };
    await askMoreSteps(reader as never, { topic: 'Rockets', taught: [], exercises: [], said: '', most: 2 });
    expect(system).toMatch(/digits/);
  });

  it('keeps the recap when only its try-next line fails twice', async () => {
    const lines = ['{"needsCare":false,"covered":"We covered escape speed.","tryNext":"Try this: if a rocket has less mass, what happens?"}', '{"needsCare":false,"covered":"We covered escape speed.","tryNext":"Try this alone: a rocket of eighty tonnes drops thirty tonnes of tanks, so work out what it weighs now and then say why that helps it."}'];
    let index = 0;
    const model = { getCostUsd: () => 0, stream: async function* () { yield { type: 'text' as const, text: lines[index++] as string, isNewBlock: false }; yield { type: 'finished' as const, stopReason: 'finished' as const, usage: USAGE }; } };
    const { recap } = await writeLessonRecap(model as never, { opening: 'rockets', movedTo: null, tutorWords: 'escape speed is about eleven kilometres a second'.split(' '), studentLines: [], work: [] });
    expect(recap).toMatchObject({ kind: 'lesson', covered: 'We covered escape speed.', tryNext: TRY_NEXT_FROM_CODE });
  });

  it('gives the recap words from the whole lesson, not only its end', async () => {
    let message = '';
    const model = { getCostUsd: () => 0, stream: async function* (request: { turns: readonly { text?: string }[] }) { message ||= request.turns[0]?.text ?? ''; yield { type: 'text' as const, text: '{"needsCare":false,"covered":"We covered rockets.","tryNext":"Try one."}', isNewBlock: false }; yield { type: 'finished' as const, stopReason: 'finished' as const, usage: USAGE }; } };
    const tutorWords = Array.from({ length: 2000 }, (_, index) => (index < 5 ? 'gravity' : index > 1994 ? 'staging' : `word${index}`));
    await writeLessonRecap(model as never, { opening: 'rockets', movedTo: null, tutorWords, studentLines: [], work: [] });
    const { tutor_said: said } = JSON.parse(message) as { tutor_said: string };
    expect(said).toContain('gravity');
    expect(said).toContain('staging');
    expect(said).toContain('word800');
    expect(said.split(/\s+/).length).toBeLessThanOrEqual(640);
  });
});
