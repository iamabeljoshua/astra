import type { LessonKind, LessonPlan, PlanMove } from './lesson-plan.ts';

interface ActivePlan {
  plan: LessonPlan;
  stepIndex: number;
  isExerciseOpen: boolean;
  /** How many replies had ended when this step began. */
  stepStartReply: number;
  /** An exercise was set on this step, so its idea has been taught even if they left it. */
  hasHadExercise?: boolean;
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
  /** Code saw the student finish it. */
  | 'exerciseDone'
  /** The student left it for something else, so this step is not over. */
  | 'exerciseLeft'
  /** The tutor went back to teaching with an exercise open, which is how words with no answer key end. */
  | 'teachingAgain'
  | 'replyEnded'
  /** Help in a crisis is not teaching, so the step's count starts over. */
  | 'safetyReplyEnded'
  | 'exerciseDeclined'
  | 'exerciseWanted'
  /** They asked to go on, in whatever words. Their own words beat the count. */
  | 'teachingWanted'
  | 'movedOn'
  | 'skipped';

/** The only part of a plan the tutor is told on a turn, because everything before it stays cached. */
export type StepNote = { topic: string; kind: LessonKind; is_finished: true } | { topic: string; kind: LessonKind; step: string; teach_first: string | null; then_exercise: string; next_idea: string | null; exercise_due?: true; material?: readonly string[]; picture_topic?: string; picture_coming?: true };

export const NO_LESSON: LessonState = { active: null, shelved: [], repliesEnded: 0, isExerciseDeclined: false };

const MOST_SHELVED = 8;

/** Short turns take a reply or two to teach one idea, and a direct question has none to teach. */
const REPLIES_BEFORE_THE_EXERCISE: Record<LessonKind, number> = { handsOn: 1, teachFirst: 2 };
/** A card's lines take longer to say than a planner's few words. */
const REPLIES_ON_A_CARD_STEP = 3;

const getRepliesBeforeTheExercise = ({ plan, stepIndex }: ActivePlan) => (plan.steps[stepIndex]?.material ? REPLIES_ON_A_CARD_STEP : REPLIES_BEFORE_THE_EXERCISE[plan.kind]);

const hasTaughtThisStep = (active: ActivePlan, repliesEnded: number) => active.hasHadExercise === true || repliesEnded - active.stepStartReply >= getRepliesBeforeTheExercise(active);

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
  const nextStep = { ...active, stepIndex: active.stepIndex + 1, isExerciseOpen: false, stepStartReply: repliesEnded, hasHadExercise: false };
  switch (event) {
    case 'exerciseSet':
      return { ...active, isExerciseOpen: true, hasHadExercise: true };
    case 'exerciseLeft':
      return { ...active, isExerciseOpen: false, stepStartReply: repliesEnded };
    case 'exerciseDone':
      return nextStep;
    case 'teachingWanted':
      return hasTaughtThisStep(active, repliesEnded) ? nextStep : { ...active, isExerciseOpen: false, stepStartReply: repliesEnded };
    case 'teachingAgain':
      return active.isExerciseOpen ? nextStep : active;
    case 'movedOn':
    case 'skipped':
      return nextStep;
    case 'safetyReplyEnded':
      return { ...active, stepStartReply: repliesEnded };
    case 'exerciseWanted':
      return { ...active, stepStartReply: repliesEnded - getRepliesBeforeTheExercise(active) };
    case 'replyEnded':
    case 'exerciseDeclined':
      return active;
  }
}

export function getStateAfterEvent(state: LessonState, event: LessonEvent): LessonState {
  const repliesEnded = state.repliesEnded + (event === 'replyEnded' || event === 'safetyReplyEnded' ? 1 : 0);
  const isExerciseDeclined = event === 'exerciseDeclined' ? true : event === 'exerciseWanted' ? false : state.isExerciseDeclined;
  const active = state.active && getActiveAfterEvent(state.active, event, repliesEnded);
  // A student who said no exercises would otherwise stay on this step for good, because finishing one is what moves a lesson on.
  const isPastThisStep = active !== null && isExerciseDeclined && event === 'replyEnded' && hasTaughtThisStep(active, repliesEnded);
  return { ...state, repliesEnded, isExerciseDeclined, active: isPastThisStep ? getActiveAfterEvent(active, 'movedOn', repliesEnded) : active };
}

const isExerciseDue = ({ active, repliesEnded, isExerciseDeclined }: LessonState) => active !== null && !isExerciseDeclined && !active.isExerciseOpen && repliesEnded - active.stepStartReply >= getRepliesBeforeTheExercise(active);

export function getStepNote(state: LessonState): StepNote | null {
  const { active } = state;
  if (!active) return null;
  const { plan, stepIndex } = active;
  const step = plan.steps[stepIndex];
  if (!step) return { topic: plan.topic, kind: plan.kind, is_finished: true };
  const isDue = isExerciseDue(state);
  // The lines are for teaching, and each note costs tokens, so one that only says the exercise is due leaves them out.
  const isPictureComing = step.picture !== undefined && stepIndex > 0 && state.repliesEnded === active.stepStartReply;
  return { topic: plan.topic, kind: plan.kind, step: `${stepIndex + 1} of ${plan.steps.length}`, teach_first: step.teach, then_exercise: step.exercise, next_idea: plan.steps[stepIndex + 1]?.teach ?? null, ...(isDue ? { exercise_due: true as const } : {}), ...(step.material && !isDue ? { material: step.material } : {}), ...(isPictureComing ? { picture_coming: true as const } : {}) };
}

export const getShelvedTopics = ({ shelved }: LessonState) => shelved.map(({ plan }) => plan.topic);
