import type { LessonKind, LessonPlan, PlanMove } from './lesson-plan.ts';

interface ActivePlan {
  plan: LessonPlan;
  stepIndex: number;
  isExerciseOpen: boolean;
}

/** The lesson now, and the ones the student left, newest first, so they can go back. */
export interface LessonState {
  active: ActivePlan | null;
  shelved: readonly ActivePlan[];
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
  | 'movedOn'
  | 'skipped';

/** The only part of a plan the tutor is told on a turn, because everything before it stays cached. */
export type StepNote = { topic: string; kind: LessonKind; is_finished: true } | { topic: string; kind: LessonKind; step: string; teach_first: string | null; then_exercise: string; next_idea: string | null; picture_topic?: string };

export const NO_LESSON: LessonState = { active: null, shelved: [] };

const MOST_SHELVED = 8;

const isNotTopic = (topic: string) => (other: ActivePlan) => other.plan.topic.toLowerCase() !== topic.toLowerCase();

const shelve = (active: ActivePlan | null, shelved: readonly ActivePlan[]) => (active ? [{ ...active, isExerciseOpen: false }, ...shelved].slice(0, MOST_SHELVED) : shelved);

export function getStateAfterMove(state: LessonState, move: PlanMove): LessonState {
  if (move.move === 'stay') return state;
  if (move.move === 'new') {
    // The planner can name the topic they are already on, and that must not start the lesson over.
    if (state.active && !isNotTopic(move.plan.topic)(state.active)) return state;
    return { active: { plan: move.plan, stepIndex: 0, isExerciseOpen: false }, shelved: shelve(state.active, state.shelved).filter(isNotTopic(move.plan.topic)) };
  }
  const earlier = state.shelved.find((other) => !isNotTopic(move.topic)(other));
  if (!earlier) return state;
  // A problem they ask for again is not over, even if the tutor had finished with it.
  const stepIndex = Math.min(earlier.stepIndex, earlier.plan.steps.length - 1);
  return { active: { ...earlier, stepIndex }, shelved: shelve(state.active, state.shelved.filter((other) => other !== earlier)) };
}

function getActiveAfterEvent(active: ActivePlan, event: LessonEvent): ActivePlan {
  switch (event) {
    case 'exerciseSet':
      return { ...active, isExerciseOpen: true };
    case 'exerciseLeft':
      return { ...active, isExerciseOpen: false };
    case 'exerciseDone':
      return { ...active, stepIndex: active.stepIndex + 1, isExerciseOpen: false };
    case 'teachingAgain':
      return active.isExerciseOpen ? { ...active, stepIndex: active.stepIndex + 1, isExerciseOpen: false } : active;
    case 'movedOn':
    case 'skipped':
      return { ...active, stepIndex: active.stepIndex + 1, isExerciseOpen: false };
  }
}

export function getStateAfterEvent(state: LessonState, event: LessonEvent): LessonState {
  return state.active ? { ...state, active: getActiveAfterEvent(state.active, event) } : state;
}

export function getStepNote({ active }: LessonState): StepNote | null {
  if (!active) return null;
  const { plan, stepIndex } = active;
  const step = plan.steps[stepIndex];
  if (!step) return { topic: plan.topic, kind: plan.kind, is_finished: true };
  return { topic: plan.topic, kind: plan.kind, step: `${stepIndex + 1} of ${plan.steps.length}`, teach_first: step.teach, then_exercise: step.exercise, next_idea: plan.steps[stepIndex + 1]?.teach ?? null };
}

export const getShelvedTopics = ({ shelved }: LessonState) => shelved.map(({ plan }) => plan.topic);
