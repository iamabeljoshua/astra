import { type Beat, getBeatText, parseBeat, type AgentMessage } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCardPictures, toCardPlan, parseCardMaterial } from '../src/lesson-plan/card-lesson.ts';
import { createLessonPlanner, getTeachFirstNote } from '../src/lesson-plan/lesson-planner.ts';
import { getStateAfterEvent, getStateAfterMove, getStepNote, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { LEAD_TIMINGS, LEAD_WORDS, type LeadKind } from '../src/live/tutor-lead.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createTutorBrain, type TurnSummary, type TutorBeat, type TutorBrain } from '../src/tutor/brain.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MATERIAL = parseCardMaterial({
  title: 'How a rocket escapes Earth',
  ideas: [
    { title: 'How a rocket escapes Earth', lines: ['Throw a ball up, and it always comes back down.', 'Think of rolling a ball up a hill that keeps getting gentler.'], hasScene: true },
    { title: 'Why rockets drop their empty stages', lines: ['An empty tank is dead weight.'], hasScene: true },
    { title: 'How an orbit is really falling sideways', lines: [], hasScene: false },
  ],
});
if (!MATERIAL) throw new Error('The material should read.');
const PLAN = toCardPlan(MATERIAL);
const atCard = () => getStateAfterMove(NO_LESSON, { move: 'new', plan: PLAN });
const afterReplies = (count: number, state = atCard()) => Array.from({ length: count }).reduce<typeof state>((next) => getStateAfterEvent(next, 'replyEnded'), state);

describe('a lesson from a card', () => {
  it('takes its steps from the real material, in order, with the card first', () => {
    expect(PLAN.topic).toBe('How a rocket escapes Earth');
    expect(PLAN.kind).toBe('teachFirst');
    expect(PLAN.steps.map(({ teach }) => teach)).toEqual(['How a rocket escapes Earth', 'Why rockets drop their empty stages', 'How an orbit is really falling sideways']);
  });

  it('tells the tutor the lines to put in its own words, and that a saved picture is coming on a new step', () => {
    expect(getStepNote(atCard())).toMatchObject({ step: '1 of 3', material: ['Throw a ball up, and it always comes back down.', 'Think of rolling a ball up a hill that keeps getting gentler.'] });
    const second = getStateAfterEvent(atCard(), 'movedOn');
    expect(getStepNote(second)).toMatchObject({ step: '2 of 3', picture_coming: true });
    expect(getStepNote(getStateAfterEvent(second, 'replyEnded'))).not.toHaveProperty('picture_coming');
    const last = getStateAfterEvent(second, 'movedOn');
    expect(getStepNote(last)).toMatchObject({ step: '3 of 3', teach_first: 'How an orbit is really falling sideways' });
    expect(getStepNote(last)).not.toHaveProperty('picture_coming');
    expect(getStepNote(last)).not.toHaveProperty('material');
  });

  it('feeds the queue its own pictures, as long as each is still on the shelf, and leaves any other plan to the model', () => {
    expect(getCardPictures(PLAN, ['How a rocket escapes Earth'])).toEqual(['How a rocket escapes Earth', null, null]);
    expect(getCardPictures({ topic: 'Fractions', kind: 'teachFirst', steps: [{ teach: 'Top', exercise: 'Name it' }] }, ['Top'])).toBeNull();
  });

  it('refuses what the server should never have sent', () => {
    expect(parseCardMaterial(null)).toBeNull();
    expect(parseCardMaterial({ title: '', ideas: [] })).toBeNull();
    expect(parseCardMaterial({ title: 'A', ideas: [{ title: 'A', lines: 'no', hasScene: true }] })).toMatchObject({ ideas: [{ title: 'A', lines: [], hasScene: true }] });
  });

  it('teaches for longer on a card, then asks for the exercise, and stops repeating the lines once it is due', () => {
    expect(getStepNote(afterReplies(2))).not.toHaveProperty('exercise_due');
    const due = getStepNote(afterReplies(3));
    expect(due).toMatchObject({ exercise_due: true });
    expect(due).not.toHaveProperty('material');
  });

  it('moves through every step for a student who said no exercises', () => {
    let state = getStateAfterEvent(atCard(), 'exerciseDeclined');
    state = afterReplies(3, state);
    expect(getStepNote(state)).toMatchObject({ step: '2 of 3' });
    state = afterReplies(3, state);
    expect(getStepNote(state)).toMatchObject({ step: '3 of 3' });
  });
});

describe('asking to be taught', () => {
  it('ends the exercise that was due, and moves on, because this step has been taught', () => {
    const state = getStateAfterEvent(afterReplies(3), 'teachingWanted');
    expect(getStepNote(state)).not.toHaveProperty('exercise_due');
    expect(getStepNote(state)).toMatchObject({ step: '2 of 3' });
  });

  it('starts the count over and stays when the step has barely begun', () => {
    const state = getStateAfterEvent(afterReplies(2), 'teachingWanted');
    expect(getStepNote(state)).toMatchObject({ step: '1 of 3' });
    expect(getStepNote(afterReplies(2, state))).not.toHaveProperty('exercise_due');
    expect(getStepNote(afterReplies(3, state))).toMatchObject({ exercise_due: true });
  });

  it('moves on after an exercise they left, which already taught this step', () => {
    let state = getStateAfterEvent(afterReplies(3), 'exerciseSet');
    state = getStateAfterEvent(state, 'exerciseLeft');
    expect(getStepNote(getStateAfterEvent(state, 'teachingWanted'))).toMatchObject({ step: '2 of 3' });
  });

  function plannerAtDue(wants: string | null = null) {
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, wants, costUsd: 0 }) as never, canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson(PLAN);
    for (let reply = 0; reply < 3; reply += 1) planner.noteReplyEnded({ wasSafety: false });
    expect(planner.getStepNote()).toMatchObject({ exercise_due: true });
    return planner;
  }

  it.each(['So, what\'s next? Teach me more', 'go on', 'Go on please', 'teach me more', 'keep going', 'tell me more', 'tell me more about stages', "what's next", 'what is next?', 'and then what', 'what else', 'carry on', 'continue', 'next', 'more', 'ok move on', 'show me more', 'keep teaching me'])('reads "%s" as a wish to be taught', (words) => {
    const planner = plannerAtDue();
    planner.noteStudentWords({ words, isOpening: false, tutorSaid: 'Weaker gravity, so a lower speed.' });
    expect(planner.getStepNote()).not.toHaveProperty('exercise_due');
  });

  it.each(['i think it needs less', "what's next to the sun", 'give me one to try', 'more speed', 'go on a trip', 'i dont know what comes next'])('does not read "%s" as one', (words) => {
    const planner = plannerAtDue();
    planner.noteStudentWords({ words, isOpening: false, tutorSaid: 'Weaker gravity, so a lower speed.' });
    expect(planner.getStepNote()).toMatchObject({ exercise_due: true });
  });

  it('takes the same wish from the planner, in words no list holds', async () => {
    const planner = plannerAtDue('teaching');
    planner.noteStudentWords({ words: 'enséñame más, por favor', isOpening: false, tutorSaid: 'Weaker gravity, so a lower speed.' });
    await planner.whenSettled();
    expect(planner.getStepNote()).not.toHaveProperty('exercise_due');
  });

  it('holds this reply to teaching, with nothing set', () => {
    expect(getTeachFirstNote("So, what's next? Teach me more", false)).toMatchObject({ teach_first_now: expect.any(String) });
    expect(getTeachFirstNote('go on', false)).toMatchObject({ teach_first_now: expect.any(String) });
  });
});

describe('the planner and a card', () => {
  it('asks no planner about the opening words, and a later topic still shelves the card', async () => {
    const ask = vi.fn(async () => ({ move: { move: 'new' as const, plan: { topic: 'Black holes', kind: 'teachFirst' as const, steps: [{ teach: 'Gravity wins', exercise: 'Pick one' }] } }, costUsd: 0 }));
    const titles: string[] = [];
    const planner = createLessonPlanner({ ask, canSpend: () => true, charge: () => {}, onTitleChange: (title) => titles.push(title), trace: () => {} });
    planner.noteCardLesson(PLAN);
    planner.noteStudentWords({ words: PLAN.topic, isOpening: true, tutorSaid: '' });
    await planner.whenSettled();
    expect(ask).not.toHaveBeenCalled();
    expect(planner.getStepNote()).toMatchObject({ topic: PLAN.topic });
    planner.noteStudentWords({ words: 'teach me about black holes', isOpening: false, tutorSaid: '' });
    await planner.whenSettled();
    expect(planner.getStepNote()).toMatchObject({ topic: 'Black holes' });
    expect(titles).toEqual(['Black holes']);
  });

  it('keeps the card when a plan for its opening words lands after the card does', async () => {
    let answer: (value: never) => void = () => {};
    const planner = createLessonPlanner({ ask: () => new Promise((resolve) => (answer = resolve)), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteStudentWords({ words: PLAN.topic, isOpening: true, tutorSaid: '' });
    planner.noteCardLesson(PLAN);
    answer({ move: { move: 'new', plan: { topic: 'Rockets', kind: 'teachFirst', steps: [{ teach: 'Fuel', exercise: 'Say why' }] } }, costUsd: 0 } as never);
    await planner.whenSettled();
    expect(planner.getStepNote()).toMatchObject({ topic: PLAN.topic, step: '1 of 3' });
  });
});

function makeBeat(id: string, text: string, expectsReply = false): Beat {
  const parsed = parseBeat({ id, script: [text], expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}

const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('prompt', 'prompt', 'Take your time.')];

function makeOutput(): VoiceOutput {
  let queuedUntilMs = 0;
  let wake = () => {};
  return {
    sampleRate: 24000,
    async captureFrame(frame) {
      queuedUntilMs = Math.max(queuedUntilMs, performance.now()) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
    },
    clearQueue() {
      queuedUntilMs = 0;
      wake();
    },
    async waitForPlayout() {
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, Math.max(0, queuedUntilMs - performance.now()));
      });
    },
  };
}

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

const FAST = { ...LEAD_TIMINGS, firstWordAfterMs: 30, afterQuestionMs: 400, afterTaskMs: 500 };

function startLeading({ answers, canLead = () => true, leadTimings = FAST, mostQuietLeads }: { answers(request: string, index: number): readonly TutorBeat[]; canLead?(): boolean; leadTimings?: typeof FAST; mostQuietLeads?: number }) {
  const asked: string[] = [];
  const leads: LeadKind[] = [];
  const left: string[] = [];
  const tutor: TutorBrain = {
    async *reply({ text }) {
      asked.push(text);
      yield* answers(text, asked.length - 1);
    },
    canLead,
    noteLead: (kind) => void leads.push(kind),
    noteWork: (work) => {
      left.push(work.way);
      return null;
    },
  };
  const messages: AgentMessage[] = [];
  const send = (message: AgentMessage) => void messages.push(message);
  const session = createLiveSession({
    messenger: { send, sendOnBothChannels: send },
    line: createVoiceLine(makeOutput()),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts() as tts.TTS,
    tutor,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    leadTimings,
    ...(mostQuietLeads === undefined ? {} : { mostQuietLeads }),
  });
  sessions.push(session);
  session.onBrowser({ type: 'audioState', isRunning: true, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
  const type = (text: string) => session.onBrowser({ type: 'typed', text, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
  return { session, asked, leads, type, left, messages };
}

const teaching = (_request: string, index: number) => [makeBeat(`r${index}`, 'Gravity pulls back.')];

describe('the tutor leads', () => {
  it('follows a reply that asks nothing with the next one, by itself, and never as the student', async () => {
    const { asked, leads, type } = startLeading({ answers: teaching });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    expect(asked[0]).toBe('teach me rockets');
    expect(asked[1]).toBe(LEAD_WORDS.next);
    expect(leads[0]).toBe('next');
  });

  it('asks for a question at the end of a run, so it is a tutor and not a lecture', async () => {
    const { asked, leads, type } = startLeading({ answers: (request, index) => (request === LEAD_WORDS.mustAsk ? [makeBeat(`r${index}`, 'Which way does it pull?', true)] : teaching(request, index)) });
    type('teach me rockets');
    await vi.waitFor(() => expect(leads).toContain('mustAsk'), { timeout: 6000 });
    expect(asked.slice(0, 3)).toEqual(['teach me rockets', LEAD_WORDS.next, LEAD_WORDS.mustAsk]);
  });

  it('waits on a question, then carries on past it when no answer comes', async () => {
    const { asked, leads, type } = startLeading({ answers: (request, index) => (index === 0 ? [makeBeat('q', 'Which way does it pull?', true)] : teaching(request, index)) });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(1), { timeout: 2000 });
    await delay(150);
    expect(asked.length).toBe(1);
    await vi.waitFor(() => expect(leads[0]).toBe('noAnswer'), { timeout: 4000 });
  });

  it('stops at once for typing, speech, and sent words, and answers them', async () => {
    const { asked, session, type } = startLeading({ answers: teaching, leadTimings: { ...FAST, firstWordAfterMs: 800 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(2), { timeout: 4000 });
    session.onEars({ type: 'voiceStarted' });
    session.onEars({ type: 'words', text: 'wait what is gravity', isFinal: false });
    session.onEars({ type: 'voiceEnded' });
    session.onEars({ type: 'words', text: 'wait what is gravity', isFinal: true });
    session.onEars({ type: 'turnDecided', text: 'wait what is gravity' });
    await vi.waitFor(() => expect(asked).toContain('wait what is gravity'), { timeout: 2000 });
  });

  it('holds while the student is typing', async () => {
    const { asked, session, type } = startLeading({ answers: (request, index) => (index === 0 ? [makeBeat('q', 'Which way?', true)] : teaching(request, index)), leadTimings: { ...FAST, afterQuestionMs: 300 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(1), { timeout: 2000 });
    await delay(50);
    for (let press = 0; press < 12; press += 1) {
      session.onBrowser({ type: 'typing', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
      await delay(50);
    }
    expect(asked.length).toBe(1);
  });

  it('after a crisis nothing continues by itself', async () => {
    const { asked, type, leads } = startLeading({ answers: teaching, canLead: () => false });
    type('i want to hurt myself');
    await delay(900);
    expect(asked.length).toBe(1);
    expect(leads).toEqual([]);
  });

  it('stops a run nobody is hearing, so a forgotten tab does not keep paying', async () => {
    const { asked, type } = startLeading({ answers: teaching, mostQuietLeads: 1 });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(2), { timeout: 4000 });
    await delay(800);
    expect(asked.length).toBe(2);
  });
});

const QUICK = { stillWorkingMs: 40, firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 5 };

describe('the brain in a lead', () => {
  const run = async (brain: Required<TutorBrain>, text: string) => {
    const said: string[] = [];
    for await (const beat of brain.reply({ text }, new AbortController().signal)) said.push(getBeatText(beat));
    return said.join(' ');
  };

  it('can lead after a teaching reply, and never after a safety reply, until they ask to be taught', async () => {
    const replies = ['Gravity pulls back.', 'Please tell an adult you trust. Are you safe?', 'I hear you.', 'Back to gravity.'];
    let index = 0;
    const scripted = { getCostUsd: () => 0, compact: async () => null, warm: async () => {}, stream: async function* () { yield { type: 'text', text: replies[index++] as string, isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; } } as never;
    const brain = createTutorBrain({ model: scripted, timeouts: QUICK });
    await run(brain, 'teach me gravity');
    expect(brain.canLead()).toBe(true);
    await run(brain, 'i feel scared');
    expect(brain.canLead()).toBe(false);
    await run(brain, 'ok');
    expect(brain.canLead()).toBe(false);
    await run(brain, 'teach me more');
    expect(brain.canLead()).toBe(true);
  });

  it('cannot lead once the tutor has closed for spending', async () => {
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ text: 'x' }) as never) as never, timeouts: QUICK, getSpendLimit: () => 'sessionLimit' });
    await run(brain, 'teach me gravity');
    expect(brain.canLead()).toBe(false);
  });

  it('adds a question when a reply at the end of a run still asks nothing, so it is never left with nothing open', async () => {
    const scripted = { stream: async function* () { yield { type: 'text', text: 'Gravity pulls back.', isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; }, getCostUsd: () => 0, compact: async () => null, warm: async () => {} } as never;
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model: scripted, timeouts: QUICK, onTurnEnd: (summary) => summaries.push(summary) });
    brain.noteLead('mustAsk');
    await run(brain, LEAD_WORDS.mustAsk);
    expect(summaries[0]?.beats.at(-1)?.expectsReply).toBe(true);
  });

  it('opens a card by teaching, and is told not to ask what they know', async () => {
    const seen: string[] = [];
    const scripted = { stream: async function* (request: { turns: { text?: string }[] }) { seen.push(JSON.stringify(request.turns)); yield { type: 'text', text: 'Gravity pulls back.', isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; }, getCostUsd: () => 0, compact: async () => null, warm: async () => {} } as never;
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    const brain = createTutorBrain({ model: scripted, timeouts: QUICK, lessonPlanner: planner, loadProfile: async () => ({ level: 'high_school', interests: [], goal: 'curiosity', cardTitle: PLAN.topic, cardMaterial: MATERIAL }) });
    await run(brain, PLAN.topic);
    expect(seen[0]).toContain('opening_a_card');
    expect(seen[0]).toContain('lesson_plan');
    await run(brain, 'ok');
    expect(seen[1]?.match(/opening_a_card/g)).toHaveLength(1);
  });
});

