import { type Beat, getBeatText, parseBeat, type AgentMessage } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCardPictures, toCardPlan, parseCardMaterial } from '../src/lesson-plan/card-lesson.ts';
import { hasWorkingToDo } from '../src/lesson-plan/lesson-plan.ts';
import { createLessonPlanner, getTeachFirstNote } from '../src/lesson-plan/lesson-planner.ts';
import { getStateAfterEvent, getStateAfterMove, getStepNote, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { getLead, LEAD_TIMINGS, LEAD_WORDS, type LeadKind } from '../src/live/tutor-lead.ts';
import { dropRepeatedIdeas } from '../src/lesson-plan/ask-planner.ts';
import { getLessonWordsProblem } from '../src/lesson-plan/lesson-rules.ts';
import { showsItsAnswer } from '../src/tutor/board-memory.ts';
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
    for (let reply = 0; reply < 3; reply += 1) planner.noteReplyEnded({ wasSafety: false, wasLead: false, spoken: '' });
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

describe('what a student never hears or sees', () => {
  it.each(["That's the whole plan covered.", 'Last idea: an orbit is falling sideways.', 'Last exercise. Try this.', 'That is my plan.', 'The plan is done.'])('does not let "%s" through', (words) => {
    expect(getLessonWordsProblem(words)).not.toBeNull();
  });

  it.each(['The plan was to land on the Moon.', 'The last stage drops off.', 'Engineers plan for this.', 'A flight plan matters.'])('leaves "%s" alone', (words) => {
    expect(getLessonWordsProblem(words)).toBeNull();
  });

  it.each(['100 - 30 = 70', '8 - 0.5 = 7.5', '\\frac{100}{10} = 10', '11.2 \\div 2.4 \\approx 4.7', '8 \\times 60 = 480'])('reads %s as showing its answer', (tex) => {
    expect(showsItsAnswer(tex)).toBe(true);
  });

  it.each(['2x + 3 = 11', 'F = ma', '100 - 30', '\\frac{11.2}{2.4}', '5 = 5', 'v = 11 \\text{ km/s}', '8 \\times 60'])('reads %s as still to work out', (tex) => {
    expect(showsItsAnswer(tex)).toBe(false);
  });

  const reply = (texts: string[]) => {
    let attempt = 0;
    return { getCostUsd: () => 0, compact: async () => null, warm: async () => {}, stream: async function* () { yield { type: 'text', text: texts[Math.min(attempt++, texts.length - 1)] as string, isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; } } as never;
  };

  const QUICK_TIMES = { firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 5 };
  const getMath = (summary: TurnSummary) => summary.beats.flatMap((beat) => beat.script.flatMap((part) => (typeof part !== 'string' && part.kind === 'writeMath' ? [part.tex] : [])));
  const getTasks = (summary: TurnSummary) => summary.beats.flatMap((beat) => beat.script.flatMap((part) => (typeof part !== 'string' && part.kind === 'task' ? [part.id] : [])));
  const GIVES_IT_AWAY = 'Your turn. {"kind":"writeMath","id":"p1","tex":"100 - 30 = 70","claim":"new"}How many tonnes? {"kind":"task","id":"a1","way":"write","on":"p1"}';
  const ONLY_THE_PROBLEM = 'Your turn. {"kind":"writeMath","id":"p2","tex":"100 - 30","claim":"new"}How many tonnes? {"kind":"task","id":"a2","way":"write","on":"p2"}';

  it('never shows the answer when this reply sets the exercise', async () => {
    const summaries: TurnSummary[] = [];
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson(PLAN);
    for (let replies = 0; replies < 3; replies += 1) planner.noteReplyEnded({ wasSafety: false, wasLead: false, spoken: '' });
    const brain = createTutorBrain({ model: reply([GIVES_IT_AWAY, ONLY_THE_PROBLEM]), timeouts: QUICK_TIMES, lessonPlanner: planner, onTurnEnd: (summary) => summaries.push(summary) });
    for await (const beat of brain.reply({ text: 'i see' }, new AbortController().signal)) void beat;
    expect(getMath(summaries[0] as TurnSummary)).toEqual(['100 - 30']);
    expect(getTasks(summaries[0] as TurnSummary)).toEqual(['a2']);
  });

  it('leaves a worked example alone, and stops only a task that it gives away', async () => {
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model: reply([GIVES_IT_AWAY, ONLY_THE_PROBLEM]), timeouts: QUICK_TIMES, onTurnEnd: (summary) => summaries.push(summary) });
    for await (const beat of brain.reply({ text: 'i see' }, new AbortController().signal)) void beat;
    expect(getTasks(summaries[0] as TurnSummary)).not.toContain('a1');
  });

  it('asks again quietly when a reply names the plan', async () => {
    const said: string[] = [];
    const brain = createTutorBrain({ model: reply(["That's the whole plan covered.", 'Now, thrust.']), timeouts: { firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 5 } });
    for await (const beat of brain.reply({ text: 'ok' }, new AbortController().signal)) said.push(getBeatText(beat));
    expect(said.join(' ')).toBe('Now, thrust.');
  });
});

describe('ideas the planner adds', () => {
  const TOPIC = 'How a rocket escapes Earth';
  const TAUGHT = ['Why rockets launch toward the east', 'Why rockets drop their empty stages', 'Why rockets throw mass backward to go forward', 'What escape velocity really means'];
  const step = (teach: string) => ({ teach, exercise: 'One short problem' });

  it.each(['Launch sites near the equator get a free boost, because the spin carries you east', 'How multistage rockets improve that ratio by dropping empty tanks'])('drops "%s", which has been taught', (teach) => {
    expect(dropRepeatedIdeas([step(teach)], TAUGHT, TOPIC)).toEqual([]);
  });

  it.each(['The rocket equation links fuel burned to final speed through the mass ratio', 'Thrust must beat weight for a rocket to lift', 'Drag and gravity losses eat into the ideal speed'])('keeps "%s", which is new', (teach) => {
    expect(dropRepeatedIdeas([step(teach)], TAUGHT, TOPIC)).toHaveLength(1);
  });

  it('drops one that repeats another added with it', () => {
    expect(dropRepeatedIdeas([step('Thrust must beat weight at liftoff'), step('Thrust against weight at liftoff')], [], TOPIC)).toHaveLength(1);
  });
});

describe('a lesson that runs on', () => {
  it('asks for the next ideas as it nears the end, and teaches them', async () => {
    const askMore = vi.fn<(request: unknown) => Promise<{ steps: { teach: string; exercise: string }[]; costUsd: number }>>(async () => ({ steps: [{ teach: 'Gravity assists', exercise: 'Pick one' }], costUsd: 0 }));
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), askMore, canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson(PLAN);
    planner.noteReplyEnded({ wasSafety: false, wasLead: false, spoken: 'Empty tanks are dead weight.' });
    expect(askMore).not.toHaveBeenCalled();
    planner.noteCommand({ kind: 'task', id: 'a1', way: 'write', reads: 'words' } as never);
    planner.noteCommand({ kind: 'boardMode', mode: 'teach' } as never);
    await vi.waitFor(() => expect(askMore).toHaveBeenCalledOnce());
    expect(askMore.mock.calls[0]?.[0]).toMatchObject({ topic: PLAN.topic, taught: PLAN.steps.map(({ teach }) => teach), said: expect.stringContaining('Empty tanks are dead weight.') });
    await vi.waitFor(() => expect(planner.getStepNote()).toMatchObject({ step: '2 of 4' }));
    planner.noteCommand({ kind: 'task', id: 'a2', way: 'write', reads: 'words' } as never);
    planner.noteCommand({ kind: 'boardMode', mode: 'teach' } as never);
    await vi.waitFor(() => expect(planner.getStepNote()).toMatchObject({ step: '3 of 4', next_idea: 'Gravity assists' }));
  });

  it('spends nothing on more ideas past a limit', async () => {
    const askMore = vi.fn(async () => ({ steps: [], costUsd: 0 }));
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), askMore, canSpend: () => false, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson({ ...PLAN, steps: PLAN.steps.slice(0, 1) });
    planner.noteReplyEnded({ wasSafety: false, wasLead: false, spoken: '' });
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

const makeInstantOutput = (): VoiceOutput => ({ sampleRate: 24000, captureFrame: async () => {}, clearQueue: () => {}, waitForPlayout: async () => {} });

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

const FAST = { ...LEAD_TIMINGS, firstWordAfterMs: 30, afterQuestionMs: 400, afterTaskMs: 500, afterQuestionAgainMs: 400, afterTaskAgainMs: 500, afterKeyMs: 400 };

function startLeading({ answers, canLead = () => true, hasLessonLeft = () => true, leadTimings = FAST, quietLimitMs, onQuietLimit }: { answers(request: string, index: number): readonly TutorBeat[]; canLead?(): boolean; hasLessonLeft?(): boolean; leadTimings?: typeof FAST; quietLimitMs?: number; onQuietLimit?(): void }) {
  const asked: string[] = [];
  const leads: LeadKind[] = [];
  const left: string[] = [];
  let isHeld = false;
  const tutor: TutorBrain = {
    async *reply({ text }) {
      asked.push(text);
      yield* answers(text, asked.length - 1);
    },
    canLead: () => !isHeld && canLead(),
    isHeld: () => isHeld,
    noteAskedToHold: () => {
      isHeld = true;
    },
    hasLessonLeft,
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
    line: createVoiceLine(makeInstantOutput()),
    voice: makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts() as tts.TTS,
    tutor,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    leadTimings,
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
  const FACTS = { isQuestionOpen: false, hasOpenTask: false, hasTriedTask: false, unansweredInARow: 0, isPageHidden: false, quietForMs: 0, hasLessonLeft: true };

  it('goes on at once with nothing open, and waits on a question or a task', () => {
    expect(getLead(FACTS)).toMatchObject({ kind: 'next', afterMs: 0 });
    expect(getLead({ ...FACTS, isQuestionOpen: true })).toMatchObject({ kind: 'noAnswer', afterMs: LEAD_TIMINGS.afterQuestionMs });
    expect(getLead({ ...FACTS, hasOpenTask: true })).toMatchObject({ kind: 'taskLeft', afterMs: LEAD_TIMINGS.afterTaskMs });
  });

  it('moves on soon after a tried exercise, unless the tutor asked them something about it', () => {
    expect(getLead({ ...FACTS, hasOpenTask: true, hasTriedTask: true })).toMatchObject({ kind: 'taskTried', afterMs: LEAD_TIMINGS.afterTaskTriedMs });
    expect(getLead({ ...FACTS, hasOpenTask: true, hasTriedTask: true, isQuestionOpen: true })).toMatchObject({ kind: 'taskLeft' });
  });

  it('never stops on unanswered asks, however many, and only waits less once they have shown they are listening', () => {
    for (const unansweredInARow of [1, 2, 10, 100]) {
      expect(getLead({ ...FACTS, isQuestionOpen: true, unansweredInARow })).toMatchObject({ kind: 'noAnswer', afterMs: LEAD_TIMINGS.afterQuestionAgainMs });
      expect(getLead({ ...FACTS, hasOpenTask: true, unansweredInARow })).toMatchObject({ kind: 'taskLeft', afterMs: LEAD_TIMINGS.afterTaskAgainMs });
    }
    expect(LEAD_TIMINGS.afterTaskAgainMs).toBeLessThan(LEAD_TIMINGS.afterTaskMs);
  });

  it('holds only on a real sign they have gone', () => {
    expect(getLead({ ...FACTS, isPageHidden: true })).toBeNull();
    expect(getLead({ ...FACTS, hasLessonLeft: false, quietForMs: LEAD_TIMINGS.mostQuietMs })).toBeNull();
    expect(getLead({ ...FACTS, hasLessonLeft: false, quietForMs: LEAD_TIMINGS.mostQuietMs - 1 })).toMatchObject({ kind: 'next' });
  });

  it('teaches a whole lesson to a student who only listens, because a listener and a walked away student look the same', () => {
    expect(getLead({ ...FACTS, quietForMs: 25 * 60_000 })).toMatchObject({ kind: 'next' });
    expect(getLead({ ...FACTS, quietForMs: LEAD_TIMINGS.mostQuietInALessonMs })).toBeNull();
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

  it('goes on past question after question with no answer, and never stops to check on them', async () => {
    const { leads, type } = startLeading({ answers: (_request, index) => [makeBeat(`q${index}`, 'Which way does it pull?', true)], leadTimings: { ...FAST, afterQuestionMs: 150, afterQuestionAgainMs: 100 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(leads.length).toBeGreaterThanOrEqual(4), { timeout: 12_000 });
    expect(new Set(leads)).toEqual(new Set(['noAnswer']));
  }, 15_000);

  it('holds while the tab is hidden, and goes on as they come back', async () => {
    const { asked, session, type } = startLeading({ answers: teaching });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    session.onBrowser({ type: 'pageHidden', isHidden: true, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await delay(200);
    const heldAt = asked.length;
    await delay(300);
    expect(asked.length).toBe(heldAt);
    session.onBrowser({ type: 'pageHidden', isHidden: false, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(heldAt), { timeout: 4000 });
  }, 15_000);

  it('holds while the page is away, and goes on when it is back', async () => {
    const { asked, session, type } = startLeading({ answers: teaching });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    session.onBrowser({ type: 'audioState', isRunning: false, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await delay(200);
    const heldAt = asked.length;
    await delay(300);
    expect(asked.length).toBe(heldAt);
    session.onBrowser({ type: 'audioState', isRunning: true, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(heldAt), { timeout: 8000 });
  }, 20_000);

  it('holds after the quiet limit with no lesson left, and goes on at any sign of them', async () => {
    const { asked, session, type } = startLeading({ answers: teaching, hasLessonLeft: () => false, leadTimings: { ...FAST, mostQuietMs: 300 } });
    type('teach me rockets');
    await delay(600);
    const heldAt = asked.length;
    await delay(300);
    expect(asked.length).toBe(heldAt);
    session.onBrowser({ type: 'stillHere', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(heldAt), { timeout: 4000 });
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
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
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

  it('stays stopped when the student presses stop', async () => {
    const { asked, session, type } = startLeading({ answers: teaching, leadTimings: { ...FAST, firstWordAfterMs: 400 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(1), { timeout: 2000 });
    await delay(100);
    session.onBrowser({ type: 'stopTutor', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await delay(700);
    expect(asked.length).toBe(1);
  }, 10_000);

  it('does not take the page hearing the question as a sign of the student', async () => {
    const { leads, session, type } = startLeading({ answers: (_request, index) => [makeBeat(`q${index}`, 'Which way?', true)] });
    type('teach me rockets');
    await vi.waitFor(() => expect(leads).toContain('noAnswer'), { timeout: 6000 });
    session.onBrowser({ type: 'questionHeard', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(leads.length).toBeGreaterThanOrEqual(2), { timeout: 6000 });
  }, 12_000);

  it('never closes the room on a student only listening, and does once it is holding for one who has gone', async () => {
    const onQuietLimit = vi.fn();
    const { asked, session, type } = startLeading({ answers: teaching, quietLimitMs: 500, onQuietLimit });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBeGreaterThanOrEqual(4), { timeout: 10_000 });
    expect(onQuietLimit).not.toHaveBeenCalled();
    session.onBrowser({ type: 'pageHidden', isHidden: true, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await vi.waitFor(() => expect(onQuietLimit).toHaveBeenCalled(), { timeout: 12_000 });
  }, 25_000);

  it('goes on by itself no sooner than the student lets go of hold to talk', async () => {
    const { asked, session, type } = startLeading({ answers: (request, index) => (index === 0 ? [makeBeat('q', 'Which way?', true)] : teaching(request, index)), leadTimings: { ...FAST, afterQuestionMs: 200 } });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(1), { timeout: 2000 });
    session.onBrowser({ type: 'holdStarted', clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    await delay(500);
    expect(asked.length).toBe(1);
  }, 8000);

  it('after a crisis nothing continues by itself', async () => {
    const { asked, type, leads } = startLeading({ answers: teaching, canLead: () => false });
    type('i want to hurt myself');
    await delay(900);
    expect(asked.length).toBe(1);
    expect(leads).toEqual([]);
  });

  it('lands no scene while the tab is hidden, so its voice is not spent on nobody', async () => {
    const { session, type, asked } = startLeading({ answers: (_request, index) => [makeBeat(`r${index}`, 'Gravity pulls back.')], canLead: () => false });
    type('teach me rockets');
    await vi.waitFor(() => expect(asked.length).toBe(1), { timeout: 2000 });
    await vi.waitFor(() => expect(session.isAtPause()).toBe(true), { timeout: 4000 });
    session.onBrowser({ type: 'pageHidden', isHidden: true, clockId: 'c', browserMs: 1, startedMsAgo: 0 } as never);
    expect(session.isAtPause()).toBe(false);
  });
});

const QUICK = { firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 5 };

const NUMBERS_PLAN = { topic: 'Escape speed', kind: 'teachFirst' as const, steps: [{ teach: 'What escape speed means', exercise: 'One short problem.', material: ['For Earth, it is about eleven kilometers every second.'] }] };

describe('what kind of exercise a step wants', () => {
  it('reads working from numbers and quantities, spelled or not', () => {
    expect(hasWorkingToDo({ teach: 'What escape velocity really means', exercise: 'x', material: ['For Earth, it is about eleven kilometers every second.'] })).toBe(true);
    expect(hasWorkingToDo({ teach: 'The Moon is smaller', exercise: 'the Moon is 2.4 km/s, how many times less than 11.2?' })).toBe(true);
    expect(hasWorkingToDo({ teach: 'What the Jacobins wanted', exercise: 'put these events in order' })).toBe(false);
    expect(hasWorkingToDo({ teach: 'A sonnet has fourteen lines at a set speed', exercise: 'match the ten beats to their line' })).toBe(false);
  });

  it('tells the tutor the kind only when the exercise is due', () => {
    const escape = getStateAfterMove(NO_LESSON, { move: 'new', plan: NUMBERS_PLAN });
    expect(getStepNote(escape)).not.toHaveProperty('exercise_kind');
    expect(getStepNote(afterReplies(7, escape))).toMatchObject({ exercise_due: true, exercise_kind: 'problem' });
    const history = getStateAfterMove(NO_LESSON, { move: 'new', plan: { topic: 'Revolution', kind: 'teachFirst', steps: [{ teach: 'What the Jacobins wanted', exercise: 'put these events in order' }] } });
    expect(getStepNote(afterReplies(6, history))).toMatchObject({ exercise_due: true, exercise_kind: 'board' });
  });
});

describe('the brain in a lead', () => {
  const reply = (lines: readonly string[]) => {
    let index = 0;
    return { getCostUsd: () => 0, compact: async () => null, warm: async () => {}, stream: async function* () { yield { type: 'text', text: lines[Math.min(index++, lines.length - 1)] as string, isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; } } as never;
  };
  const run = async (brain: Required<TutorBrain>, text: string) => {
    const said: string[] = [];
    const lead = (Object.keys(LEAD_WORDS) as LeadKind[]).find((kind) => LEAD_WORDS[kind] === text);
    for await (const beat of brain.reply({ text, ...(lead ? { lead } : {}) }, new AbortController().signal)) said.push(getBeatText(beat));
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
  });

  it('says no filler on a slow reply to a student either', async () => {
    const slow = { getCostUsd: () => 0, compact: async () => null, warm: async () => {}, stream: async function* () { await delay(90); yield { type: 'text', text: 'Gravity pulls back.', isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; } } as never;
    const brain = createTutorBrain({ model: slow, timeouts: QUICK });
    expect(await run(brain, 'teach me gravity')).toBe('Gravity pulls back.');
  });

  it('takes an opening tic off a reply', async () => {
    for (const [written, heard] of [['Next, the exhaust pushes back.', 'The exhaust pushes back.'], ['Time for a short one, about the Moon.', 'About the Moon.'], ['Fine, skip it. The exhaust pushes back.', 'The exhaust pushes back.']] as const) {
      const brain = createTutorBrain({ model: reply([written]), timeouts: QUICK });
      brain.noteLead('next');
      expect(await run(brain, LEAD_WORDS.next)).toBe(heard);
    }
  });

  it('takes a reply to nobody off a lead, and leaves it on a reply to a student', async () => {
    const led = createTutorBrain({ model: reply(['Okay. Four percent of a thousand is forty.']), timeouts: QUICK });
    led.noteLead('taskLeft');
    expect(await run(led, LEAD_WORDS.taskLeft)).toBe('Four percent of a thousand is forty.');
    const asked = createTutorBrain({ model: reply(['Okay. Four percent of a thousand is forty.']), timeouts: QUICK });
    expect(await run(asked, 'what is four percent of a thousand')).toBe('Okay. Four percent of a thousand is forty.');
  });

  it('takes "Next," off a sentence later in a reply', async () => {
    const brain = createTutorBrain({ model: reply(['A hundred minus thirty is seventy. Next, why rockets launch east.']), timeouts: QUICK });
    brain.noteLead('taskLeft');
    expect(await run(brain, LEAD_WORDS.taskLeft)).toBe('A hundred minus thirty is seventy. Why rockets launch east.');
  });

  it('takes the tic off a reply that opens on a command too', async () => {
    const brain = createTutorBrain({ model: reply([' {"kind":"boardMode","mode":"teach"}Time for a quick one. The exhaust pushes back.']), timeouts: QUICK });
    brain.noteLead('next');
    expect(await run(brain, LEAD_WORDS.next)).toBe('The exhaust pushes back.');
  });

  it('asks again quietly for a reply that announces a correction', async () => {
    const seen: string[] = [];
    const model = { stream: async function* (request: { turns: { text?: string }[] }) { seen.push(JSON.stringify(request.turns)); yield { type: 'text', text: seen.length === 1 ? 'Quick correction on my last line: gravity weakens as you climb. ' : 'Gravity weakens as you climb. ', isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; }, getCostUsd: () => 0, compact: async () => null, warm: async () => {} } as never;
    const brain = createTutorBrain({ model, timeouts: QUICK });
    brain.noteLead('next');
    expect(await run(brain, LEAD_WORDS.next)).toBe('Gravity weakens as you climb.');
    expect(seen).toHaveLength(2);
  });

  const onExerciseStep = (replies: readonly string[], seen: string[] = []) => {
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson(NUMBERS_PLAN);
    for (let index = 0; index < 7; index += 1) planner.noteReplyEnded({ wasSafety: false, wasLead: true, spoken: '' });
    let index = 0;
    const model = { stream: async function* (request: { turns: { text?: string }[] }) { seen.push(JSON.stringify(request.turns)); yield { type: 'text', text: replies[Math.min(index++, replies.length - 1)] as string, isNewBlock: false }; yield { type: 'finished', stopReason: 'finished', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }; }, getCostUsd: () => 0, compact: async () => null, warm: async () => {} } as never;
    return createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
  };
  const WHY_TASK = '{"kind":"task","id":"a1","way":"write","reads":"words"}Why does gravity fade?';
  const PROBLEM_TASK = 'Try this. {"kind":"writeMath","id":"p1","tex":"11.2 \\\\div 2.4","claim":"new"}Earth over the Moon. {"kind":"task","id":"a1","way":"write","on":"p1"}Have a go.';
  const PICK_TASK = 'Try this. {"kind":"writeMath","id":"p1","tex":"F = m a","claim":"new"}Which part is the push? {"kind":"task","id":"a1","way":"pick","on":"p1","answer":["F"]}';

  it('sends a why question back on a step with numbers, and takes a real problem', async () => {
    const seen: string[] = [];
    const brain = onExerciseStep([WHY_TASK, PROBLEM_TASK], seen);
    brain.noteLead('next');
    const said = await run(brain, LEAD_WORDS.next);
    expect(seen).toHaveLength(2);
    expect(said).toContain('Earth over the Moon.');
    expect(said).not.toContain('Hold on');
    expect(brain.getBoard().openTask).toBe('a1');
    expect(seen[0]).toContain('exercise_kind');
  });

  it('sends a bare question back, because it leaves no place to answer', async () => {
    const seen: string[] = [];
    const brain = onExerciseStep(['Why does gravity fade?', PROBLEM_TASK], seen);
    brain.noteLead('next');
    expect(await run(brain, LEAD_WORDS.next)).not.toContain('Why does gravity fade');
    expect(seen).toHaveLength(2);
  });

  it('never sends back help for a student in danger, with an exercise due', async () => {
    const seen: string[] = [];
    const brain = onExerciseStep(['That sounds serious. Please tell an adult you trust now. Are you safe right now?'], seen);
    expect(await run(brain, 'i want to die')).toContain('Are you safe right now?');
    expect(seen).toHaveLength(1);
  });

  it('answers a student who asks something with an exercise due, and may ask them back', async () => {
    const seen: string[] = [];
    const brain = onExerciseStep(['Ever dropped a ball?'], seen);
    expect(await run(brain, 'wait what is gravity')).toBe('Ever dropped a ball?');
    expect(seen).toHaveLength(1);
  });

  it('takes a pick on a step with numbers at once', async () => {
    const seen: string[] = [];
    const brain = onExerciseStep([PICK_TASK], seen);
    brain.noteLead('next');
    await run(brain, LEAD_WORDS.next);
    expect(seen).toHaveLength(1);
  });

  it('lets a second why through rather than leave a student with nothing to do', async () => {
    const brain = onExerciseStep([WHY_TASK, WHY_TASK]);
    brain.noteLead('next');
    await run(brain, LEAD_WORDS.next);
    expect(brain.getBoard().openTask).toBe('a1');
  });

  it('gives the tutor code\'s own number for a problem nobody tried', async () => {
    const seen: string[] = [];
    const brain = onExerciseStep([PROBLEM_TASK, 'It comes to about 4.67. Now the next idea.'], seen);
    brain.noteLead('next');
    await run(brain, LEAD_WORDS.next);
    brain.noteLead('taskLeft');
    await run(brain, LEAD_WORDS.taskLeft);
    expect(seen.at(-1)).toContain('4.66667');
  });

  it('stops leading at the end of a plan, and says so through what it holds', async () => {
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson({ topic: 'Gravity', kind: 'teachFirst', steps: [{ teach: 'why it falls', exercise: 'x' }] });
    const brain = createTutorBrain({ model: reply(['Gravity pulls back.', 'That is the idea.']), timeouts: QUICK, lessonPlanner: planner });
    await run(brain, 'Gravity');
    expect(brain.canLead()).toBe(true);
    expect(brain.hasLessonLeft()).toBe(true);
    brain.noteLead('taskLeft');
    await run(brain, LEAD_WORDS.taskLeft);
    expect(brain.hasLessonLeft()).toBe(false);
    expect(brain.canLead()).toBe(false);
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

