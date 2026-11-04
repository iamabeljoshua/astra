import { readLine } from '@astra/board/shared';
import type { CheckedWork } from '@astra/board/shared';
import type { SceneCommand } from '@astra/contracts';
import type { PlanAnswer, PlanAsk } from './ask-planner.ts';
import type { PlanMove } from './lesson-plan.ts';
import { getShelvedTopics, getStateAfterEvent, getStateAfterMove, getStepNote, type LessonEvent, type LessonState, NO_LESSON, type StepNote } from './plan-progress.ts';

export interface HeardWords {
  words: string;
  /** The first words of a room come from the session's own title, so they name its topic and never rename it. */
  isOpening: boolean;
  tutorSaid: string;
}

export interface LessonPlanner {
  /** Starts planning beside the reply and returns at once, so a plan never holds a word. */
  noteStudentWords(heard: HeardWords): void;
  noteCommand(command: SceneCommand): void;
  noteWorkChecked(checked: Pick<CheckedWork, 'verdict' | 'closesTask'>): void;
  getStepNote(): StepNote | null;
  /** The tutor went on to the next idea by asking for its picture. */
  moveToNextStep(): void;
  /** Settles when no plan is on its way, for an evaluation that reads the next step straight after. */
  whenSettled(): Promise<void>;
}

export interface LessonPlannerOptions {
  ask(request: PlanAsk): Promise<PlanAnswer>;
  canSpend(): boolean;
  charge(usd: number): void;
  /** The lesson changed to another topic in the same session. */
  onTitleChange(title: string): void;
  /** Tells whatever prepares for the lesson that the plan or its step changed, and never waits for it. */
  onLessonChange?(state: LessonState): void;
  /** A picture of the next idea that can land now, for the tutor to ask for by name. */
  getReadyPicture?(): string | null;
  trace(name: string, fields?: Record<string, unknown>): void;
  getNowMs?(): number;
}

/** Skipping a picture or a step is the student's call, and a plan is too slow to hear it before the next pause. "Skip count" is a subject, so the word must stand alone or point at something. */
const ASKS_TO_SKIP = /\bskip\s+(?:that|this|it|ahead)\b|\bskip[.!?\s]*$|\bmove on\b/i;

/** Code's own stage words, such as "(picked 3)", are not the student saying anything. */
const isStageWords = (words: string) => words.startsWith('(');

const isLineOfWork = (words: string) => readLine(words).kind === 'math';

const toEvent = (command: SceneCommand): LessonEvent | null => {
  if (command.kind === 'task') return 'exerciseSet';
  return command.kind === 'boardMode' && command.mode === 'teach' ? 'teachingAgain' : null;
};

const getWorkEvent = ({ verdict, closesTask }: Pick<CheckedWork, 'verdict' | 'closesTask'>): LessonEvent | null => {
  if (!closesTask) return null;
  return verdict.status === 'unknown' ? 'exerciseLeft' : 'exerciseDone';
};

// Holds the lesson in code. One plan runs at a time and only the latest words wait, so a flood of lines costs one call at a time.
export function createLessonPlanner({ ask, canSpend, charge, onTitleChange, onLessonChange, getReadyPicture, trace, getNowMs = () => performance.now() }: LessonPlannerOptions): LessonPlanner {
  let state: LessonState = NO_LESSON;
  let waiting: HeardWords | null = null;
  let asking: Promise<void> | null = null;

  const adopt = (move: PlanMove, isOpening: boolean) => {
    const hadTopic = state.active?.plan.topic ?? null;
    state = getStateAfterMove(state, move);
    const topic = state.active?.plan.topic ?? null;
    if (!isOpening && topic !== null && topic !== hadTopic) onTitleChange(topic);
    onLessonChange?.(state);
  };

  const askOnce = async ({ words: said, isOpening, tutorSaid }: HeardWords) => {
    if (!canSpend()) return;
    const startedAtMs = getNowMs();
    try {
      const { move, costUsd } = await ask({ now: state.active?.plan.topic ?? null, earlier: getShelvedTopics(state), said, tutorSaid });
      charge(costUsd);
      trace('planAnswered', { move: move?.move ?? null, ms: Math.round(getNowMs() - startedAtMs), costUsd });
      if (move) adopt(move, isOpening);
    } catch (error) {
      trace('planFailed', { problem: String(error), ms: Math.round(getNowMs() - startedAtMs) });
    }
  };

  const askWhileWaiting = async () => {
    while (waiting !== null) {
      const next = waiting;
      waiting = null;
      await askOnce(next);
    }
    asking = null;
  };

  const noteEvent = (event: LessonEvent | null) => {
    if (!event) return;
    state = getStateAfterEvent(state, event);
    onLessonChange?.(state);
  };

  return {
    noteStudentWords(heard) {
      if (isStageWords(heard.words) || isLineOfWork(heard.words)) return;
      if (ASKS_TO_SKIP.test(heard.words)) noteEvent('movedOn');
      waiting = heard;
      asking ??= askWhileWaiting();
    },
    noteCommand: (command) => noteEvent(toEvent(command)),
    noteWorkChecked: (checked) => noteEvent(getWorkEvent(checked)),
    getStepNote() {
      const note = getStepNote(state);
      const picture = getReadyPicture?.() ?? null;
      return note && picture && 'step' in note ? { ...note, picture_topic: picture } : note;
    },
    moveToNextStep: () => noteEvent('movedOn'),
    whenSettled: () => asking ?? Promise.resolve(),
  };
}
