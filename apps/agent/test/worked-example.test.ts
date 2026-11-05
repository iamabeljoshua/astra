import { getBeatText } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { toCardPlan } from '../src/lesson-plan/card-lesson.ts';
import { hasWorkingToDo } from '../src/lesson-plan/lesson-plan.ts';
import { createLessonPlanner } from '../src/lesson-plan/lesson-planner.ts';
import { getStateAfterEvent, getStateAfterMove, getStepNote, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import { LEAD_WORDS } from '../src/live/tutor-lead.ts';
import { createTutorBrain } from '../src/tutor/brain.ts';

const QUICK = { firstTextMs: 300, betweenTextMs: 200, finishGraceMs: 20, reportWaitMs: 5, safetyReadWaitMs: 40 };
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const WORKING = { topic: 'Escape speed', kind: 'teachFirst' as const, steps: [{ teach: 'Escape speed', exercise: 'Work out 11.2 over 2.4.' }, { teach: 'Orbits', exercise: 'Work out 7.8 over 2.' }] };
const HISTORY = { topic: 'The French Revolution', kind: 'teachFirst' as const, steps: [{ teach: 'The Bastille falls', exercise: 'Put the events of 1789 and 1793 in order.' }] };
const OWN_PROBLEM = { topic: 'Solving 2x + 3 = 11', kind: 'handsOn' as const, steps: [{ teach: null, exercise: '2x + 3 = 11' }] };

const at = (plan: typeof WORKING | typeof HISTORY | typeof OWN_PROBLEM) => getStateAfterMove(NO_LESSON, { move: 'new', plan });
const afterReplies = (count: number, state: ReturnType<typeof at>) => Array.from({ length: count }).reduce<typeof state>((next) => getStateAfterEvent(next, 'leadEnded'), state);

describe('the order of an idea with working to do', () => {
  it('teaches, then works one on the board, then lets them try', () => {
    const taught = afterReplies(3, at(WORKING));
    expect(getStepNote(taught)).toMatchObject({ worked_example_due: true });
    expect(getStepNote(taught)).not.toHaveProperty('exercise_due');
    const shown = getStateAfterEvent(taught, 'exampleShown');
    expect(getStepNote(shown)).toMatchObject({ exercise_due: true, exercise_kind: 'problem' });
    expect(getStepNote(shown)).not.toHaveProperty('worked_example_due');
  });

  it('owes one again on the next idea', () => {
    const shown = getStateAfterEvent(afterReplies(3, at(WORKING)), 'exampleShown');
    const next = afterReplies(3, getStateAfterEvent(getStateAfterEvent(shown, 'exerciseSet'), 'exerciseDone'));
    expect(getStepNote(next)).toMatchObject({ step: '2 of 2', worked_example_due: true });
  });

  it('owes it again when the student cut across most of it', () => {
    const cut = getStateAfterEvent(getStateAfterEvent(afterReplies(3, at(WORKING)), 'exampleShown'), 'exampleCut');
    expect(getStepNote(cut)).toMatchObject({ worked_example_due: true });
  });

  it('goes straight to the exercise when they ask to try one', () => {
    expect(getStepNote(getStateAfterEvent(afterReplies(2, at(WORKING)), 'exerciseWanted'))).toMatchObject({ exercise_due: true });
  });
});

describe('where there is nothing to work out', () => {
  it('quizzes a history card on the board, whatever numbers its lines hold', () => {
    const plan = toCardPlan({ title: 'How bread prices fed a revolution', subject: 'History', ideas: [{ title: 'Bread prices', lines: ['A loaf cost half a day of pay, about 8 sous.'], hasScene: false }] });
    expect(getStepNote(afterReplies(3, at(plan as never)))).toMatchObject({ exercise_due: true, exercise_kind: 'board' });
  });

  it('keeps worked examples for a physics card', () => {
    const plan = toCardPlan({ title: 'How a rocket escapes Earth', subject: 'Physics', ideas: [{ title: 'Escape speed', lines: ['About eleven kilometers every second.'], hasScene: false }] });
    expect(getStepNote(afterReplies(3, at(plan as never)))).toMatchObject({ worked_example_due: true });
  });

  it('reads a card idea with no lines by its title', () => {
    const plan = toCardPlan({ title: 'Rockets', subject: 'Physics', ideas: [{ title: 'Why rockets carry so much fuel', lines: [], hasScene: false }] });
    expect(getStepNote(afterReplies(3, at(plan as never)))).toMatchObject({ worked_example_due: true });
  });

  it('quizzes on the board with no example on history, whatever dates it holds', () => {
    expect(getStepNote(afterReplies(3, at(HISTORY)))).toMatchObject({ exercise_due: true, exercise_kind: 'board' });
    expect(hasWorkingToDo(HISTORY.steps[0] as never)).toBe(false);
  });

  it('reads a card of dates as having no working', () => {
    expect(hasWorkingToDo({ teach: 'Bread in 1789', exercise: 'Put these in order.', material: ['In 1789 the harvest failed.', 'A loaf took most of a day of pay.'] })).toBe(false);
  });

  it('keeps a direct question on its own problem hands-on', () => {
    expect(getStepNote(afterReplies(1, at(OWN_PROBLEM)))).toMatchObject({ exercise_due: true });
  });
});

describe('a quiz that only tests memory', () => {
  it('goes back once when a blank is what the tutor just said', async () => {
    const { getRepeatedLineProblem } = await import('../src/tutor/board-memory.ts');
    const blank = { kind: 'text', id: 'q1', text: 'An orbit is ___ that keeps missing the ground' } as never;
    expect(getRepeatedLineProblem(blank, 'So an orbit is really falling that keeps missing the ground, all the way round.')).not.toBeNull();
    expect(getRepeatedLineProblem(blank, 'Rockets burn fuel to climb through the thick air.')).toBeNull();
  });
});

describe('the brain on a worked example', () => {
  const planned = () => {
    const planner = createLessonPlanner({ ask: async () => ({ move: { move: 'stay' }, costUsd: 0 }), canSpend: () => true, charge: () => {}, onTitleChange: () => {}, trace: () => {} });
    planner.noteCardLesson(WORKING);
    for (let index = 0; index < 3; index += 1) planner.noteReplyEnded({ wasSafety: false, wasLead: true, spoken: '' });
    return planner;
  };
  const makeModel = (replies: readonly string[]) => {
    const seen: string[] = [];
    let index = 0;
    const model = { getCostUsd: () => 0, compact: async () => null, warm: async () => {}, async *stream(request: { turns: unknown }) { seen.push(JSON.stringify(request.turns)); yield { type: 'text' as const, text: replies[Math.min(index++, replies.length - 1)] as string, isNewBlock: false }; yield { type: 'finished' as const, stopReason: 'finished' as const, refusalCategory: null, usage: USAGE }; } };
    return { model: model as never, seen };
  };
  const leadOn = async (brain: ReturnType<typeof createTutorBrain>) => {
    brain.noteLead('next');
    const said: string[] = [];
    for await (const beat of brain.reply({ text: LEAD_WORDS.next, lead: 'next' }, new AbortController().signal)) said.push(getBeatText(beat));
    return said.join(' ');
  };
  const WORKED = 'Lets work one. {"kind":"writeMath","id":"worked","tex":"2x + 3 = 11","claim":"new"}Two x plus three is eleven. {"kind":"transformMath","target":"worked","tex":"2x = 8","claim":"step"}Take three off both sides, which leaves two x equals eight.';

  it('tells the tutor to work it, and moves to the exercise once a line was written', async () => {
    const planner = planned();
    const { model, seen } = makeModel([WORKED]);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    expect(await leadOn(brain)).toContain('Take three off both sides');
    expect(seen[0]).toContain('worked_example_due');
    expect(seen[0]).toContain('work one example yourself');
    expect(planner.getStepNote()).toMatchObject({ exercise_due: true });
  });

  it('sends a task set before the example back, and it counts as no exercise', async () => {
    const planner = planned();
    const { model, seen } = makeModel(['Have a go. {"kind":"task","id":"a1","way":"write","reads":"words"}Off you go.', WORKED]);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    await leadOn(brain);
    expect(seen).toHaveLength(2);
    expect(brain.getBoard().openTask).toBeNull();
  });

  it('gives a lead that drew nothing one more go, then moves on', async () => {
    const planner = planned();
    const { model } = makeModel(['Think about the speed for a moment, because it matters.']);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    await leadOn(brain);
    expect(planner.getStepNote()).toMatchObject({ worked_example_due: true });
    await leadOn(brain);
    expect(planner.getStepNote()).toMatchObject({ exercise_due: true });
  });

  it('refuses an exercise on the line it just worked', async () => {
    const planner = planned();
    const { model, seen } = makeModel([WORKED, 'Try it. {"kind":"writeMath","id":"p1","tex":"2x + 3 = 11","claim":"new"}Two x plus three is eleven. {"kind":"task","id":"a1","way":"write","on":"p1"}Go on.', 'Try this. {"kind":"writeMath","id":"p2","tex":"3x + 1 = 10","claim":"new"}Three x plus one is ten. {"kind":"task","id":"a2","way":"write","on":"p2"}Go on.']);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner });
    await leadOn(brain);
    await leadOn(brain);
    expect(seen.at(-1)).toContain('already had this exact problem');
    expect(brain.getBoard().openTask).toBe('a2');
  });

  it('lets a student with a showed note go straight to one a notch harder', async () => {
    const planner = planned();
    const { model, seen } = makeModel(['Try this. {"kind":"writeMath","id":"p2","tex":"3x + 1 = 10","claim":"new"}Three x plus one is ten. {"kind":"task","id":"a2","way":"write","on":"p2"}Go on.']);
    const brain = createTutorBrain({ model, timeouts: QUICK, lessonPlanner: planner, memory: { memory: { count: 1, notes: [{ kind: 'showed', about: 'escape speed', days_ago: 2, known_from: 'board' }] } } as never });
    await leadOn(brain);
    expect(seen).toHaveLength(1);
    expect(brain.getBoard().openTask).toBe('a2');
  });
});
