import { type CheckedWork, readLine, wantsSomethingElse } from '@astra/board/shared';
import type { SceneCommand, StudentWork } from '@astra/contracts';
import type { PlanAnswer, PlanAsk, PlanWants } from './ask-planner.ts';
import { getTrustedMove, isSensitive, type LessonPlan, type PlanMove } from './lesson-plan.ts';
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
  noteWorkChecked(checked: Pick<CheckedWork, 'closesTask'>, work: StudentWork): void;
  noteReplyEnded(reply: { wasSafety: boolean }): void;
  /** A card's lesson comes from the server's list, so no planner guesses at it. */
  noteCardLesson(plan: LessonPlan): void;
  /** A page that reloaded lost the title it was told. */
  tellTitleAgain(): void;
  getStepNote(): StepNote | null;
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
  onLessonChange?(state: LessonState, event: LessonEvent | null): void;
  getPictureTopic?(): string | null;
  trace(name: string, fields?: Record<string, unknown>): void;
  getNowMs?(): number;
}

const ASKS_TO_SKIP = /\bskip\s+(?:that|this|it|ahead)\b|\bskip[.!?\s]*$|(?:^|\b(?:let'?s|can we|could we|please|just)\s+)move on\b/i;

const ASKS_FOR_NEXT = /\b(?:what'?s next|what comes next|next (?:idea|part|step)|what'?s the next)\b/i;
const SAYS_NOT_TO = /\b(?:don'?t|do not|dont|never|not|won'?t)\b[^.?!]*\b(?:skip|move on)\b/i;

/** Code's own stage words, such as "(picked 3)", are not the student saying anything. */
const isStageWords = (words: string) => words.startsWith('(');

const isLineOfWork = (words: string) => readLine(words).kind === 'math';

const IS_ONLY_A_NOD = /^(?:ok(?:ay)?|k|yes|yeah|yep|yup|sure|cool|right|got it|mhm|mm+)[.!]*$/i;
const DECLINES_EXERCISES = /\bdon'?t want to try\b|\b(?:no|without|skip|stop)\s+(?:the\s+|more\s+|any\s+)?(?:exercises?|tasks?|problems?|practice|quiz(?:zes)?)\b|\bjust\s+(?:explain|teach|tell)\b|\bjust\s+(?:want\s+to\s+)?listen\b/i;
const WANTS_AN_EXERCISE = /\b(?:let\s+me|can\s+i|i(?:'ll|\s+will|\s+want\s+to)|i\s+wanna)\s+try\b|\b(?:give|set)\s+me\s+(?:a|an|one|another)\b(?!\s+lesson)/i;

/** Read beside the reply, so English needs no wait. Any other language reaches the same event through the planner's `wants`, one turn later, and the tutor reads it for itself straight away. */
const WANTS_TEACHING = /\b(?:go on|keep going|keep teaching|carry on|go ahead|tell me more|teach me more|show me more|explain more|more please|what(?:'?s| is) next\b(?! to)|what else|and then what|then what|move on|next (?:one|idea|bit|part|thing))\b(?! (?:a|an|the|my|with) )|^\s*(?:next|more|continue)[.!]*\s*$/i;

/** They asked to be taught, in the words this list knows. */
export const asksToBeTaught = (words: string) => WANTS_TEACHING.test(words) || ASKS_TO_BE_TAUGHT.test(words);

const NAMES_A_PROBLEM = /\d\s*[-+*/×÷=^%]|=|->|_{2,}|\bm\/s\b|\b(?:solve|balance|simplify|calculate|work out|factori[sz]e|derivative of|integral of|slope of|which came first)\b/i;
const ASKS_TO_BE_TAUGHT = /^\s*(?:please\s+)?(?:teach|explain|help me (?:understand|get)|give me a lesson|i(?:'d like| would like| want| wanna)(?: to)? (?:learn|understand))\b/i;
const IS_A_BARE_TOPIC = /^[\p{L}' -]+$/u;
const MOST_WORDS_IN_A_BARE_TOPIC = 4;

/** Said beside their words, where it holds the model best, because the first reply cannot wait for a plan. Null when they asked to be taught or told. */
export function getProblemNote(words: string): Record<string, string> | null {
  if (!NAMES_A_PROBLEM.test(words) || ASKS_TO_BE_TAUGHT.test(words) || DECLINES_EXERCISES.test(words) || isSensitive(words)) return null;
  return { problem_now: 'They gave you something to work out. This reply puts it on the board and holds a task command.' };
}

const isBareTopic = (words: string) => IS_A_BARE_TOPIC.test(words) && words.split(/\s+/).length <= MOST_WORDS_IN_A_BARE_TOPIC && !IS_ONLY_A_NOD.test(words);

/** The other half of the same steer: a topic is taught before anything is set, and a topic on its own only reads as one when it opens the session. */
export function getTeachFirstNote(words: string, isFirstTurn: boolean): Record<string, string> | null {
  const trimmed = words.trim();
  const isTopic = asksToBeTaught(trimmed) || (isFirstTurn && isBareTopic(trimmed));
  return isTopic && !WANTS_AN_EXERCISE.test(trimmed) && !isSensitive(trimmed) ? { teach_first_now: 'They want to be taught. This reply teaches and holds no task command. Never ask what they already know, because their level is in the student note.' } : null;
}

const getMoveEvent = (words: string): LessonEvent | null => {
  if (ASKS_TO_SKIP.test(words) && !SAYS_NOT_TO.test(words)) return 'skipped';
  return ASKS_FOR_NEXT.test(words) ? 'movedOn' : null;
};

const getWordsEvent = (words: string): LessonEvent | null => {
  if (WANTS_AN_EXERCISE.test(words)) return 'exerciseWanted';
  if (DECLINES_EXERCISES.test(words)) return 'exerciseDeclined';
  return WANTS_TEACHING.test(words) ? 'teachingWanted' : null;
};

const WANTS_EVENTS: Readonly<Record<NonNullable<PlanWants>, LessonEvent>> = { teaching: 'teachingWanted', exercise: 'exerciseWanted', no_exercise: 'exerciseDeclined' };

const toEvent = (command: SceneCommand): LessonEvent | null => {
  if (command.kind === 'task') return 'exerciseSet';
  return command.kind === 'boardMode' && command.mode === 'teach' ? 'teachingAgain' : null;
};

// Words with no answer key close as unknown, and that is a finished exercise. Only leaving it keeps the step.
const getWorkEvent = ({ closesTask }: Pick<CheckedWork, 'closesTask'>, work: StudentWork): LessonEvent | null => {
  if (!closesTask) return null;
  return work.way === 'leave' || (work.way === 'write' && wantsSomethingElse(work.text)) ? 'exerciseLeft' : 'exerciseDone';
};

// Holds the lesson in code. One plan runs at a time and only the latest words wait, so a flood of lines costs one call at a time.
export function createLessonPlanner({ ask, canSpend, charge, onTitleChange, onLessonChange, getPictureTopic, trace, getNowMs = () => performance.now() }: LessonPlannerOptions): LessonPlanner {
  let state: LessonState = NO_LESSON;
  let waiting: (HeardWords & { startReply: number }) | null = null;
  let asking: Promise<void> | null = null;

  let toldTitle: string | null = null;
  let isOnACard = false;

  const adopt = (move: PlanMove, { words, isOpening, startReply }: { words: string; isOpening: boolean; startReply: number }) => {
    if (isOnACard && isOpening) return;
    const hadTopic = state.active?.plan.topic ?? null;
    state = getStateAfterMove(state, getTrustedMove(move, words), startReply);
    const topic = state.active?.plan.topic ?? null;
    if (!isOpening && topic !== null && topic !== hadTopic) {
      toldTitle = topic;
      onTitleChange(topic);
    }
    onLessonChange?.(state, null);
  };

  const askOnce = async (heard: HeardWords & { startReply: number }) => {
    const { words: said, tutorSaid } = heard;
    if (!canSpend()) return;
    const startedAtMs = getNowMs();
    try {
      const { move, wants = null, costUsd } = await ask({ now: state.active?.plan.topic ?? null, earlier: getShelvedTopics(state), said, tutorSaid });
      charge(costUsd);
      trace('planAnswered', { move: move?.move ?? null, ms: Math.round(getNowMs() - startedAtMs), costUsd });
      if (move) adopt(move, heard);
      // Words the list already caught have had their event, and a second one would skip a step.
      if (wants && getWordsEvent(said) === null) noteEvent(WANTS_EVENTS[wants]);
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
    onLessonChange?.(state, event);
  };

  return {
    noteStudentWords(heard) {
      if (isStageWords(heard.words) || isLineOfWork(heard.words) || IS_ONLY_A_NOD.test(heard.words.trim())) return;
      noteEvent(getMoveEvent(heard.words));
      noteEvent(getWordsEvent(heard.words));
      if (heard.isOpening && isOnACard) return;
      waiting = { ...heard, startReply: state.repliesEnded };
      asking ??= askWhileWaiting();
    },
    noteCommand: (command) => noteEvent(toEvent(command)),
    noteWorkChecked: (checked, work) => noteEvent(getWorkEvent(checked, work)),
    noteReplyEnded: ({ wasSafety }) => noteEvent(wasSafety ? 'safetyReplyEnded' : 'replyEnded'),
    noteCardLesson(plan) {
      isOnACard = true;
      state = getStateAfterMove(state, { move: 'new', plan });
      onLessonChange?.(state, null);
    },
    tellTitleAgain() {
      if (toldTitle !== null) onTitleChange(toldTitle);
    },
    getStepNote() {
      const note = getStepNote(state);
      const picture = getPictureTopic?.() ?? null;
      return note && picture && 'step' in note ? { ...note, picture_topic: picture } : note;
    },
    moveToNextStep: () => noteEvent('movedOn'),
    whenSettled: () => asking ?? Promise.resolve(),
  };
}
