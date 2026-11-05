import { hasWorkingToDo, type LessonKind, type LessonPlan, type LessonStep, type PlanMove } from './lesson-plan.ts';

interface ActivePlan {
  plan: LessonPlan;
  stepIndex: number;
  isExerciseOpen: boolean;
  /** How many replies had ended when this step began. */
  stepStartReply: number;
  hasHadExercise?: boolean;
  /** The tutor has worked one on the board, so the exercise can follow it. */
  hasWorkedExample?: boolean;
  leadsOnStep?: number;
  teachingAskedAtReply?: number;
}

/** The lesson now, and the ones the student left, newest first, so they can go back. */
export interface LessonState {
  active: ActivePlan | null;
  shelved: readonly ActivePlan[];
  repliesEnded: number;
  /** They said no exercises, which holds until they ask for one. */
  isExerciseDeclined: boolean;
}

export type LessonEvent =
  /** The tutor set something for the student to do. */
  | 'exerciseSet'
  /** The tutor worked one on the board. */
  | 'exampleShown'
  /** The student cut across most of it, so it has not been seen. */
  | 'exampleCut'
  /** Code saw the student finish it. */
  | 'exerciseDone'
  /** The student left it for something else, so this step is not over. */
  | 'exerciseLeft'
  /** The tutor went back to teaching with an exercise open, which is how words with no answer key end. */
  | 'teachingAgain'
  | 'replyEnded'
  | 'leadEnded'
  /** Help in a crisis is not teaching, so the step's count starts over. */
  | 'safetyReplyEnded'
  | 'exerciseDeclined'
  | 'exerciseWanted'
  | 'teachingWanted'
  | 'movedOn'
  | 'skipped';

/** The only part of a plan the tutor is told on a turn, because everything before it stays cached. */
export type ExerciseKind = 'problem' | 'board';

export type StepNote = { topic: string; kind: LessonKind; is_finished: true } | { topic: string; kind: LessonKind; step: string; teach_first: string | null; then_exercise: string; next_idea: string | null; worked_example_due?: true; exercise_due?: true; exercise_kind?: ExerciseKind; material?: readonly string[]; picture_topic?: string; picture_coming?: true };

export const NO_LESSON: LessonState = { active: null, shelved: [], repliesEnded: 0, isExerciseDeclined: false };

const MOST_SHELVED = 8;

/** A reply or two to teach one idea when they are talking, and a direct question has none to teach. */
const REPLIES_BEFORE_THE_EXERCISE: Record<LessonKind, number> = { handsOn: 1, teachFirst: 2 };
const MOST_REPLIES_ON_A_STEP = 12;
const REPLIES_ON_A_CARD_STEP = 3;
/** A teaching reply runs 40 to 80 words, so three of them hold about what seven short ones did. */
const REPLIES_WHILE_LISTENING: Record<LessonKind, number> = { handsOn: 1, teachFirst: 3 };
const REPLIES_WHILE_LISTENING_ON_A_CARD = 3;

const getRepliesBeforeTheExercise = ({ plan, stepIndex }: ActivePlan) => (plan.steps[stepIndex]?.material ? REPLIES_ON_A_CARD_STEP : REPLIES_BEFORE_THE_EXERCISE[plan.kind]);

const getRepliesWhileListening = ({ plan, stepIndex }: ActivePlan) => (plan.steps[stepIndex]?.material ? REPLIES_WHILE_LISTENING_ON_A_CARD : REPLIES_WHILE_LISTENING[plan.kind]);

const isCountReached = (active: ActivePlan, replies: number) => replies - (active.leadsOnStep ?? 0) >= getRepliesBeforeTheExercise(active) || replies >= getRepliesWhileListening(active);

const hasTaughtThisStep = (active: ActivePlan, repliesEnded: number) => active.hasHadExercise === true || isCountReached(active, repliesEnded - active.stepStartReply);

const isNotTopic = (topic: string) => (other: ActivePlan) => other.plan.topic.toLowerCase() !== topic.toLowerCase();

const shelve = (active: ActivePlan | null, shelved: readonly ActivePlan[]) => (active ? [{ ...active, isExerciseOpen: false }, ...shelved].slice(0, MOST_SHELVED) : shelved);

/** `startReply` is how many replies had ended when the student said this, because a plan can land before or after that reply ends. */
export function getStateAfterMove(state: LessonState, move: PlanMove, startReply = state.repliesEnded): LessonState {
  if (move.move === 'stay') return state;
  if (move.move === 'new') {
    // The planner can name the topic they are already on, and that must not start the lesson over.
    if (state.active && !isNotTopic(move.plan.topic)(state.active)) return state;
    return { ...state, active: { plan: move.plan, stepIndex: 0, isExerciseOpen: false, stepStartReply: startReply }, shelved: shelve(state.active, state.shelved).filter(isNotTopic(move.plan.topic)) };
  }
  const earlier = state.shelved.find((other) => !isNotTopic(move.topic)(other));
  if (!earlier) return state;
  // A problem they ask for again is not over, even if the tutor had finished with it.
  const stepIndex = Math.min(earlier.stepIndex, earlier.plan.steps.length - 1);
  return { ...state, active: { ...earlier, stepIndex, stepStartReply: startReply }, shelved: shelve(state.active, state.shelved.filter((other) => other !== earlier)) };
}

function getActiveAfterEvent(active: ActivePlan, event: LessonEvent, repliesEnded: number): ActivePlan {
  const nextStep = { ...active, stepIndex: Math.min(active.stepIndex + 1, active.plan.steps.length), isExerciseOpen: false, stepStartReply: repliesEnded, hasHadExercise: false, hasWorkedExample: false, teachingAskedAtReply: 0, leadsOnStep: 0 };
  switch (event) {
    case 'exerciseSet':
      return { ...active, isExerciseOpen: true, hasHadExercise: true };
    case 'exampleShown':
      return { ...active, hasWorkedExample: true };
    case 'exampleCut':
      return { ...active, hasWorkedExample: false };
    case 'exerciseLeft':
      return { ...active, isExerciseOpen: false, stepStartReply: repliesEnded };
    case 'exerciseDone':
      return nextStep;
    case 'teachingWanted':
      return hasTaughtThisStep(active, repliesEnded) ? nextStep : { ...active, isExerciseOpen: false, teachingAskedAtReply: repliesEnded };
    case 'teachingAgain':
      return active.isExerciseOpen ? nextStep : active;
    case 'movedOn':
    case 'skipped':
      return nextStep;
    case 'safetyReplyEnded':
      return { ...active, stepStartReply: repliesEnded };
    case 'exerciseWanted':
      return { ...active, stepStartReply: repliesEnded - getRepliesBeforeTheExercise(active), hasWorkedExample: true, teachingAskedAtReply: 0, leadsOnStep: 0 };
    case 'leadEnded':
      return { ...active, leadsOnStep: (active.leadsOnStep ?? 0) + 1 };
    case 'replyEnded':
    case 'exerciseDeclined':
      return active;
  }
}

export function getStateAfterEvent(state: LessonState, event: LessonEvent): LessonState {
  const repliesEnded = state.repliesEnded + (event === 'replyEnded' || event === 'leadEnded' || event === 'safetyReplyEnded' ? 1 : 0);
  const isExerciseDeclined = event === 'exerciseDeclined' ? true : event === 'exerciseWanted' ? false : state.isExerciseDeclined;
  const active = state.active && getActiveAfterEvent(state.active, event, repliesEnded);
  const isPastThisStep = active !== null && (event === 'replyEnded' || event === 'leadEnded') && !active.isExerciseOpen && active.plan.kind === 'teachFirst' && (repliesEnded - active.stepStartReply >= MOST_REPLIES_ON_A_STEP || (isExerciseDeclined && hasTaughtThisStep(active, repliesEnded)));
  return { ...state, repliesEnded, isExerciseDeclined, active: isPastThisStep ? getActiveAfterEvent(active, 'movedOn', repliesEnded) : active };
}

const isExerciseDue = ({ active, repliesEnded, isExerciseDeclined }: LessonState) => active !== null && !isExerciseDeclined && !active.isExerciseOpen && isCountReached(active, repliesEnded - Math.max(active.stepStartReply, active.teachingAskedAtReply ?? 0));

// A direct question is their own problem, so it goes straight to them. A first exercise on anything with working has one worked for them before it.
const hasWorkToShow = ({ plan }: ActivePlan, step: LessonStep) => plan.isQuizOnly !== true && hasWorkingToDo(step);

const isExampleOwed = (active: ActivePlan, step: LessonStep) => active.plan.kind === 'teachFirst' && hasWorkToShow(active, step) && active.hasWorkedExample !== true && active.hasHadExercise !== true;

const getDueNote = (active: ActivePlan, step: LessonStep) => (isExampleOwed(active, step) ? { worked_example_due: true as const } : { exercise_due: true as const, exercise_kind: hasWorkToShow(active, step) ? ('problem' as const) : ('board' as const) });

export function getStepNote(state: LessonState): StepNote | null {
  const { active } = state;
  if (!active) return null;
  const { plan, stepIndex } = active;
  const step = plan.steps[stepIndex];
  if (!step) return { topic: plan.topic, kind: plan.kind, is_finished: true };
  const isDue = isExerciseDue(state);
  const isPictureComing = step.picture !== undefined && stepIndex > 0 && state.repliesEnded === active.stepStartReply;
  return { topic: plan.topic, kind: plan.kind, step: `${stepIndex + 1} of ${plan.steps.length}`, teach_first: step.teach, then_exercise: step.exercise, next_idea: plan.steps[stepIndex + 1]?.teach ?? null, ...(isDue ? getDueNote(active, step) : {}), ...(step.material && !isDue ? { material: step.material } : {}), ...(isPictureComing ? { picture_coming: true as const } : {}) };
}

export function getStateWithMoreSteps(state: LessonState, topic: string, steps: readonly LessonStep[]): LessonState {
  if (state.active?.plan.topic !== topic) return state;
  return { ...state, active: { ...state.active, plan: { ...state.active.plan, steps: [...state.active.plan.steps, ...steps] } } };
}

export const getStepsTaught = ({ active }: LessonState) => active?.plan.steps.flatMap(({ teach }) => teach ?? []) ?? [];

export const getExercisesSet = ({ active }: LessonState) => active?.plan.steps.map(({ exercise }) => exercise) ?? [];

export const isNearTheEnd = ({ active }: LessonState) => active !== null && active.plan.kind === 'teachFirst' && active.stepIndex >= active.plan.steps.length - 2;

export const getStepCount = ({ active }: LessonState) => active?.plan.steps.length ?? 0;

export const getShelvedTopics = ({ shelved }: LessonState) => shelved.map(({ plan }) => plan.topic);
