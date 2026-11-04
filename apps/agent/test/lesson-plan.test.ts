import { getBeatText, getCues, type SceneCommand } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { PlanAnswer, PlanAsk } from '../src/lesson-plan/ask-planner.ts';
import { type LessonPlan, parsePlanMove, type PlanMove } from '../src/lesson-plan/lesson-plan.ts';
import { createLessonPlanner, getProblemNote, getTeachFirstNote, type LessonPlannerOptions } from '../src/lesson-plan/lesson-planner.ts';
import { getStateAfterEvent, getStateAfterMove, getStepNote, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import { makeFakeTutorModel } from '../src/providers/fake-model.ts';
import { LESSON_RULES } from '../src/lesson-plan/lesson-rules.ts';
import { createTutorBrain, type TurnSummary } from '../src/tutor/brain.ts';
import { PROMPT_V2 } from '../src/tutor/prompts/v2.ts';

const SOLVING: LessonPlan = { topic: 'Solving 2x + 3 = 11', kind: 'handsOn', steps: [{ teach: null, exercise: 'Solve 2x + 3 = 11' }] };
const FRACTIONS: LessonPlan = {
  topic: 'Fractions',
  kind: 'teachFirst',
  steps: [
    { teach: 'Top and bottom', exercise: 'Name the parts of 3/4' },
    { teach: 'Equal fractions', exercise: 'Write 1/2 with a bottom of 4' },
  ],
};
const newPlan = (plan: LessonPlan): PlanMove => ({ move: 'new', plan });
const heard = (words: string, isOpening = false) => ({ words, isOpening, tutorSaid: 'Have a go.' });
const TASK = { kind: 'task', id: 'a1', way: 'write', reads: 'words' } as unknown as SceneCommand;
const QUICK = { stillWorkingMs: 40, firstTextMs: 120, betweenTextMs: 80, finishGraceMs: 20, reportWaitMs: 5 };

function plannerWith(answers: readonly (PlanMove | null)[], options: Partial<LessonPlannerOptions> = {}) {
  const asks: PlanAsk[] = [];
  const titles: string[] = [];
  let index = 0;
  const planner = createLessonPlanner({
    ask(request) {
      asks.push(request);
      const move = answers[Math.min(index, answers.length - 1)] ?? null;
      index += 1;
      return Promise.resolve({ move, costUsd: 0.0001 });
    },
    canSpend: () => true,
    charge: () => {},
    onTitleChange: (title) => titles.push(title),
    trace: () => {},
    ...options,
  });
  return { planner, asks, titles };
}

describe('reading what the planner wrote', () => {
  it('reads a whole plan', () => {
    const answer = { move: 'new', topic: 'Fractions', kind: 'teachFirst', steps: [{ teach: 'Top and bottom', exercise: 'Name the parts of 3/4' }] };

    expect(parsePlanMove(answer)).toEqual({ move: 'new', plan: { topic: 'Fractions', kind: 'teachFirst', steps: [{ teach: 'Top and bottom', exercise: 'Name the parts of 3/4' }] } });
  });

  it('gives a direct question no idea to teach first', () => {
    const answer = { move: 'new', topic: 'Solving', kind: 'handsOn', steps: [{ teach: '', exercise: 'Solve it' }] };

    expect(parsePlanMove(answer)).toMatchObject({ plan: { steps: [{ teach: null, exercise: 'Solve it' }] } });
  });

  it.each([
    ['nothing', {}],
    ['a move it does not know', { move: 'leave' }],
    ['a plan with no topic', { move: 'new', topic: '  ', kind: 'handsOn', steps: [{ teach: '', exercise: 'x' }] }],
    ['a plan with no kind', { move: 'new', topic: 'A', kind: 'other', steps: [{ teach: '', exercise: 'x' }] }],
    ['a plan with no steps', { move: 'new', topic: 'A', kind: 'handsOn', steps: [] }],
    ['a way back to nowhere', { move: 'back', topic: '' }],
  ])('reads %s as nothing usable', (_name, answer) => {
    expect(parsePlanMove(answer)).toBeNull();
  });

  it('cleans a title before it can reach the page and the database', () => {
    const move = parsePlanMove({ move: 'new', topic: `  Black\u0000 holes‮\n${'x'.repeat(200)}`, kind: 'teachFirst', steps: [{ teach: 'a', exercise: 'b' }] });

    expect(move?.move === 'new' && move.plan.topic).toMatch(/^Black holes x+$/);
    expect(move?.move === 'new' && Array.from(move.plan.topic).length).toBe(80);
  });
});

describe('where the lesson is', () => {
  it('has nothing to tell before a plan', () => {
    expect(getStepNote(NO_LESSON)).toBeNull();
  });

  it('says only the current step', () => {
    expect(getStepNote(getStateAfterMove(NO_LESSON, newPlan(FRACTIONS)))).toEqual({ topic: 'Fractions', kind: 'teachFirst', step: '1 of 2', teach_first: 'Top and bottom', then_exercise: 'Name the parts of 3/4', next_idea: 'Equal fractions' });
  });

  it('moves on when the exercise is done, and says when the plan is finished', () => {
    const first = getStateAfterEvent(getStateAfterMove(NO_LESSON, newPlan(FRACTIONS)), 'exerciseDone');
    expect(getStepNote(first)).toMatchObject({ step: '2 of 2', next_idea: null });

    expect(getStepNote(getStateAfterEvent(first, 'exerciseDone'))).toEqual({ topic: 'Fractions', kind: 'teachFirst', is_finished: true });
  });

  it('moves on when the tutor teaches again after an exercise of words, which has no key to finish it', () => {
    const open = getStateAfterEvent(getStateAfterMove(NO_LESSON, newPlan(FRACTIONS)), 'exerciseSet');

    expect(getStepNote(getStateAfterEvent(open, 'teachingAgain'))).toMatchObject({ step: '2 of 2' });
  });

  it('does not move on when the tutor is only teaching, or when the student left the exercise', () => {
    const started = getStateAfterMove(NO_LESSON, newPlan(FRACTIONS));
    expect(getStepNote(getStateAfterEvent(started, 'teachingAgain'))).toMatchObject({ step: '1 of 2' });

    const left = getStateAfterEvent(getStateAfterEvent(started, 'exerciseSet'), 'exerciseLeft');
    expect(getStepNote(getStateAfterEvent(left, 'teachingAgain'))).toMatchObject({ step: '1 of 2' });
  });

  it('shelves a lesson for a new topic and goes back to where it was', () => {
    const second = getStateAfterEvent(getStateAfterMove(NO_LESSON, newPlan(FRACTIONS)), 'exerciseDone');
    const switched = getStateAfterMove(second, newPlan(SOLVING));
    expect(getStepNote(switched)).toMatchObject({ topic: SOLVING.topic });

    const back = getStateAfterMove(switched, { move: 'back', topic: 'fractions' });

    expect(getStepNote(back)).toMatchObject({ topic: 'Fractions', step: '2 of 2' });
    expect(back.shelved.map(({ plan }) => plan.topic)).toEqual([SOLVING.topic]);
  });

  it('reopens a problem the tutor had finished, when the student asks for it again', () => {
    const finished = getStateAfterEvent(getStateAfterMove(NO_LESSON, newPlan(SOLVING)), 'exerciseDone');
    const back = getStateAfterMove(getStateAfterMove(finished, newPlan(FRACTIONS)), { move: 'back', topic: SOLVING.topic });

    expect(getStepNote(back)).toMatchObject({ topic: SOLVING.topic, step: '1 of 1' });
  });

  it('does not start over when the planner names the topic they are already on', () => {
    const second = getStateAfterEvent(getStateAfterMove(NO_LESSON, newPlan(FRACTIONS)), 'exerciseDone');

    expect(getStateAfterMove(second, newPlan({ ...FRACTIONS, topic: 'fractions' }))).toBe(second);
  });

  it('stays where it is when asked to go back to a topic it does not hold', () => {
    const state = getStateAfterMove(NO_LESSON, newPlan(FRACTIONS));

    expect(getStateAfterMove(state, { move: 'back', topic: 'Chess' })).toBe(state);
  });
});

describe('the lesson planner', () => {
  it('tells the planner the topic now and the topics left behind', async () => {
    const { planner, asks } = plannerWith([newPlan(FRACTIONS), newPlan(SOLVING), { move: 'stay' }]);

    for (const [index, words] of ['teach me fractions', 'solve 2x + 3 = 11 now please', 'why'].entries()) {
      planner.noteStudentWords(heard(words, index === 0));
      await planner.whenSettled();
    }

    expect(asks.at(-1)).toEqual({ now: SOLVING.topic, earlier: ['Fractions'], said: 'why', tutorSaid: 'Have a go.' });
  });

  it('keeps the first title, and changes it on a switch and on the way back', async () => {
    const { planner, titles } = plannerWith([newPlan(SOLVING), newPlan(FRACTIONS), { move: 'stay' }, { move: 'back', topic: SOLVING.topic }]);

    for (const [index, words] of ['solve it', 'teach me fractions', 'ok then', 'go back to my problem'].entries()) {
      planner.noteStudentWords(heard(words, index === 0));
      await planner.whenSettled();
    }

    expect(titles).toEqual(['Fractions', SOLVING.topic]);
  });

  it('still changes the title on a switch when the first plan never came', async () => {
    const asks = [() => Promise.reject(new Error('no plan today')), () => Promise.resolve({ move: newPlan(FRACTIONS), costUsd: 0 })];
    const { planner, titles } = plannerWith([], { ask: () => (asks.shift() as () => Promise<PlanAnswer>)() });

    planner.noteStudentWords(heard('solve 2x + 3 = 11', true));
    await planner.whenSettled();
    planner.noteStudentWords(heard('teach me fractions'));
    await planner.whenSettled();

    expect(titles).toEqual(['Fractions']);
  });

  it.each(['(picked 3)', '(has paused)', '(wants something else)', '2x = 8', 'x = 4'])('does not plan on %s', async (words) => {
    const { planner, asks } = plannerWith([{ move: 'stay' }]);

    planner.noteStudentWords(heard(words));
    await planner.whenSettled();

    expect(asks).toEqual([]);
  });

  it('plans on one question in a word, because it may start a lesson', async () => {
    const { planner, asks } = plannerWith([{ move: 'stay' }]);

    planner.noteStudentWords(heard('photosynthesis', true));
    await planner.whenSettled();

    expect(asks).toHaveLength(1);
  });

  it('asks once at a time, and only the latest words wait, so a flood cannot pile up', async () => {
    const { planner, asks } = plannerWith([{ move: 'stay' }]);

    for (const words of ['one thing', 'two things', 'three things', 'four things']) planner.noteStudentWords(heard(words));
    await planner.whenSettled();

    expect(asks.map(({ said }) => said)).toEqual(['one thing', 'four things']);
  });

  it('keeps the lesson it has when a plan fails or says nothing usable', async () => {
    const trace = vi.fn();
    const { planner } = plannerWith([newPlan(FRACTIONS), null], { trace });
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteStudentWords(heard('something odd'));
    await planner.whenSettled();

    expect(planner.getStepNote()).toMatchObject({ topic: 'Fractions' });
  });

  it('spends nothing past a limit, and charges what each plan cost', async () => {
    const charge = vi.fn();
    const closed = plannerWith([newPlan(FRACTIONS)], { canSpend: () => false, charge });
    closed.planner.noteStudentWords(heard('teach me fractions', true));
    await closed.planner.whenSettled();
    expect(closed.asks).toEqual([]);
    expect(charge).not.toHaveBeenCalled();

    const open = plannerWith([newPlan(FRACTIONS)], { charge });
    open.planner.noteStudentWords(heard('teach me fractions', true));
    await open.planner.whenSettled();
    expect(charge).toHaveBeenCalledWith(0.0001);
  });

  it('follows the tutor from a task to teaching again', async () => {
    const { planner } = plannerWith([newPlan(FRACTIONS)]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();

    planner.noteCommand(TASK);
    planner.noteCommand({ kind: 'boardMode', mode: 'teach' });

    expect(planner.getStepNote()).toMatchObject({ step: '2 of 2' });
  });
});

describe('a change of subject', () => {
  it('can never send the student to a new session, whatever the model writes', async () => {
    const replies = ["Sure, that's a big topic. You'd want to start a new session for that.", 'Sure, physics of the impossible. Force fields first.'];
    let index = 0;
    const model = makeFakeTutorModel(() => ({ pieces: [replies[Math.min(index++, 1)] as string] }));
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model, timeouts: QUICK, onTurnEnd: (summary) => summaries.push(summary) });

    for await (const beat of brain.reply({ text: 'teach me physics of the impossible' }, new AbortController().signal)) void beat;

    expect(summaries[0]?.spokenText).not.toMatch(/new session/i);
    expect(summaries[0]?.spokenText).toContain('Force fields');
    expect(summaries[0]?.attempts).toBe(2);
  });

  it('leaves the real limit its own line, which does say so', async () => {
    const model = makeFakeTutorModel(() => ({ pieces: ['Never heard.'] }));
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model, timeouts: QUICK, getSpendLimit: () => 'sessionLimit', onTurnEnd: (summary) => summaries.push(summary) });

    for await (const beat of brain.reply({ text: 'keep going' }, new AbortController().signal)) void beat;

    expect(summaries[0]?.spokenText).toMatch(/new session/i);
  });
});

describe('a claimed feeling', () => {
  const replyTo = async (replies: readonly string[]) => {
    let index = 0;
    const model = makeFakeTutorModel(() => ({ pieces: [replies[Math.min(index++, replies.length - 1)] as string] }));
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model, timeouts: QUICK, onTurnEnd: (summary) => summaries.push(summary) });
    for await (const beat of brain.reply({ text: 'i want to hurt myself' }, new AbortController().signal)) void beat;
    return { summary: summaries[0], model };
  };

  it('goes back for other words before the student hears it', async () => {
    const { summary, model } = await replyTo(["I'm really glad you told me. Please tell an adult you trust now.", 'You did the right thing telling me. Please tell an adult you trust now.']);

    expect(summary?.spokenText).toBe('You did the right thing telling me. Please tell an adult you trust now.');
    expect(JSON.stringify(model.requests[1]?.turns)).toContain('claim a feeling');
  });

  it('lets help out on the second try whatever its words, because a student in crisis must hear it', async () => {
    const { summary } = await replyTo(["I'm really glad you told me. Please tell an adult you trust now.", "I'm glad you said so. Please tell an adult you trust now."]);

    expect(summary?.spokenText).toContain('Please tell an adult you trust now.');
  });

  it.each(["Nothing, I'm afraid.", 'Sorry, say that again?', 'Happy to go on.', 'That matters a lot here.'])('leaves %s alone', async (line) => {
    const { summary } = await replyTo([line]);

    expect(summary?.attempts).toBe(1);
  });
});

describe('the tutor with a lesson planner', () => {
  const never = () => new Promise<PlanAnswer>(() => {});
  const brainWith = (ask: LessonPlannerOptions['ask'], replies: readonly string[] = ['Sure, here we go.']) => {
    let index = 0;
    const model = makeFakeTutorModel(() => ({ pieces: [replies[Math.min(index++, replies.length - 1)] as string] }));
    const planner = createLessonPlanner({ ask, canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    return { model, planner, brain: createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner }) };
  };
  const answer = async (brain: ReturnType<typeof brainWith>['brain'], text: string) => {
    const beats = [];
    for await (const beat of brain.reply({ text }, new AbortController().signal)) beats.push(beat);
    return beats;
  };
  const getPlanNotes = (model: ReturnType<typeof brainWith>['model']) => model.requests.map((request) => request.turns.filter((turn) => 'text' in turn && turn.role === 'system' && turn.text.includes('lesson_plan')).length);

  it('speaks with no plan when the planner never answers', async () => {
    const { brain } = brainWith(never);

    expect(await answer(brain, 'teach me fractions')).toHaveLength(1);
  });

  it('teaches on when every plan fails', async () => {
    const { brain, planner } = brainWith(() => Promise.reject(new Error('no plan today')));

    expect(await answer(brain, 'teach me fractions')).toHaveLength(1);
    await planner.whenSettled();
    expect(await answer(brain, 'go on')).toHaveLength(1);
  });

  it('tells the next turn the step once, and again only when it changes', async () => {
    const { brain, planner, model } = brainWith(() => Promise.resolve({ move: newPlan(FRACTIONS), costUsd: 0 }), ['Sure, here we go.']);

    await answer(brain, 'teach me fractions');
    await planner.whenSettled();
    await answer(brain, 'go on');
    expect(getPlanNotes(model).at(-1)).toBe(1);
    await answer(brain, 'go on again');
    expect(getPlanNotes(model).at(-1)).toBe(2);

    planner.noteCommand(TASK);
    planner.noteCommand({ kind: 'boardMode', mode: 'teach' });
    await answer(brain, 'what next');
    await answer(brain, 'go on');

    expect(getPlanNotes(model).at(-1)).toBe(3);
  });

  it('tells the planner what the student is answering', async () => {
    const ask = vi.fn(() => Promise.resolve({ move: { move: 'stay' } as PlanMove, costUsd: 0 }));
    const { brain, planner } = brainWith(ask, ['Which sport do you like?']);

    await answer(brain, 'teach me projectiles');
    await planner.whenSettled();
    await answer(brain, 'baseball');

    expect(ask).toHaveBeenLastCalledWith({ now: null, earlier: [], said: 'baseball', tutorSaid: 'Which sport do you like?' });
  });

  it('never plans on words that may be about safety, so they cannot become a title', async () => {
    const ask = vi.fn(never);
    const { brain } = brainWith(ask);

    await answer(brain, 'my uncle hits me and i am scared');

    expect(ask).not.toHaveBeenCalled();
  });

  it('moves on when code sees the exercise finished', async () => {
    const task = 'Your turn. {"kind":"writeMath","id":"steps","tex":"2x = 8","claim":"new"}Try it. {"kind":"task","id":"a1","way":"write","on":"steps"}What is x?';
    const { brain, planner } = brainWith(() => Promise.resolve({ move: newPlan(FRACTIONS), costUsd: 0 }), [task]);

    await answer(brain, 'teach me fractions');
    await planner.whenSettled();
    brain.noteWork({ way: 'write', id: 's1' as never, text: 'x = 4', task: 'a1' as never });

    expect(planner.getStepNote()).toMatchObject({ step: '2 of 2' });
  });
});

describe('a task at the end of a reply', () => {
  const collectFrom = async (text: string) => {
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ pieces: [text] })), timeouts: QUICK, onTurnEnd: (summary) => summaries.push(summary) });
    const beats = [];
    for await (const beat of brain.reply({ text: 'teach me greetings' }, new AbortController().signal)) beats.push(beat);
    return { beats, brain, summaries };
  };

  it('lands, so "try it" always has somewhere to go', async () => {
    const { beats, brain, summaries } = await collectFrom('Try it yourself, write the three greetings in order. {"kind":"task","id":"a1","way":"write","reads":"words"}');

    expect(beats.flatMap((beat) => getCues(beat)).map((cue) => cue.command.kind)).toEqual(['task']);
    expect(brain.getBoard().openTask).toBe('a1');
    expect(summaries[0]?.refused).toEqual([]);
    expect(beats.map(getBeatText).join(' ')).toMatch(/^Try it yourself.*in order\. .+/);
  });

  it('never lands after help in a crisis, and then the brain does not think it is open', async () => {
    const { beats, brain } = await collectFrom('That sounds serious. Please tell an adult you trust now, or call your local emergency number if you are in danger. {"kind":"task","id":"a1","way":"write","reads":"words"}');

    expect(beats.flatMap((beat) => getCues(beat))).toEqual([]);
    expect(brain.getBoard().openTask).toBeNull();
    expect(beats.map(getBeatText).join(' ')).not.toMatch(/over to you/i);
  });
});

describe('a sentence with a blank', () => {
  it('goes on the board as text, with a task of words beside it', async () => {
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ pieces: ['Which fits? {"kind":"text","id":"q1","text":"The weather ___ my mood"}Have a look. {"kind":"task","id":"a1","way":"place","items":["affects","effects"],"slots":["The weather ___ my mood"],"answer":["affects"]}Put one in.'] })), timeouts: QUICK });
    const beats = [];
    for await (const beat of brain.reply({ text: 'affect or effect' }, new AbortController().signal)) beats.push(beat);

    expect(beats.flatMap((beat) => getCues(beat)).map((cue) => cue.command.kind)).toEqual(['text', 'task']);
    expect(brain.getBoard().openTask).toBe('a1');
  });

  it('is what the rules tell the tutor to use, and they keep the student line names for the student', () => {
    expect(LESSON_RULES).toContain('"kind":"text","id":"q1","text":"The weather ___ my mood"');
    expect(LESSON_RULES).toMatch(/never writeMath/);
  });
});

describe('asking for the answer', () => {
  const SET_PROBLEM = 'Here. {"kind":"writeMath","id":"steps","tex":"2x + 3 = 11","claim":"new"}Have a go. {"kind":"task","id":"a1","way":"write","on":"steps"}What comes first?';
  it.each(['just tell me', 'just tell me the answer', 'can you just give me the answer', 'whats the answer'])('"%s" gets it the first time, because their own words beat the rule', async (ask) => {
    const traces: string[] = [];
    const replies = [SET_PROBLEM, 'Fine, x is four.'];
    let index = 0;
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ pieces: [replies[Math.min(index++, 1)] as string] })), timeouts: QUICK, trace: (name) => traces.push(name) });
    for await (const beat of brain.reply({ text: 'help me solve 2x + 3 = 11' }, new AbortController().signal)) void beat;
    const beats = [];
    for await (const beat of brain.reply({ text: ask }, new AbortController().signal)) beats.push(beat);

    expect(traces).not.toContain('wordsRefused');
    expect(beats.map(getBeatText).join(' ')).toContain('x is four');
  });

  it('tells the tutor to give it on the first ask, with no argument', () => {
    expect(PROMPT_V2).not.toMatch(/ask for one attempt first|for the answer a second time|If they ask for the answer twice/);
    expect(PROMPT_V2).toMatch(/just tell me/);
  });
});

describe('a words lesson', () => {
  const WORDS_TASK = 'Your turn. {"kind":"task","id":"a1","way":"write","reads":"words"}Say why in your own words.';

  it('moves on when the student has answered a task with no answer key', async () => {
    const planner = createLessonPlanner({ ask: () => Promise.resolve({ move: newPlan(FRACTIONS), costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ pieces: [WORDS_TASK] })), timeouts: QUICK, lessonPlanner: planner });
    for await (const beat of brain.reply({ text: 'teach me fractions' }, new AbortController().signal)) void beat;
    await planner.whenSettled();

    brain.noteWork({ way: 'write', id: 's1' as never, text: 'the bottom says how many parts', task: 'a1' as never });

    expect(planner.getStepNote()).toMatchObject({ step: '2 of 2', next_idea: null, teach_first: 'Equal fractions' });
  });

  it.each([{ way: 'leave' }, { way: 'write', id: 's1', text: 'can we do something else instead' }])('stays on the step when the student leaves it, as %j', async (work) => {
    const planner = createLessonPlanner({ ask: () => Promise.resolve({ move: newPlan(FRACTIONS), costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ pieces: [WORDS_TASK] })), timeouts: QUICK, lessonPlanner: planner });
    for await (const beat of brain.reply({ text: 'teach me fractions' }, new AbortController().signal)) void beat;
    await planner.whenSettled();

    brain.noteWork({ ...work, task: 'a1' } as never);

    expect(planner.getStepNote()).toMatchObject({ step: '1 of 2' });
  });
});

describe('when the exercise is due', () => {
  const note = (planner: ReturnType<typeof plannerWith>['planner']) => planner.getStepNote() as Record<string, unknown>;

  it('comes after two replies of teaching', async () => {
    const { planner } = plannerWith([newPlan(FRACTIONS)]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteReplyEnded({ wasSafety: false });
    expect(note(planner).exercise_due).toBeUndefined();
    planner.noteReplyEnded({ wasSafety: false });
    expect(note(planner).exercise_due).toBe(true);
  });

  it('comes after one reply on a direct question', async () => {
    const { planner } = plannerWith([newPlan(SOLVING)]);
    planner.noteStudentWords(heard('solve it', true));
    await planner.whenSettled();
    planner.noteReplyEnded({ wasSafety: false });
    expect(note(planner).exercise_due).toBe(true);
  });

  it('goes once one is set, and starts over after help in a crisis', async () => {
    const { planner } = plannerWith([newPlan(FRACTIONS)]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteReplyEnded({ wasSafety: false });
    planner.noteReplyEnded({ wasSafety: true });
    expect(note(planner).exercise_due).toBeUndefined();
    planner.noteReplyEnded({ wasSafety: false });
    planner.noteReplyEnded({ wasSafety: false });
    planner.noteCommand(TASK);
    expect(note(planner).exercise_due).toBeUndefined();
  });

  it('never presses a student who asked for no exercises, until they ask for one', async () => {
    const { planner } = plannerWith([newPlan(FRACTIONS), { move: 'stay' }]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteStudentWords(heard('no exercises please, just explain'));
    await planner.whenSettled();
    planner.noteReplyEnded({ wasSafety: false });
    planner.noteReplyEnded({ wasSafety: false });
    expect(note(planner).exercise_due).toBeUndefined();
    planner.noteStudentWords(heard('let me try one now'));
    await planner.whenSettled();
    expect(note(planner).exercise_due).toBe(true);
  });

  it('is not told on a turn that may be about safety', async () => {
    const replies = ['Fractions are parts.', 'Top and bottom.', 'That sounds serious.'];
    let index = 0;
    const model = makeFakeTutorModel(() => ({ pieces: [replies[Math.min(index++, 2)] as string] }));
    const { planner } = plannerWith([newPlan(FRACTIONS)]);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    for (const text of ['teach me fractions', 'ok']) {
      for await (const beat of brain.reply({ text }, new AbortController().signal)) void beat;
      await planner.whenSettled();
    }
    for await (const beat of brain.reply({ text: 'my uncle hits me and i am scared' }, new AbortController().signal)) void beat;

    expect(JSON.stringify(model.requests.at(-1)?.turns.at(-1))).not.toContain('exercise_due');
  });
});

describe('what may become a title', () => {
  const SENSITIVE: readonly [string, string][] = [
    ['teach me what grooming is, my coach does things', 'Recognising grooming behaviour'],
    ['what is the age of consent in lagos', 'Age of consent in Lagos'],
    ['how do antidepressants work', 'How antidepressants work'],
    ['what happens if you overdose', 'Understanding overdoses'],
  ];
  const planFor = (topic: string): LessonPlan => ({ topic, kind: 'teachFirst', steps: [{ teach: 'One', exercise: 'Two' }] });

  it.each(SENSITIVE)('"%s" keeps the title it had, on a shared device', async (words, topic) => {
    const { planner, titles } = plannerWith([newPlan(FRACTIONS), newPlan(planFor(topic))]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteStudentWords(heard(words));
    await planner.whenSettled();

    expect(titles).toEqual([]);
    expect(planner.getStepNote()).toMatchObject({ topic: 'Fractions' });
  });

  it('holds a sensitive word in the title even when the student did not say it', async () => {
    const { planner, titles } = plannerWith([newPlan(FRACTIONS), newPlan(planFor('Recognising grooming'))]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteStudentWords(heard('my coach does weird things'));
    await planner.whenSettled();
    expect(titles).toEqual([]);
  });

  it.each(['The Great Depression', 'Sex-linked traits in peas'.replace('Sex-linked traits in peas', 'Causes of the French Revolution')])('lets "%s" through', async (topic) => {
    const { planner, titles } = plannerWith([newPlan(FRACTIONS), newPlan(planFor(topic))]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteStudentWords(heard(`teach me about ${topic}`));
    await planner.whenSettled();
    expect(titles).toEqual([topic]);
  });

  it.each(['Starting a new topic', 'Choosing a new activity', 'Switching to something else', 'A different subject'])('keeps the old title when a switch names no topic, as "%s"', async (topic) => {
    const { planner, titles } = plannerWith([newPlan(FRACTIONS), newPlan(planFor(topic))]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.noteStudentWords(heard('can we do something else'));
    await planner.whenSettled();
    expect(titles).toEqual([]);
    expect(planner.getStepNote()).toMatchObject({ topic: 'Fractions' });
  });
});

describe('words that need no plan', () => {
  it.each(['ok', 'Yes', 'yeah.', 'okay!', 'got it'])('"%s" costs no planner call', async (words) => {
    const { planner, asks } = plannerWith([newPlan(FRACTIONS)]);
    planner.noteStudentWords(heard(words));
    await planner.whenSettled();
    expect(asks).toEqual([]);
  });
});

describe('sending a student away', () => {
  it.each(['Start a new lesson for that.', 'That needs a different session.', 'Open a new conversation for it.', 'Try another chat.'])('takes back "%s"', async (line) => {
    const replies = [line, 'Sure, black holes next.'];
    let index = 0;
    const summaries: TurnSummary[] = [];
    const brain = createTutorBrain({ model: makeFakeTutorModel(() => ({ pieces: [replies[Math.min(index++, 1)] as string] })), timeouts: QUICK, onTurnEnd: (summary) => summaries.push(summary) });
    for await (const beat of brain.reply({ text: 'teach me black holes' }, new AbortController().signal)) void beat;
    expect(summaries[0]?.spokenText).toContain('black holes next');
  });
});

describe('a page that reloaded', () => {
  it('is told the title again, because it lost what it was told', async () => {
    const { planner, titles } = plannerWith([newPlan(FRACTIONS), newPlan(SOLVING)]);
    planner.noteStudentWords(heard('teach me fractions', true));
    await planner.whenSettled();
    planner.tellTitleAgain();
    expect(titles).toEqual([]);
    planner.noteStudentWords(heard('solve 2x + 3 = 11 instead'));
    await planner.whenSettled();
    planner.tellTitleAgain();
    expect(titles).toEqual(['Solving 2x + 3 = 11', 'Solving 2x + 3 = 11']);
  });
});

describe('a real problem', () => {
  it.each(['balance this for me: H2 + O2 -> H2O', 'whats 3/4 of 120?', "what's 15% of 80?", 'how do I find the slope of y = 3x + 1?', "what's the derivative of x cubed", 'a ball is thrown up at 10 m/s, how long until it lands?', "should i write affect or effect in 'the weather ___ my mood'", 'which came first, the French Revolution or the American one?'])('gets a task in this reply: %s', (words) => {
    expect(getProblemNote(words)).not.toBeNull();
  });

  it.each(['whats the capital of australia', 'why is the sky blue?', 'teach me fractions', 'teach me how to solve 2x + 3 = 11', "what's the derivative of x cubed? just explain it to me, I don't want to try one", 'just tell me the answer to 3x - 5 = 16'])('is not pressed on: %s', (words) => {
    expect(getProblemNote(words)).toBeNull();
  });

  it('reaches the tutor with the words, and only when no task is open', async () => {
    const replies = ['Sure. {"kind":"task","id":"a1","way":"write","reads":"words"}Have a go.', 'Keep going.'];
    let index = 0;
    const model = makeFakeTutorModel(() => ({ pieces: [replies[Math.min(index++, 1)] as string] }));
    const { planner } = plannerWith([{ move: 'stay' }]);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    for await (const beat of brain.reply({ text: 'solve 2x + 3 = 11' }, new AbortController().signal)) void beat;
    expect(JSON.stringify(model.requests.at(-1)?.turns)).toContain('problem_now');
    for await (const beat of brain.reply({ text: 'what about 3x = 9' }, new AbortController().signal)) void beat;
    const lastTurn = JSON.stringify(model.requests.at(-1)?.turns.at(-1));
    expect(lastTurn).not.toContain('problem_now');
  });

  it('is not pressed when the words may be about safety', async () => {
    const model = makeFakeTutorModel(() => ({ pieces: ['That sounds serious.'] }));
    const { planner } = plannerWith([{ move: 'stay' }]);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    for await (const beat of brain.reply({ text: 'how many of 20 pills would kill me' }, new AbortController().signal)) void beat;
    expect(JSON.stringify(model.requests.at(-1)?.turns)).not.toContain('problem_now');
  });
});

describe('a wish to be taught', () => {
  it.each(['Teach me fractions', 'explain how gravity works', "I'd like to learn about Shakespeare's sonnets", 'Give me a lesson on the causes of World War One', 'i wanna learn why ww1 started'])('holds its first reply back from a task: %s', (words) => {
    expect(getTeachFirstNote(words, false)).not.toBeNull();
  });

  it.each(['the roman empire', 'photosynthesis', 'quantum tunneling'])('reads "%s" as a topic when it opens the session', (words) => {
    expect(getTeachFirstNote(words, true)).not.toBeNull();
    expect(getTeachFirstNote(words, false)).toBeNull();
  });

  it.each(['why is the sky blue?', 'solve 2x = 8', 'let me try one', 'yes', 'teach me what grooming is, my coach does things'])('says nothing on: %s', (words) => {
    expect(getTeachFirstNote(words, true)).toBeNull();
  });
});
