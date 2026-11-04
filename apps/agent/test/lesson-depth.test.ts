import { type Beat, getBeatText, parseBeat, type AgentMessage } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCardPictures, toCardPlan, parseCardMaterial } from '../src/lesson-plan/card-lesson.ts';
import { createLessonPlanner, getTeachFirstNote } from '../src/lesson-plan/lesson-planner.ts';
import { getStateAfterEvent, getStateAfterMove, getStepNote, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { getLead, LEAD_TIMINGS, LEAD_WORDS, type LeadKind } from '../src/live/tutor-lead.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createTutorBrain, type TutorBeat, type TutorBrain } from '../src/tutor/brain.ts';

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

  it('holds the exercise off for longer while the student only listens', () => {
    const afterLeads = (count: number) => Array.from({ length: count }).reduce<ReturnType<typeof atCard>>((next) => getStateAfterEvent(next, 'leadEnded'), atCard());
    expect(getStepNote(afterLeads(6))).not.toHaveProperty('exercise_due');
    expect(getStepNote(afterLeads(7))).toMatchObject({ exercise_due: true });
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

describe('a lesson that runs on', () => {
  it('asks for the next ideas as it nears the end, and teaches them', async () => {
    const askMore = vi.fn<(request: unknown) => Promise<{ steps: { teach: string; exercise: string }[]; costUsd: number }>>(async () => ({ steps: [{ teach: 'Gravity assists', exercise: 'Pick one' }], costUsd: 0 }));
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), askMore, canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson(PLAN);
    expect(askMore).not.toHaveBeenCalled();
    planner.noteCommand({ kind: 'task', id: 'a1', way: 'write', reads: 'words' } as never);
    planner.noteCommand({ kind: 'boardMode', mode: 'teach' } as never);
    await vi.waitFor(() => expect(askMore).toHaveBeenCalledOnce());
    expect(askMore.mock.calls[0]?.[0]).toMatchObject({ topic: PLAN.topic, taught: PLAN.steps.map(({ teach }) => teach) });
    await vi.waitFor(() => expect(planner.getStepNote()).toMatchObject({ step: '2 of 4' }));
    planner.noteCommand({ kind: 'task', id: 'a2', way: 'write', reads: 'words' } as never);
    planner.noteCommand({ kind: 'boardMode', mode: 'teach' } as never);
    await vi.waitFor(() => expect(planner.getStepNote()).toMatchObject({ step: '3 of 4', next_idea: 'Gravity assists' }));
  });

  it('spends nothing on more ideas past a limit', async () => {
    const askMore = vi.fn(async () => ({ steps: [], costUsd: 0 }));
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), askMore, canSpend: () => false, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson({ ...PLAN, steps: PLAN.steps.slice(0, 1) });
    planner.noteReplyEnded({ wasSafety: false });
    expect(askMore).not.toHaveBeenCalled();
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

function startLeading({ answers, canLead = () => true, leadTimings = FAST, mostQuietLeads, quietLimitMs, onQuietLimit }: { answers(request: string, index: number): readonly TutorBeat[]; canLead?(): boolean; leadTimings?: typeof FAST; mostQuietLeads?: number; quietLimitMs?: number; onQuietLimit?(): void }) {
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
    ...(quietLimitMs === undefined ? {} : { quietLimitMs }),
    ...(onQuietLimit ? { onQuietLimit } : {}),
  });
  sessions.push(session);
  session.onBrowser({ type: 'audioState', isRunning: true, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
  const type = (text: string) => session.onBrowser({ type: 'typed', text, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
  return { session, asked, leads, type, left, messages };
}

const teaching = (_request: string, index: number) => [makeBeat(`r${index}`, 'Gravity pulls back.')];

describe('what comes next', () => {
  const FACTS = { isQuestionOpen: false, hasOpenTask: false, hasTriedTask: false, unansweredInARow: 0, quietLeads: 0, mostQuietLeads: 30 };

  it('goes on at once with nothing open, and waits on a question or a task', () => {
    expect(getLead(FACTS)).toMatchObject({ kind: 'next', afterMs: 0 });
    expect(getLead({ ...FACTS, isQuestionOpen: true })).toMatchObject({ kind: 'noAnswer', afterMs: LEAD_TIMINGS.afterQuestionMs });
    expect(getLead({ ...FACTS, hasOpenTask: true })).toMatchObject({ kind: 'taskLeft', afterMs: LEAD_TIMINGS.afterTaskMs });
  });

  it('moves on soon after a tried exercise, unless the tutor asked them something about it', () => {
    expect(getLead({ ...FACTS, hasOpenTask: true, hasTriedTask: true })).toMatchObject({ kind: 'taskTried', afterMs: LEAD_TIMINGS.afterTaskTriedMs });
    expect(getLead({ ...FACTS, hasOpenTask: true, hasTriedTask: true, isQuestionOpen: true })).toMatchObject({ kind: 'taskLeft' });
  });

  it('checks once at the second unanswered ask, and stops at the backstop', () => {
    expect(getLead({ ...FACTS, isQuestionOpen: true, unansweredInARow: 1 })).toMatchObject({ kind: 'checkIn' });
    expect(getLead({ ...FACTS, quietLeads: 30 })).toBeNull();
  });
});

describe('the tutor leads', () => {
  it('follows a reply that asks nothing with the next one, by itself, and never as the student', async () => {
    const { asked, leads, type } = startLeading({ answers: teaching });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    expect(asked[0]).toBe('teach me rockets');
    expect(asked[1]).toBe(LEAD_WORDS.next);
    expect(leads[0]).toBe('next');
  });

  it('keeps going through teaching for as long as it asks nothing', async () => {
    const { asked, type } = startLeading({ answers: teaching });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(5), { timeout: 12_000 });
    expect(asked.slice(1, 5)).toEqual([LEAD_WORDS.next, LEAD_WORDS.next, LEAD_WORDS.next, LEAD_WORDS.next]);
  }, 15_000);

  it('checks once after two asks go unanswered, then holds until the student is back', async () => {
    const { asked, leads, type, session } = startLeading({ answers: (_request, index) => [makeBeat(`q${index}`, 'Which way does it pull?', true)] });
    type('teach me rockets');
    await vi.waitFor(() => expect(leads).toEqual(['noAnswer', 'checkIn']), { timeout: 6000 });
    await delay(2500);
    const heldAt = asked.length;
    await delay(900);
    expect(asked.length).toBe(heldAt);
    session.onBrowser({ type: 'typing', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(heldAt), { timeout: 4000 });
    expect(leads.at(-1)).toBe('next');
  }, 15_000);

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

  it('stays stopped when the student presses stop, until they do something', async () => {
    const { asked, session, type } = startLeading({ answers: teaching, leadTimings: { ...FAST, firstWordAfterMs: 400 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(1), { timeout: 2000 });
    await delay(100);
    session.onBrowser({ type: 'stopTutor', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await delay(1500);
    expect(asked.length).toBe(1);
    session.onBrowser({ type: 'typing', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(asked.length).toBe(2), { timeout: 3000 });
  }, 10_000);

  it('does not take the page hearing the question as a sign of the student', async () => {
    const { leads, session, type } = startLeading({ answers: (_request, index) => [makeBeat(`q${index}`, 'Which way?', true)] });
    type('teach me rockets');
    await vi.waitFor(() => expect(leads).toContain('noAnswer'), { timeout: 6000 });
    session.onBrowser({ type: 'questionHeard', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(leads).toContain('checkIn'), { timeout: 6000 });
  }, 12_000);

  it('never closes the room on a student only listening, and does once it is holding for one who has gone', async () => {
    const onQuietLimit = vi.fn();
    const { asked, type } = startLeading({ answers: (_request, index) => (index < 4 ? teaching(_request, index) : [makeBeat(`q${index}`, 'Which way?', true)]), quietLimitMs: 2500, onQuietLimit });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(4), { timeout: 10_000 });
    expect(onQuietLimit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onQuietLimit).toHaveBeenCalled(), { timeout: 12_000 });
    expect(asked.at(-1)).toBe(LEAD_WORDS.checkIn);
  }, 25_000);

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

  it('says no filler on a slow lead, because nobody is waiting on it', async () => {
    const slow = { getCostUsd: () => 0, compact: async () => null, warm: async () => {}, stream: async function* () { await delay(90); yield { type: 'text', text: 'Gravity pulls back.', isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; } } as never;
    const led = createTutorBrain({ model: slow, timeouts: QUICK });
    led.noteLead('next');
    expect(await run(led, LEAD_WORDS.next)).toBe('Gravity pulls back.');
    const asked = createTutorBrain({ model: slow, timeouts: QUICK });
    expect(await run(asked, 'teach me gravity')).toContain('Gravity pulls back.');
    expect(await run(asked, 'and again')).not.toBe('Gravity pulls back.');
  });

  it('cannot lead once the tutor has closed for spending', async () => {
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ text: 'x' }) as never) as never, timeouts: QUICK, getSpendLimit: () => 'sessionLimit' });
    await run(brain, 'teach me gravity');
    expect(brain.canLead()).toBe(false);
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

