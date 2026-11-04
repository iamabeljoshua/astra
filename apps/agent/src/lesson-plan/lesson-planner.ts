import { type CheckedWork, readLine, wantsSomethingElse } from '@astra/board/shared';
import type { SceneCommand, StudentWork } from '@astra/contracts';
import type { MoreAnswer, MoreAsk, PlanAnswer, PlanAsk, PlanWants } from './ask-planner.ts';
import { getTrustedMove, isSensitive, type LessonPlan, type PlanMove } from './lesson-plan.ts';
import { getShelvedTopics, getStateAfterEvent, getStateAfterMove, getStateWithMoreSteps, getStepCount, getStepsTaught, getStepNote, isNearTheEnd, type LessonEvent, type LessonState, NO_LESSON, type StepNote } from './plan-progress.ts';

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
  noteReplyEnded(reply: { wasSafety: boolean; wasLead?: boolean }): void;
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
  askMore?(request: MoreAsk): Promise<MoreAnswer>;
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

const ASKS_FOR_NEXT = /\b(?:what'?s next\b(?! to)|(?<!know )what comes next|next (?:idea|part|step)|what'?s the next)\b/i;
const SAYS_NOT_TO = /\b(?:don'?t|do not|dont|never|not|won'?t)\b[^.?!]*\b(?:skip|move on)\b/i;

/** Code's own stage words, such as "(picked 3)", are not the student saying anything. */
const isStageWords = (words: string) => words.startsWith('(');

const isLineOfWork = (words: string) => readLine(words).kind === 'math';

const IS_ONLY_A_NOD = /^(?:ok(?:ay)?|k|yes|yeah|yep|yup|sure|cool|right|got it|mhm|mm+)[.!]*$/i;
const DECLINES_EXERCISES = /\bdon'?t want to try\b|\b(?:no|without|skip|stop)\s+(?:the\s+|more\s+|any\s+)?(?:exercises?|tasks?|problems?|practice|quiz(?:zes)?)\b|\bjust\s+(?:explain|teach|tell)\b|\bjust\s+(?:want\s+to\s+)?listen\b/i;
const WANTS_AN_EXERCISE = /\b(?:let\s+me|can\s+i|i(?:'ll|\s+will|\s+want\s+to)|i\s+wanna)\s+try\b|\b(?:give|set)\s+me\s+(?:a|an|one|another)\b(?!\s+lesson)/i;

const WANTS_TEACHING = /\b(?:go on|keep going|keep teaching|carry on|go ahead|tell me more|teach me more|show me more|explain more|more please|what(?:'?s| is) next\b(?! to)|what else|and then what|then what|move on|next (?:one|idea|bit|part|thing))\b(?! (?:a|an|the|my|with) )|^\s*(?:next|more|continue)[.!]*\s*$/i;

export const asksToBeTaught = (words: string) => WANTS_TEACHING.test(words) || ASKS_TO_BE_TAUGHT.test(words);

const FEWEST_STEPS_ON_A_CARD = 3;
const MOST_STEPS_IN_A_LESSON = 12;

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
export function createLessonPlanner({ ask, askMore, canSpend, charge, onTitleChange, onLessonChange, getPictureTopic, trace, getNowMs = () => performance.now() }: LessonPlannerOptions): LessonPlanner {
  let state: LessonState = NO_LESSON;
  let waiting: (HeardWords & { startReply: number }) | null = null;
  let asking: Promise<void> | null = null;

  let toldTitle: string | null = null;
  let card: LessonPlan | null = null;

  const adopt = (move: PlanMove, { words, isOpening, startReply }: { words: string; isOpening: boolean; startReply: number }) => {
    if (card && isOpening) {
      if (move.move === 'new' && state.active?.plan === card) {
        const plan = { ...card, steps: [...card.steps, ...move.plan.steps.slice(1)] };
        state = { ...state, active: { ...state.active, plan } };
        onLessonChange?.(state, null);
        askForMoreIfNear();
      }
      return;
    }
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
      const { move, wants = null, costUsd } = await ask({ now: heard.isOpening && card ? null : (state.active?.plan.topic ?? null), earlier: getShelvedTopics(state), said, tutorSaid });
      charge(costUsd);
      trace('planAnswered', { move: move?.move ?? null, ms: Math.round(getNowMs() - startedAtMs), costUsd });
      if (move) adopt(move, heard);
      if (wants && !getMoveEvent(said) && !getWordsEvent(said)) noteEvent(WANTS_EVENTS[wants]);
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

  let isAskingMore = false;

  const askForMoreIfNear = () => {
    const topic = state.active?.plan.topic;
    if (!askMore || !topic || isAskingMore || !isNearTheEnd(state) || getStepCount(state) >= MOST_STEPS_IN_A_LESSON || !canSpend()) return;
    isAskingMore = true;
    void askMore({ topic, taught: getStepsTaught(state), most: MOST_STEPS_IN_A_LESSON - getStepCount(state) })
      .then(({ steps, costUsd }) => {
        charge(costUsd);
        trace('planExtended', { steps: steps.length, costUsd });
        state = getStateWithMoreSteps(state, topic, steps);
        onLessonChange?.(state, null);
      })
      .catch((error: unknown) => trace('planFailed', { problem: String(error) }))
      .finally(() => {
        isAskingMore = false;
      });
  };

  const noteEvent = (event: LessonEvent | null) => {
    if (!event) return;
    state = getStateAfterEvent(state, event);
    onLessonChange?.(state, event);
    askForMoreIfNear();
  };

  return {
    noteStudentWords(heard) {
      if (isStageWords(heard.words) || isLineOfWork(heard.words) || IS_ONLY_A_NOD.test(heard.words.trim())) return;
      noteEvent(getMoveEvent(heard.words) ?? getWordsEvent(heard.words));
      if (heard.isOpening && card && card.steps.length >= FEWEST_STEPS_ON_A_CARD) return;
      waiting = { ...heard, startReply: state.repliesEnded };
      asking ??= askWhileWaiting();
    },
    noteCommand: (command) => noteEvent(toEvent(command)),
    noteWorkChecked: (checked, work) => noteEvent(getWorkEvent(checked, work)),
    noteReplyEnded: ({ wasSafety, wasLead = false }) => noteEvent(wasSafety ? 'safetyReplyEnded' : wasLead ? 'leadEnded' : 'replyEnded'),
    noteCardLesson(plan) {
      card = plan;
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
