import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoreAsk } from '../src/lesson-plan/ask-planner.ts';
import type { LessonPlan, LessonStep } from '../src/lesson-plan/lesson-plan.ts';
import { createLessonPlanner } from '../src/lesson-plan/lesson-planner.ts';
import { LEAD_NOTES } from '../src/lesson-plan/lesson-rules.ts';
import { getStateAfterEvent, getStateAfterMove, getStateWithMoreSteps, getStepNote, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { LEAD_TIMINGS, LEAD_WORDS } from '../src/live/tutor-lead.ts';
import { createVoiceLine } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STAMP = { clockId: 'c', browserMs: 1, startedMsAgo: 0 };
const FAST = { ...LEAD_TIMINGS, firstWordAfterMs: 20, afterStudentSignMs: 20, slowFirstWordAfterMs: 400, afterQuestionMs: 150, afterQuestionAgainMs: 100, afterTaskMs: 200, afterTaskAgainMs: 150, afterTaskTriedMs: 50, afterKeyMs: 250 };
const QUICK = { firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 5, safetyReadWaitMs: 40 };
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const TASK = 'Okay, try this one. {"kind":"boardMode","mode":"handsOn"}{"kind":"task","id":"a1","way":"write","reads":"words"}Name one more problem Rome had.';
const ROME: LessonPlan = { topic: 'Why the Roman Empire fell', kind: 'handsOn', steps: [{ teach: null, exercise: 'Name two reasons a big empire could fall apart.' }] };
const MORE_ROME: readonly LessonStep[] = [
  { teach: 'Rome split into an east and a west', exercise: 'Put these in order: Rome splits, the west falls, Constantinople is founded.' },
  { teach: 'Armies from outside crossed the borders', exercise: 'Match each group to what it did.' },
];

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}
const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('hello', 'greeting', 'Hello there.'), makeTake('prompt', 'prompt', 'Take your time.'), makeTake('lost', 'voiceLost', 'Sorry about that.')];

interface Asked {
  words: string;
  notes: string;
}

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

function startRome({ more = () => [], leadTimings = FAST }: { more?(ask: MoreAsk, index: number): readonly LessonStep[]; leadTimings?: typeof FAST } = {}) {
  const asked: Asked[] = [];
  let hasSetTask = false;
  const model = {
    getCostUsd: () => 0,
    compact: async () => null,
    warm: async () => {},
    async *stream(request: { turns: readonly { role: string; text?: string }[] }, signal: AbortSignal) {
      const lastUserAt = request.turns.map(({ role }) => role).lastIndexOf('user');
      const words = request.turns[lastUserAt]?.text ?? '';
      asked.push({ words, notes: request.turns.slice(lastUserAt + 1).flatMap(({ text }) => text ?? []).join(' ') });
      if (signal.aborted) return;
      const isFirstLead = words === LEAD_WORDS.next && !hasSetTask;
      hasSetTask ||= isFirstLead;
      const text = asked.length === 1 ? 'Rome grew too big to run.' : isFirstLead ? TASK : words.startsWith('(') ? 'More of the story, said by itself.' : 'Invasion, yes. Want to look at what happened in 476?';
      yield { type: 'text' as const, text, isNewBlock: false };
      yield { type: 'finished' as const, stopReason: 'finished' as const, usage: USAGE };
    },
  };
  const moreAsks: MoreAsk[] = [];
  const planner = createLessonPlanner({
    ask: async () => ({ move: { move: 'new', plan: ROME }, costUsd: 0 }),
    askMore: async (ask) => ({ steps: more(ask, moreAsks.push(ask) - 1), costUsd: 0 }),
    canSpend: () => true,
    charge: () => {},
    onTitleChange: () => {},
    trace: () => {},
  });
  const brain = createTutorBrain({ model: model as never, timeouts: QUICK, lessonPlanner: planner, readers: { readLine: async () => 'talk', readPromise: async () => 'continues' } });
  const session = createLiveSession({
    messenger: { send: () => {}, sendOnBothChannels: () => {} },
    line: createVoiceLine({ sampleRate: 24000, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} }),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts() as tts.TTS,
    tutor: brain,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    leadTimings,
  });
  sessions.push(session);
  session.onBrowser({ type: 'audioState', isRunning: true, ...STAMP } as never);
  const type = (text: string) => session.onBrowser({ type: 'typed', text, ...STAMP } as never);
  const answerTask = async () => {
    await vi.waitFor(() => expect(brain.getBoard().openTask).not.toBeNull(), { timeout: 2000 });
    session.onBrowser({ type: 'worked', work: { way: 'write', id: 's1', text: 'Invasion', task: 'a1' }, ...STAMP } as never);
  };
  const closings = () => asked.filter(({ notes }) => notes.includes(LEAD_NOTES.closing)).length;
  type('why did the roman empire fall');
  return { asked, brain, planner, moreAsks, type, answerTask, closings };
}

describe('a lesson that starts on a direct question', () => {
  it('asks for the next ideas while the student is still on the question, and goes on to them by itself', async () => {
    const { asked, planner, moreAsks, answerTask } = startRome({ more: (_ask, index) => (index === 0 ? MORE_ROME : []) });
    await vi.waitFor(() => expect(moreAsks).toHaveLength(1), { timeout: 2000 });
    expect(moreAsks[0]).toMatchObject({ topic: ROME.topic, exercises: [ROME.steps[0]?.exercise] });
    await answerTask();
    await vi.waitFor(() => expect(planner.getStepNote()).toMatchObject({ step: '2 of 3', kind: 'teachFirst', teach_first: MORE_ROME[0]?.teach }), { timeout: 2000 });
    const atStepTwo = asked.length;
    await vi.waitFor(() => expect(asked.slice(atStepTwo).filter(({ words }) => words === LEAD_WORDS.next).length).toBeGreaterThan(2), { timeout: 3000 });
  });

  it('teaches an idea it goes on to before setting its exercise, and a question of their own still goes straight to the board', () => {
    const onQuestion = getStateAfterMove(NO_LESSON, { move: 'new', plan: ROME });
    expect(getStepNote(getStateAfterEvent(onQuestion, 'replyEnded'))).toMatchObject({ kind: 'handsOn', exercise_due: true });
    const grown = getStateWithMoreSteps(onQuestion, ROME.topic, [{ teach: 'Coins lost their worth', exercise: 'A coin held 10 grams of silver, then 5. What share is left?' }]);
    const onIdea = getStateAfterEvent(getStateAfterEvent(grown, 'exerciseSet'), 'exerciseDone');
    expect(getStepNote(getStateAfterEvent(onIdea, 'replyEnded'))).not.toHaveProperty('exercise_due');
    const taught = [1, 2, 3].reduce((state) => getStateAfterEvent(state, 'leadEnded'), onIdea);
    expect(getStepNote(taught)).toMatchObject({ kind: 'teachFirst', worked_example_due: true });
  });
});

describe('a plan that has run out', () => {
  it('answers its own question after the usual wait, closes warmly once, and then holds', async () => {
    const { asked, brain, answerTask, closings } = startRome();
    await answerTask();
    await vi.waitFor(() => expect(closings()).toBe(1), { timeout: 2000 });
    expect(asked.at(-1)?.words).toBe(LEAD_WORDS.noAnswer);
    await vi.waitFor(() => expect(brain.isLeadStopped()).toBe(true), { timeout: 1000 });
    const atClose = asked.length;
    await delay(600);
    expect(asked).toHaveLength(atClose);
  });

  it('closes for a student who never said a word, after it has finished the exercise they left', async () => {
    const { asked, closings } = startRome();
    await vi.waitFor(() => expect(closings()).toBe(1), { timeout: 3000 });
    const leads = asked.map(({ words }) => words);
    expect(leads.indexOf(LEAD_WORDS.taskLeft)).toBeGreaterThan(-1);
    expect(leads.indexOf(LEAD_WORDS.taskLeft)).toBeLessThan(leads.length - 1);
    expect(asked.filter(({ words }) => words === LEAD_WORDS.taskLeft).every(({ notes }) => !notes.includes(LEAD_NOTES.closing))).toBe(true);
  });

  it('still closes for a student who has listened past the quiet limit', async () => {
    const { closings } = startRome({ leadTimings: { ...FAST, mostQuietMs: 50 } });
    await vi.waitFor(() => expect(closings()).toBe(1), { timeout: 3000 });
  });

  it('answers anything real they say after the close, and closes again, but a thanks gets no second goodbye', async () => {
    const { brain, type, answerTask, closings } = startRome();
    await answerTask();
    await vi.waitFor(() => expect(brain.isLeadStopped()).toBe(true), { timeout: 2000 });
    type('thanks');
    await delay(500);
    expect(closings()).toBe(1);
    expect(brain.isLeadStopped()).toBe(true);
    type('what happened to the eastern half');
    await vi.waitFor(() => expect(closings()).toBe(2), { timeout: 2000 });
  });

  it('goes on again when they ask to be taught more', async () => {
    const { brain, planner, type, answerTask, moreAsks } = startRome({ more: (_ask, index) => (index === 0 ? [] : MORE_ROME) });
    await answerTask();
    await vi.waitFor(() => expect(brain.isLeadStopped()).toBe(true), { timeout: 2000 });
    type('teach me more');
    await vi.waitFor(() => expect(moreAsks.length).toBeGreaterThan(1), { timeout: 2000 });
    await vi.waitFor(() => expect(planner.getStepNote()).toMatchObject({ step: '2 of 3' }), { timeout: 2000 });
    await vi.waitFor(() => expect(brain.canLead()).toBe(true), { timeout: 2000 });
  });
});
