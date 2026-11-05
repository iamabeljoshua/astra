import { type Beat, type BeatId, type BoardProblemReport, clipTypedText, type ElementId, getBeatText, getCues, getPlayedCues, getSpokenWords, isStudentLineId, parseBeat, parseWrittenBeat, type SceneCommand, type StudentWork, type TutorClosedReason, TYPED_TEXT_MAX_CHARACTERS } from '@astra/contracts';
import { type BoardOperation, type BoardState, type CheckedWork, checkWorkOnBoard, cleanStudentText as cleanLine, getBoardAt, getNod, getOpenTaskOnBoard, getWorkContext } from '@astra/board/shared';
import { type FindSource, type ModelEvent, ModelRejectedError, type ModelUsage, type TutorModelAdapter, type TutorModelRequest, type TutorTurn } from '../providers/types.ts';
import { toCardPlan, type CardMaterial } from '../lesson-plan/card-lesson.ts';
import { asksToBeTaught, getProblemNote, getTeachFirstNote, type LessonPlanner } from '../lesson-plan/lesson-planner.ts';
import { CARRY_ON_NOTE, EXERCISE_OPEN_NOTE, getLeadWordsProblem, getLessonWordsProblem, HOLD_NOTE, LEAD_NOTES, OPENING_A_CARD_NOTE, OTHER_LANGUAGE_NOTE, promisesToWait, SLOW_NOTE, STAY_NOTE, WAITING_NOTE, withoutNextSignpost, withoutOpeningTic, withoutReplyToNobody, WORRYING_LANGUAGE_NOTE } from '../lesson-plan/lesson-rules.ts';
import { getPlainWish, isHoldWish, isNod } from '../lesson-plan/student-wish.ts';
import { getLeadStopAfter, type LeadKind, type LeadStop, type LeadStopEvent } from '../live/tutor-lead.ts';
import type { LineRead, LineReaders, LineWish, PromiseRead } from './line-read/read-line.ts';
import { asksToMakeAWeapon, namesHelp, readsAsEnglish, saysNobodyCanBeTold, soundsLikeCrisisReply } from '../safety/help-words.ts';
import { isSafetyKind, type StudentReading } from '../safety/student-reading.ts';
import type { SafetyWatch } from '../safety/safety-watch.ts';
import { createAttemptTracker } from './attempts.ts';
import { BeatTextReader, type WrittenBeatParts } from './beat-text-reader.ts';
import { MAY_BE_ABOUT_SAFETY, PLAIN_REFUSALS } from './safety-words.ts';
import { type BoardMemory, checkAgainstBoard, EMPTY_BOARD, getAnswerShownProblem, getClaimProblem, getExerciseProblem, getGivenAwayProblem, getMemoryAfter, getMemoryAfterAnswering, getMemoryAfterWork, getMemoryOnComingBack, getMemoryOnNewTurn, getPictureProblem, getWordsProblem, isWrittenWordsTask, showsItsAnswer } from './board-memory.ts';
import type { MemoryNote } from '../learner-record/memory-note.ts';
import { TUTOR_PROMPT, type TutorPrompt } from './prompt.ts';
import { createLinePicker, type SpokenLineUse } from './spoken-lines.ts';
import { compute } from './tools/compute.ts';
import { runTool, type ToolResult } from './tools/run-tool.ts';
import type { ToolCall } from './tools/tool-call.ts';
import { createBoardProblemNotes } from './board-problems.ts';
import { getWorkNote } from './watcher/work-note.ts';

export interface TutorRequest {
  text: string;
  /** How `text` starts, when it repeats the words of a request whose reply was cut. */
  carried?: string;
  lead?: LeadKind;
  /** Stage words about what the student did on the board, or that they paused, so nobody said them. */
  isFromCode?: boolean;
  isOpening?: boolean;
}

export interface BeatReport {
  beatId: BeatId;
  playedWords: number;
  firedCues: number;
}

/** A beat with a pause before it starts a new stretch of speech, so the student hears a breath and can jump in. */
export interface TutorBeat extends Beat {
  pauseBeforeMs?: number;
}

export interface TutorBrain {
  reply(request: TutorRequest, signal: AbortSignal): AsyncIterable<TutorBeat>;
  notePlayed?(report: BeatReport): void;
  noteCut?(wordsSent: ReadonlyMap<BeatId, number>): void;
  /** The browser could not draw this mark, so the student never saw what the tutor pointed at. */
  noteMarkNotDrawn?(markId: string): void;
  noteBoardProblem?(report: BoardProblemReport): void;
  /** Why the tutor will not answer again in this room, once it has said so. */
  getClosedReason?(): TutorClosedReason | null;
  /** A scene landed and its words are being said, so the next turn knows what is on screen and what was heard. */
  noteSceneTurn?(turn: { topic: string; beats: readonly Beat[] }): void;
  /** Checks the student's work against the board as the tutor knows it, and notes it for the next turn. Null if the work cannot stand, such as a line id already used. */
  noteWork?(work: StudentWork): { checked: CheckedWork; hadTask: boolean } | null;
  /** The page reloaded with the board in its hands, so the next reply is told and cannot wipe it. */
  noteCameBack?(): void;
  noteWatcher?(note: WatcherNote): void;
  getBoard?(): { state: BoardState; openTask: ElementId | null };
  canLead?(): boolean;
  isLeadStopped?(): boolean;
  isPaceSlow?(): boolean;
  /** A lesson's plan still has ideas to teach. */
  hasLessonLeft?(): boolean;
  noteLead?(kind: LeadKind): void;
  holdLeads?(): void;
  /** A line that gets no reply, typed or spoken, still says what it says about the lesson. */
  noteQuietLine?(words: string): void;
  onLeadStopped?(listener: () => void): void;
  onReadSettled?(listener: () => void): void;
}

/** Why code decided the tutor should speak up, read by the model on its next turn. */
export interface WatcherNote {
  why: string;
  seconds_paused: number;
  unsent_draft?: string;
}

export type SpendLimit = 'sessionLimit' | 'dailyLimit';

export interface StudentProfile {
  level: string;
  interests: readonly string[];
  goal: string;
  cardTitle?: string | null;
  cardMaterial?: CardMaterial | null;
}

export const TUTOR_TIMEOUTS = {
  /** A quiet retry's first text is under 2 s at p95, so the student hears about a check only on a slow one. */
  checkingMathMs: 2000,
  /** Sonnet stalled for 9 to 10 s in the speed test, and a new request's first text is under 2 s at p95. */
  firstTextMs: 5000,
  betweenTextMs: 4000,
  /** A model told to stop at a question usually ends at once. Its next text can come about 350 ms later, and that text may be the help a student in danger needs. */
  finishGraceMs: 1000,
  /** A short wait for a cut turn's report, so a lost one cannot hold up the reply. */
  reportWaitMs: 150,
  /** Most sessions have the profile long before the first message, and a slow API must not hold up the reply. */
  profileWaitMs: 1000,
  /** On words read as danger, past this code's own line plays. */
  helpDueMs: 3000,
  /** Longer than one retried read, which runs 3 s, a short backoff, and 3 s more. */
  safetyReadWaitMs: 7000,
  lineReadWaitMs: 4000,
  readLimitMs: 8000,
  /** A danger read can take a second read after it, each with its retry, and a late one must still stop the lesson. */
  safetyReadLimitMs: 16_000,
};

export type TutorTimeouts = typeof TUTOR_TIMEOUTS;

export type TraceNote = (name: string, fields?: Record<string, unknown>) => void;

export interface TurnSummary {
  wasLead: boolean;
  studentText: string;
  spokenText: string;
  beats: readonly TutorBeat[];
  refused: readonly string[];
  toolCalls: readonly ToolCall[];
  attempts: number;
  endedAs: AttemptEnd;
  refusalCategory: string | null;
  firstTextMs: number | null;
  firstBeatMs: number | null;
  usage: ModelUsage | null;
  isUsageEstimated: boolean;
  promptTokens: number;
  costUsd: number;
}

export interface TutorBrainOptions {
  model: TutorModelAdapter;
  profile?: StudentProfile | null;
  loadProfile?(): Promise<StudentProfile | null>;
  memory?: MemoryNote | null;
  loadMemory?(): Promise<MemoryNote>;
  onWorkNoted?(work: StudentWork, checked: CheckedWork): void;
  timeouts?: Partial<TutorTimeouts>;
  trace?: TraceNote;
  onTurnEnd?(summary: TurnSummary): void;
  onCompacted?(summary: { costUsd: number; turnsBefore: number; turnsAfter: number }): void;
  compactAtTokens?: number;
  getSpendLimit?(): SpendLimit | null;
  getNowMs?(): number;
  safety?: SafetyWatch;
  readers?: LineReaders;
  /** Prepares a lesson plan beside the replies, which a reply never waits for. */
  lessonPlanner?: LessonPlanner;
  /** Another version of the prompt, so an evaluation can run the same questions on it, or a session with scenes can name them. */
  prompt?: TutorPrompt;
  findSource?: FindSource;
  onAskScene?(topic: string): void;
  onStudentWords?(words: string): void;
  onSafetyReply?(): void;
}

type TurnStep = 'over' | 'retry';

const ENDS_THAT_STOP_A_LEAD: ReadonlySet<string> = new Set(['noWords', 'stalledBeforeText', 'stalledInText', 'failed', 'rejected', 'refused', 'stoppedForSafety']);
const MOST_REFUSALS_NOBODY_ASKED_FOR = 2;

type Speaker = 'student' | 'lead' | 'code' | 'page';

interface HeldTry {
  canBeSteered: boolean;
  isHolding: boolean;
  beatsOut: number;
  commands: SceneCommand[];
  forget(): void;
}

type AttemptEnd = 'ended' | 'noWords' | 'aborted' | 'stalledBeforeText' | 'stalledInText' | 'failed' | 'rejected' | 'wrongMath' | 'drawingRefused' | 'wrongWords' | 'refused' | 'toolCall' | 'heldQuestion' | 'stoppedForSafety' | 'waitHeard';

interface TurnWork {
  sceneAside?: 'due' | 'moved';
  isLead: boolean;
  wordsForSafetyCheck: string;
  heldTry: HeldTry;
  id: number;
  studentText: string;
  signal: AbortSignal;
  startedAtMs: number;
  reader: BeatTextReader;
  beats: TutorBeat[];
  ready: TutorBeat[];
  refused: string[];
  notes: string[];
  /** How many of the pending notes this turn took, so a note added while it runs stays for the next turn. */
  carriedNotes: number;
  /** Code already said its nod, so the model's own opening one would double it. */
  startsAfterNod: boolean;
  raw: string;
  hasModelWords: boolean;
  wasStoppedByLength: boolean;
  hasAttemptText: boolean;
  hasSaidChecking: boolean;
  /** A steer on what to set, which is no false line, so the retry says nothing about checking. */
  isExerciseSteered: boolean;
  /** A tic was the whole of the first beat, so what is now first needs its capital. */
  lostOpeningBeat: boolean;
  wrongMath: string | null;
  drawingRefused: string | null;
  wrongWords: string | null;
  toolCall: ToolCall | null;
  toolCalls: ToolCall[];
  /** What each call came back with, so a repeat never runs again. */
  toolResults: Map<string, ToolResult>;
  latestToolResult: ToolResult | null;
  hasWordsSinceToolResult: boolean;
  toolCostUsd: number;
  /** A question at a dead end, not spoken, because the step must be shown first. */
  isQuestionHeld: boolean;
  hasShownAStep: boolean;
  isCheckingMath: boolean;
  hasNewWordsThisAttempt: boolean;
  refusalCategory: string | null;
  firstTextMs: number | null;
  firstBeatMs: number | null;
  attempts: number;
  usage: ModelUsage | null;
  attemptUsage: ModelUsage | null;
  isAttemptUsageFinal: boolean;
  isUsageEstimated: boolean;
  costUsd: number;
  endedAs: AttemptEnd;
  safetyReading: StudentReading | 'pending';
  safetyRead: Promise<void>;
  safetyAnswered: Promise<typeof SAFETY_ANSWERED>;
  speaker: Speaker;
  lineWish: LineRead | 'pending';
  lineRead: Promise<void>;
  replyRead: PromiseRead | null;
  hasPlainWish: boolean;
  isNothingToAnswer: boolean;
  wasPausedAtStart: boolean;
  hasStoppedForSafety: boolean;
  isFinished: boolean;
  startsAfterCut: boolean;
}

const SAFETY_ANSWERED = 'safetyAnswered';
/** One per turn, because a promise that never settles keeps every reaction raced against it. */
const createNever = () => new Promise<never>(() => {});
const RESUMED_BEAT = /^(.+?)(?:-r\d+(?:-rest)?)+$/;
const MOST_NOTES_OF_WORK_HELD = 20;
const MOST_WORK_IN_A_SESSION = 2000;
const WAIT_STEP_MS = 5;
const MAX_ATTEMPTS = 2;
/** Each one costs a new request, about 2 s of quiet, and a search 5.5 to 8.7 s, so more than this in one reply would sound like the tutor has wandered off. */
const MOST_TOOL_CALLS_A_TURN = 3;
/** Drawing these shows a student the step, and a ring or a pointer does not. */
const SHOWING_KINDS: ReadonlySet<SceneCommand['kind']> = new Set(['writeMath', 'transformMath', 'text', 'simulate', 'table', 'timeline', 'code', 'image', 'drawing']);
/** Varied, because a pause of one fixed length turns into a tic. The voice adds about 400 ms to each. */
const BREATHS_MS = [300, 450, 350];
/** A repeated opening of a few words is dropped only at the start of a retry, where it sounds like starting over, and a longer repeat anywhere. */
const FEWEST_WORDS_IN_A_REPEAT = 4;
const COMPACT_AT_TOKENS = 60_000;
const TURNS_THAT_SET_THE_START = 2;
const TURNS_KEPT_AFTER_COMPACTING = 8;
const CHARACTERS_PER_TOKEN = 3.2;
const PERSONAL_NOTE = /^\{"(?:student|memory|fit)":/;
const ENDS_ON_A_QUESTION = /\?\s*$/;
const BARE_QUESTION_PROBLEM = 'That was a question with nowhere to answer it, and the student did not hear it. An exercise needs its task command, and the command comes before any question, because a question ends the reply.';

/** What the model is told after a safety check stops a student's message, built by code, so it holds none of what was refused. */
const DECLINED_NOTE = {
  declined: "A safety check stopped an earlier message of the student's, so you cannot see that one. It may have been serious. The message just above this note is newer, you can read it, and it comes first: if it says anyone is hurting them or that they are in danger, follow your safety rules for it. The app has already told them to tell an adult they trust or call their local emergency number. Otherwise, before you teach on, ask once, gently, whether they are safe and have an adult to talk to. Do not guess what the earlier message said, do not ask them to repeat it, and never say you cannot see a message.",
};
/** A frozen picture has no place behind a safety reply, so it goes small, with no words. */
const SCENE_ASIDE = { kind: 'boardMode', mode: 'handsOn' } as const;
const SKIPPED_NOTE = { skipped: "An automatic check stopped an earlier message of the student's, and the app told them it could not go into that. It is not about their safety. Teach on, and do not ask them to repeat it." };
const VAGUE_WORDS_PROBLEM = "The student's words could be about their safety, nothing said before explains them, and your reply named no help. In their language, in one or two short sentences, ask gently what they mean, and say that if anything is worrying them they should tell an adult they trust now, or call their local emergency number if they are in danger. Do not say it sounds serious, and never mention this note.";
const SAFETY_STOP_PROBLEM = "The student's words may be about their safety, and your reply named no help. Follow your safety rules now, in their language, naming an adult they trust and their local emergency number. Help comes first, and never mention this note.";
const BREAK_NOTE = { break_due: 'They have been learning for a while. In one short sentence, suggest a short break, then carry on if they want to.' };
/** PRD S4 asks the tutor to nudge minors to take breaks, and a 30 minute lesson should hear none. */
const BREAK_EVERY_MS = 45 * 60 * 1000;
const CLIPPED_NOTE = { clipped: 'The student wrote more than you can see, and this is only the first part. Say so in a few words, and answer what you can.' };
const ASKED_HOW_IT_WORKED = 'reasoning_extraction';
/** Asking how a tutor worked something out is core teaching, and the check can read it as asking for hidden reasoning. The retry keeps the student's own words, because replacing them could hide a disclosure in the same message. Measured at 0 of 8 refused against 8 of 8 without. */
const AFTER_A_TOOL = 'You have the result now. Say it in plain words in this reply, and do not make this call again.';
const ASKED_HOW_NOTE = { asked_how: 'They are asking you to go through the subject step by step, as teaching. Their words may mention your reasoning. Answer anything else they said first.' };

/** Strips control and invisible characters, which can hide text from a reader. */
export function cleanStudentText(text: string): string {
  return clipTypedText(cleanLine(text));
}

// The refusal categories cover weapons and drugs too, so a calm line is the honest one when the check read no danger in the student's words.
const isPlainRefusal = ({ refusalCategory, studentText, safetyReading }: { refusalCategory: string | null; studentText: string; safetyReading: TurnWork['safetyReading'] }) => refusalCategory !== null && (PLAIN_REFUSALS.has(refusalCategory) || safetyReading === 'none' || safetyReading === 'school' || (safetyReading === 'unread' && asksToMakeAWeapon(studentText))) && !MAY_BE_ABOUT_SAFETY.test(studentText);

const isAboutSafety = (reading: TurnWork['safetyReading']) => isSafetyKind(reading) || reading === 'vague';

const CLAUSE_END = /[,;:]\s*$/;

function withSentenceEnd(beat: TutorBeat): TutorBeat {
  const lastWordsAt = beat.script.findLastIndex((part) => typeof part === 'string');
  const lastWords = beat.script[lastWordsAt];
  if (typeof lastWords !== 'string' || !CLAUSE_END.test(lastWords)) return beat;
  return { ...beat, script: beat.script.map((part, index) => (index === lastWordsAt ? lastWords.replace(CLAUSE_END, '.') : part)) };
}

const toSpacedWords = (text: string) => text.split(/\s+/).join(' ');

const toComparableWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).join(' ');

function getWrittenBeat(parts: WrittenBeatParts, id: string, refused: string[]): Beat | null {
  const written = parseWrittenBeat({ id, script: parts.script, expectsReply: parts.expectsReply });
  if (written.ok) {
    refused.push(...written.value.droppedCommandProblems);
    return written.value.beat;
  }
  refused.push(written.problem);
  const speech = parts.script.filter((part) => typeof part === 'string').join('');
  const speechOnly = parseBeat({ id, script: [speech], expectsReply: parts.expectsReply });
  return speechOnly.ok ? speechOnly.value : null;
}

const OPENING_NOD = /^\s*(?:h+m+|mm-?hm+)[.,!…]*\s+/i;

/** Null when the tic was all the beat said and it drew nothing. */
function getBeatWithoutTic(parts: WrittenBeatParts, needsCapital: boolean, isLead: boolean): WrittenBeatParts | null {
  const at = parts.script.findIndex((part) => typeof part === 'string' && part.trim() !== '');
  const first = parts.script[at];
  if (typeof first !== 'string') return parts;
  const clean = isLead ? withoutReplyToNobody(withoutOpeningTic(first)) : withoutOpeningTic(first);
  if (clean === first && !needsCapital) return parts;
  const isOnlyTic = clean.trim() === '' && parts.script.every((part, index) => index === at || typeof part === 'string');
  if (isOnlyTic) return parts.script.every((part) => typeof part === 'string') ? null : parts;
  const words = clean.trimStart();
  return { ...parts, script: parts.script.with(at, `${words.charAt(0).toUpperCase()}${words.slice(1)}`) };
}

function withoutOpeningNod(parts: WrittenBeatParts): WrittenBeatParts {
  const [first, ...rest] = parts.script;
  return typeof first === 'string' && OPENING_NOD.test(first) ? { ...parts, script: [first.replace(OPENING_NOD, ''), ...rest] } : parts;
}

function waitUntil<T>(work: Promise<T>, deadlineMs: number, signal: AbortSignal, getNowMs: () => number): Promise<T | 'deadline' | 'aborted'> {
  if (signal.aborted) return Promise.resolve('aborted');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish('deadline'), Math.max(0, deadlineMs - getNowMs()));
    const onAbort = () => finish('aborted');
    function finish(value: T | 'deadline' | 'aborted') {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    }
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(finish, (error: unknown) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(error as Error);
    });
  });
}

const addUsage = (total: ModelUsage | null, part: ModelUsage): ModelUsage =>
  total ? { inputTokens: total.inputTokens + part.inputTokens, outputTokens: total.outputTokens + part.outputTokens, cacheReadTokens: total.cacheReadTokens + part.cacheReadTokens, cacheWriteTokens: total.cacheWriteTokens + part.cacheWriteTokens } : part;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isMoreThanOneWord = (words: string) => words.trim().split(/\s+/).length > 1;

const WISHES_THAT_PAUSE: ReadonlySet<LineWish> = new Set(['wait', 'lost', 'other_language', 'unreadable']);

const getWishEvent = (wish: LineWish, words: string): LeadStopEvent | null => {
  if (wish === 'filler') return isNod(words) || getPlainWish(words) === null ? 'nod' : null;
  if (WISHES_THAT_PAUSE.has(wish)) return 'pause';
  if (isHoldWish(wish)) return 'hold';
  return (wish === 'go_on' || asksToBeTaught(words)) && isMoreThanOneWord(words) ? 'askedToBeTaught' : 'saidSomething';
};

/** Words that ask only this of the lesson say nothing about the student, whatever a vague read made of them. A stop or a goodbye read by a model can mean more than the lesson, such as "make it stop". */
const WISHES_ONLY_ABOUT_THE_LESSON: ReadonlySet<LineRead | 'pending'> = new Set<LineRead | 'pending'>(['wait', 'go_on', 'slower', 'faster', 'filler', 'other_language']);

const getLineNote = (wish: LineRead | 'pending', wasPausedAtStart: boolean, words: string) => {
  if (wish === 'other_language') return OTHER_LANGUAGE_NOTE;
  if (wish === 'unreadable') return WORRYING_LANGUAGE_NOTE;
  if (wish === 'wait') return HOLD_NOTE;
  return wish === 'filler' && wasPausedAtStart && isNod(words) ? CARRY_ON_NOTE : null;
};

const holdsWhereToStart = ({ memory: { notes } }: MemoryNote) => notes.some(({ kind }) => kind === 'showed' || kind === 'struggled');

const toProfileNote = ({ level, interests, goal, cardTitle }: StudentProfile) => ({ student: { level, interests, goal, ...(cardTitle ? { card_title: cardTitle } : {}) } });

export function createTutorBrain({ model, profile = null, loadProfile, memory: knownMemory = null, loadMemory, onWorkNoted, timeouts: chosenTimeouts, trace = () => {}, onTurnEnd, onCompacted, compactAtTokens = COMPACT_AT_TOKENS, getSpendLimit = () => null, getNowMs = () => performance.now(), prompt = TUTOR_PROMPT, findSource, lessonPlanner, safety, readers, onAskScene, onSafetyReply, onStudentWords }: TutorBrainOptions): Required<TutorBrain> {
  const timeouts: TutorTimeouts = { ...TUTOR_TIMEOUTS, ...chosenTimeouts };
  const attempts = createAttemptTracker();
  const pickLine = createLinePicker();
  let breathsTaken = 0;
  let profileNote: Record<string, unknown> | null = profile ? toProfileNote(profile) : null;
  const reports = new Map<BeatId, BeatReport>();
  let turns: TutorTurn[] = [];
  let memory: BoardMemory = EMPTY_BOARD;
  const boardOperations: BoardOperation[] = [];
  let workCount = 0;
  const getBoardNow = () => getBoardAt(boardOperations, Number.POSITIVE_INFINITY);
  let toldBoard = '{}';
  let toldStep = 'null';
  let memoryNote: Record<string, unknown> | null = knownMemory ? { ...knownMemory } : null;
  let canFitTheStart = knownMemory !== null && holdsWhereToStart(knownMemory);
  const getStandingNotes = () => [profileNote, memoryNote].filter((note) => note !== null);
  let isComeBackUnanswered = false;
  let studentLevel = profile?.level ?? null;
  let isAfterSafetyReply = false;
  let leadStop: LeadStop = 'none';
  let hasHadAReply = false;
  let isPaceSlowNow = false;
  let draftToRead: string | null = null;
  const leadStoppedListeners: (() => void)[] = [];
  const readSettledListeners: (() => void)[] = [];
  let linesBeingRead = 0;
  let lineSettling: Promise<void> = Promise.resolve();
  let refusalsNobodyAskedFor = 0;
  let didDraftRaiseCrisis = false;
  let workedForLead: { problem: string; comes_to: string } | null = null;
  let wasLastExerciseWords = false;
  const problemsSet = new Set<string>();
  let isOnACard = Boolean(profile?.cardTitle);
  let pendingNotes: Record<string, unknown>[] = getStandingNotes();
  let lastBeats: readonly Beat[] = [];
  let lastRefused: readonly string[] = [];
  /** A refused reply's words must not go back to the model, even when the student cut across them. */
  let hidesLastWords = false;
  let closedReason: TutorClosedReason | null = null;
  let hasToldClosed = false;
  let rejectionsInARow = 0;
  const marksDrawn = new Map<string, { target: string; tex?: string }>();
  const boardProblems = createBoardProblemNotes();
  let cutWordsSent: ReadonlyMap<BeatId, number> | null = null;
  let turnCount = 0;
  let promptTokens = 0;
  let lastCompactedAtTurn = Number.NEGATIVE_INFINITY;
  let isCompacting = false;
  let isTurnRunning = false;
  let lastAskedText: string | null = null;
  let lastSpokenText = '';
  let lastBreakNudgeAtMs = getNowMs();
  const workSinceLastTurn: { work: StudentWork; checked: CheckedWork }[] = [];
  let hasNoddedSinceLastTurn = false;

  // Board and heard words come from the browser's report, because the model may write past what the student saw.
  const settleLastTurn = (studentText: string | null = null) => {
    const heard: string[] = [];
    const missed: string[] = [];
    for (const beat of lastBeats) {
      const words = getSpokenWords(getBeatText(beat));
      const report = reports.get(beat.id);
      const played = report ? report.playedWords : cutWordsSent ? (cutWordsSent.get(beat.id) ?? 0) : words.length;
      heard.push(...words.slice(0, played));
      missed.push(...words.slice(played));
      const cues = report ? getPlayedCues(beat, report.firedCues) : getCues(beat).filter((cue) => cue.atWord < played);
      for (const { command } of cues) memory = getMemoryAfter(command, memory);
    }
    // The last turn's commands all came before this work, so a clearBoard among them must not wipe a line the tutor is about to mark.
    for (const { work, checked } of workSinceLastTurn) memory = getMemoryAfterWork(work, checked, memory);
    workSinceLastTurn.length = 0;
    const note: Record<string, unknown> = {};
    if (missed.length > 0 && !hidesLastWords) note.cut = { heard: heard.join(' '), not_heard: missed.join(' ') };
    if (lastRefused.length > 0) note.refused = lastRefused;
    const board = JSON.stringify(Object.fromEntries([...memory.kinds].map(([id, kind]) => [id, memory.lines.get(id) ?? kind])));
    if (board !== toldBoard) note.board = JSON.parse(board);
    toldBoard = board;
    // Words that may be serious get no plan at all, and the step waits for a turn that can use it. A scene turn has no student words, and a note held from one would reach whatever they say next.
    if (studentText !== null && !MAY_BE_ABOUT_SAFETY.test(studentText)) {
      const step = lessonPlanner?.getStepNote() ?? null;
      if (JSON.stringify(step) !== toldStep) note.lesson_plan = step;
      toldStep = JSON.stringify(step);
    }
    if (Object.keys(note).length > 0) pendingNotes.push(note);
    lastBeats = [];
    lastRefused = [];
    hidesLastWords = false;
    cutWordsSent = null;
    reports.clear();
  };

  const hasEveryReport = () => cutWordsSent === null || [...cutWordsSent.keys()].every((beatId) => reports.has(beatId));

  const waitForLastTurn = async () => {
    const deadlineMs = getNowMs() + timeouts.reportWaitMs;
    while ((isTurnRunning || !hasEveryReport()) && getNowMs() < deadlineMs) await delay(WAIT_STEP_MS);
  };

  const noteLeadStopEvent = (event: LeadStopEvent) => {
    leadStop = getLeadStopAfter(leadStop, event);
  };

  const noteWish = (wish: LineWish, words: string) => {
    if (wish === 'slower') isPaceSlowNow = true;
    if (wish === 'faster') isPaceSlowNow = false;
    const event = getWishEvent(wish, words);
    if (event) noteLeadStopEvent(event);
  };

  const tellLeadStopped = () => leadStoppedListeners.forEach((listener) => listener());
  const tellReadSettled = () => readSettledListeners.forEach((listener) => listener());

  const canWishCount = (turn: TurnWork) => !isAboutSafety(turn.safetyReading) && !(turn.isFinished && isCrisisReply(turn));

  const settleLine = (turn: TurnWork) => {
    linesBeingRead -= 1;
    const wish = turn.lineWish;
    if (wish !== 'pending' && wish !== 'unread' && canWishCount(turn)) {
      noteWish(wish, turn.studentText);
      if (wish === 'go_on') lessonPlanner?.noteTeachingWanted();
    }
    if (wasLineUnread(turn)) noteLeadStopEvent('hold');
    if (leadStop !== 'none') tellLeadStopped();
    tellReadSettled();
  };

  const wasLineUnread = (turn: TurnWork) => !turn.hasPlainWish && ((readers !== undefined && turn.speaker === 'student' && turn.lineWish === 'unread') || (safety !== undefined && !didNobodySpeak(turn) && turn.safetyReading === 'unread'));

  // Asked for a moment while a reply is still coming, the words already out are enough, so nothing is taught first. A stop read by a model can mean more than the lesson, so that reply goes on.
  const isWaitHeard = (turn: TurnWork) => turn.lineWish === 'wait' && !turn.hasPlainWish && turn.beats.length > 0 && (turn.safetyReading === 'none' || turn.safetyReading === 'school') && !turn.reader.isSafetyReply;

  // Past the wait a read still out counts as failed, because the student must hear why nothing comes next.
  const isAReadOut = (turn: TurnWork) => wasLineUnread(turn) || turn.lineWish === 'pending';

  const withinReadLimit = <T>(read: Promise<T>, unread: T, limitMs = timeouts.readLimitMs): Promise<T> =>
    new Promise((resolve) => {
      const giveUp = setTimeout(() => resolve(unread), limitMs);
      const land = (value: T) => {
        clearTimeout(giveUp);
        resolve(value);
      };
      read.then(land, () => land(unread));
    });

  // A turn read for danger has someone's words behind it, even an unsent draft, and any other lead or board note has none.
  const didNobodySpeak = ({ speaker, safetyReading }: TurnWork) => (speaker === 'lead' || speaker === 'code') && safetyReading === 'unread';

  const isCrisisReply = (turn: TurnWork) => (didNobodySpeak(turn) ? soundsLikeCrisisReply(turn.raw) : turn.reader.isSafetyReply);

  const noteSafetyReply = (turn: TurnWork, board: { kinds: ReadonlyMap<string, string> }) => {
    if (didNobodySpeak(turn) && !soundsLikeCrisisReply(turn.raw)) return;
    onSafetyReply?.();
    if ([...board.kinds.values()].includes('richScene')) turn.sceneAside = 'due';
  };

  // The reply has ended with no word of this, and nothing that comes next may teach on as if the read had said nothing.
  const noteLateSafetyRead = (turn: TurnWork) => {
    trace('lateSafetyRead');
    isAfterSafetyReply = true;
    lessonPlanner?.noteReplyEnded({ wasSafety: true, wasLead: turn.isLead, spoken: '' });
    noteSafetyReply(turn, memory);
  };

  const takesSceneAside = (turn: TurnWork) => {
    const moves = turn.sceneAside === 'due';
    if (moves) turn.sceneAside = 'moved';
    return moves;
  };

  const getTaskLine = (command: SceneCommand & { kind: 'task' }, board: BoardMemory) => (command.way === 'write' && command.on ? board.lines.get(command.on)?.replace(/\s+/g, '') : undefined);

  const getRepeatedProblem = (command: SceneCommand & { kind: 'task' }, board: BoardMemory) => {
    const problem = getTaskLine(command, board);
    return problem && problemsSet.has(problem) ? 'They have already had this exact problem in this lesson, and they did not hear you set it again. Set a new one, with numbers you have not used.' : null;
  };

  const isExerciseDueNow = () => {
    const step = lessonPlanner?.getStepNote();
    return Boolean(step && 'exercise_due' in step);
  };

  const getWantedExercise = () => {
    const step = lessonPlanner?.getStepNote();
    return step && 'exercise_kind' in step ? (step.exercise_kind ?? null) : null;
  };

  const hasLessonLeft = () => {
    const step = lessonPlanner?.getStepNote();
    return Boolean(step && 'step' in step);
  };

  const isLessonOver = () => {
    const step = lessonPlanner?.getStepNote();
    return Boolean(step && 'is_finished' in step);
  };

  // The student left this problem, so the worked answer the tutor gives next must hold the number code gets for it.
  const getWorkedOpenProblem = () => {
    const board = getBoardNow();
    const open = getOpenTaskOnBoard(board);
    const context = open ? getWorkContext(board, open.id) : null;
    const line = context?.task && 'on' in context.task && context.task.on ? context.getLineTex(context.task.on) : null;
    const problem = line ?? context?.problemTex;
    if (!problem) return null;
    const answer = compute({ expression: problem, values: {} });
    return answer.ok ? { problem, comes_to: answer.about ?? answer.value } : null;
  };

  const startTurn = (studentText: string, lead: LeadKind | null, isFromCode: boolean, isOpening: boolean, signal: AbortSignal): TurnWork => {
    const speaker: Speaker = lead ? 'lead' : isFromCode ? 'code' : isOpening ? 'page' : 'student';
    const wasHeldAtStart = leadStop === 'held';
    const wasPausedAtStart = leadStop === 'paused';
    const plainWish = speaker === 'student' ? getPlainWish(studentText) : null;
    const isAskedToHold = isHoldWish(plainWish);
    if (plainWish) noteWish(plainWish, studentText);
    settleLastTurn(isAskedToHold ? null : studentText);
    if (getNowMs() - lastBreakNudgeAtMs >= BREAK_EVERY_MS) {
      lastBreakNudgeAtMs = getNowMs();
      pendingNotes.push(BREAK_NOTE);
    }
    turnCount += 1;
    memory = getMemoryOnNewTurn(memory, studentText);
    if (memory.hasComeBack && !isComeBackUnanswered) memory = { ...memory, hasComeBack: false };
    isComeBackUnanswered = false;
    const nodded = hasNoddedSinceLastTurn;
    hasNoddedSinceLastTurn = false;
    let readerMemory = memory;
    const shapeNote = lessonPlanner && (speaker === 'student' || speaker === 'page') && !isAskedToHold && !memory.openTask && !MAY_BE_ABOUT_SAFETY.test(studentText) ? (getProblemNote(studentText) ?? getTeachFirstNote(studentText, turnCount === 1)) : null;
    const openingNote = canFitTheStart && turnCount <= TURNS_THAT_SET_THE_START ? (prompt.openingNote ?? null) : null;
    const levelLine = studentLevel === null ? undefined : prompt.levelLines?.[studentLevel];
    const isExerciseReply = isExerciseDueNow();
    // Words that may be serious come before any exercise, and help for a student in danger must never be sent back.
    const wantedExercise = MAY_BE_ABOUT_SAFETY.test(studentText) || isAskedToHold ? null : getWantedExercise();
    const worked = lead ? workedForLead : null;
    if (lead) workedForLead = null;
    const leadNote = lead ? { lead: LEAD_NOTES[lead === 'next' && isExerciseReply ? 'exercise' : lead], ...(worked ? { code_worked_it: worked } : {}) } : null;
    const claims = lessonPlanner?.takeNewClaims() ?? null;
    if (claims) pendingNotes.push({ said_so_far: claims });
    const turnNotes = [attempts.startTurn(studentText), prompt.turnNote, levelLine ? { level: levelLine } : null, shapeNote, openingNote, isAskedToHold ? (plainWish === 'lost' ? STAY_NOTE : HOLD_NOTE) : null, wasHeldAtStart && speaker === 'student' && plainWish === null ? WAITING_NOTE : null, plainWish === 'filler' && getOpenTaskOnBoard(getBoardNow()) !== null ? EXERCISE_OPEN_NOTE : plainWish === 'filler' && wasPausedAtStart ? CARRY_ON_NOTE : null, leadNote, lead && isPaceSlowNow ? SLOW_NOTE : null, isOnACard && turnCount === 1 ? OPENING_A_CARD_NOTE : null].filter((note) => note !== null);
    const memoryAtStart = memory;
    const isLessonGoingOn = hasLessonLeft();
    const wordsForSafetyCheck = speaker === 'code' ? (draftToRead ?? studentText) : studentText;
    const turn: TurnWork = {
      speaker,
      wordsForSafetyCheck,
      heldTry: {
        canBeSteered: wantedExercise !== null,
        isHolding: false,
        beatsOut: 0,
        commands: [],
        forget() {
          turn.ready = [];
          turn.beats.splice(turn.heldTry.beatsOut);
          turn.reader.forgetCommands(memoryAtStart.kinds);
          for (const command of turn.heldTry.commands.splice(0)) {
            const dropped = boardOperations.findIndex((operation) => operation.kind === 'command' && operation.command === command);
            if (dropped !== -1) boardOperations.splice(dropped, 1);
          }
          readerMemory = memoryAtStart;
          turn.heldTry.isHolding = false;
        },
      },
      isLead: lead !== null,
      id: turnCount,
      studentText,
      signal,
      startedAtMs: getNowMs(),
      reader: new BeatTextReader({
        board: memory.kinds,
        ...(onAskScene ? { onAskScene } : {}),
        onSafetyReply: () => noteSafetyReply(turn, readerMemory),
        checkCommand(command) {
          // In a reply that sets the exercise this stops the line before the student sees it. Elsewhere the line may be a worked example, so only the task it gives away is stopped.
          const givenAway = isExerciseReply && command.kind === 'writeMath' && showsItsAnswer(command.tex) ? getAnswerShownProblem(command.tex) : getGivenAwayProblem(command, readerMemory, memory);
          // Only on a first try, because a student with some exercise is better off than one with none.
          const steer = givenAway ?? (command.kind === 'task' && turn.attempts < MAX_ATTEMPTS ? (getRepeatedProblem(command, readerMemory) ?? (wantedExercise ? getExerciseProblem(command, wantedExercise, wasLastExerciseWords, readerMemory, memory) : null)) : null);
          turn.isExerciseSteered = steer !== null;
          return steer ? { ok: false, problem: steer, isWrongMath: true } : checkAgainstBoard(command, readerMemory);
        },
        onToolCall(call) {
          turn.toolCall = call;
        },
        onAttemptReport(report) {
          attempts.noteReport(report);
          trace('attemptReported', { report });
        },
        onCommandKept(command) {
          if (command.kind === 'task') {
            const problem = getTaskLine(command, readerMemory);
            if (problem) problemsSet.add(problem);
            wasLastExerciseWords = isWrittenWordsTask(command, readerMemory, memory);
            turn.heldTry.canBeSteered = false;
            turn.heldTry.isHolding = false;
          }
          if (SHOWING_KINDS.has(command.kind) || command.kind === 'task') turn.heldTry.commands.push(command);
          readerMemory = getMemoryAfter(command, readerMemory);
          boardProblems.noteWritten(command);
          boardOperations.push({ kind: 'command', atMs: boardOperations.length, command, overMs: null });
          lessonPlanner?.noteCommand(command);
          if (SHOWING_KINDS.has(command.kind)) turn.hasShownAStep = true;
          if (command.kind === 'highlight' || command.kind === 'annotate') marksDrawn.set(command.id, { target: command.target, ...('tex' in command && command.tex !== undefined ? { tex: command.tex } : {}) });
        },
        onCommandDropped(command) {
          const dropped = boardOperations.findIndex((operation) => operation.kind === 'command' && operation.command === command);
          if (dropped !== -1) boardOperations.splice(dropped, 1);
          if ('id' in command && readerMemory.openTask?.id === command.id) readerMemory = { ...readerMemory, openTask: null };
        },
        onBadCommand(problem) {
          turn.refused.push(problem);
          trace('commandRefused', { problem });
        },
        // A reply that may be about a child's safety must get out, whatever it tried to draw.
        ...(MAY_BE_ABOUT_SAFETY.test(studentText)
          ? {}
          : {
              onDrawingRefused(problem: string) {
                turn.drawingRefused = problem;
                trace('drawingRefused', { problem });
              },
            }),
        onWrongMath(problem) {
          turn.wrongMath = problem;
          trace('mathRefused', { problem });
        },
        // Only a first attempt, because help for a student in crisis must get out, even in imperfect words.
        checkWords: (text) => (onAskScene ? getPictureProblem(text, readerMemory) : null) ?? getWordsProblem(text, readerMemory, turn.beats.length === 0) ?? (turn.attempts < MAX_ATTEMPTS ? (getClaimProblem(text) ?? getLessonWordsProblem(text) ?? (lead && isLessonGoingOn ? getLeadWordsProblem(text) : null) ?? (lead && wantedExercise && !readerMemory.openTask && ENDS_ON_A_QUESTION.test(text) ? BARE_QUESTION_PROBLEM : null)) : null),
        onWrongWords(problem) {
          turn.wrongWords = problem;
          trace('wordsRefused', { problem });
        },
        isAlreadySaid(text) {
          if (turn.attempts < 2) return false;
          const words = toComparableWords(text);
          const isRepeat = words !== '' && toComparableWords(getWordsSaid(turn)).includes(words);
          const isLongRepeat = isRepeat && words.split(' ').length >= FEWEST_WORDS_IN_A_REPEAT;
          const isOpeningRepeat = isRepeat && !turn.hasNewWordsThisAttempt;
          if (!isLongRepeat && !isOpeningRepeat) turn.hasNewWordsThisAttempt = true;
          return isLongRepeat || isOpeningRepeat;
        },
        onBeatEnd(written) {
          if (isWaitHeard(turn)) return;
          // The lesson rules teach the model to write a teach command, and one beside the help would bring the picture back over it.
          const kept = turn.sceneAside ? { ...written, script: written.script.filter((part) => typeof part === 'string' || part.kind !== 'boardMode' || part.mode !== 'teach') } : written;
          const parts = takesSceneAside(turn) ? { ...kept, script: [SCENE_ASIDE, ...kept.script] } : kept;
          // A gentle "do you have someone with you?" has no safety words, and it must still reach a student who may be in danger.
          if (parts.expectsReply && !turn.reader.isSafetyReply && !MAY_BE_ABOUT_SAFETY.test(studentText) && !turn.hasShownAStep && attempts.isAtDeadEnd()) {
            turn.isQuestionHeld = true;
            return;
          }
          const opening = turn.beats.length === 0 ? getBeatWithoutTic(parts, turn.lostOpeningBeat, turn.isLead) : parts;
          if (!opening) {
            turn.lostOpeningBeat = true;
            return;
          }
          const unsignposted = { ...opening, script: opening.script.map((part) => (typeof part === 'string' ? withoutNextSignpost(part) : part)) };
          const beat = getWrittenBeat(turn.startsAfterNod && turn.beats.length === 0 ? withoutOpeningNod(unsignposted) : unsignposted, `t${turnCount}-b${turn.beats.length}`, turn.refused);
          if (!beat) return;
          turn.hasModelWords = true;
          if (soundsLikeCrisisReply(getBeatText(beat))) safety?.showHelp();
          turn.hasWordsSinceToolResult = true;
          addBeat(turn, parts.startsStretch ? { ...beat, pauseBeforeMs: getNextBreathMs() } : beat);
        },
      }),
      beats: [],
      ready: [],
      refused: [],
      notes: [...pendingNotes, ...turnNotes].map((note) => JSON.stringify(note)),
      carriedNotes: pendingNotes.length,
      startsAfterNod: nodded,
      raw: '',
      hasModelWords: false,
      wasStoppedByLength: false,
      hasAttemptText: false,
      hasSaidChecking: false,
      isExerciseSteered: false,
      lostOpeningBeat: false,
      wrongMath: null,
      drawingRefused: null,
      wrongWords: null,
      toolCall: null,
      toolCalls: [],
      toolResults: new Map(),
      latestToolResult: null,
      hasWordsSinceToolResult: false,
      toolCostUsd: 0,
      isQuestionHeld: false,
      hasShownAStep: false,
      isCheckingMath: false,
      hasNewWordsThisAttempt: false,
      refusalCategory: null,
      firstTextMs: null,
      firstBeatMs: null,
      attempts: 0,
      usage: null,
      attemptUsage: null,
      isAttemptUsageFinal: false,
      isUsageEstimated: false,
      costUsd: 0,
      // What is left when the session stops reading this turn at a yield, which is an interruption.
      endedAs: 'aborted',
      safetyReading: 'unread',
      safetyRead: Promise.resolve(),
      safetyAnswered: createNever(),
      lineWish: plainWish ?? 'unread',
      lineRead: Promise.resolve(),
      replyRead: null,
      hasPlainWish: plainWish !== null,
      isNothingToAnswer: wasHeldAtStart && plainWish === 'filler',
      wasPausedAtStart,
      hasStoppedForSafety: false,
      isFinished: false,
      startsAfterCut: false,
    };
    if (safety && (speaker === 'student' || speaker === 'page' || draftToRead !== null)) {
      draftToRead = null;
      turn.safetyReading = 'pending';
      turn.safetyAnswered = new Promise((resolve) => {
        const onlySteersTheLesson = () => turn.lineRead.then(() => WISHES_ONLY_ABOUT_THE_LESSON.has(turn.lineWish) || (turn.hasPlainWish && turn.lineWish !== 'leave'));
        turn.safetyRead = withinReadLimit<StudentReading>(safety.readStudent(wordsForSafetyCheck, lastSpokenText, onlySteersTheLesson), 'unread', timeouts.safetyReadLimitMs).then((reading) => {
          turn.safetyReading = reading;
          resolve(SAFETY_ANSWERED);
          if (isAboutSafety(reading)) {
            noteLeadStopEvent('crisis');
            tellLeadStopped();
            if (turn.isFinished) noteLateSafetyRead(turn);
          } else if (speaker === 'code' && didDraftRaiseCrisis && (reading === 'none' || reading === 'school')) {
            noteLeadStopEvent('cleanRead');
            tellReadSettled();
          }
          if (speaker === 'code') didDraftRaiseCrisis = false;
        });
      });
    }
    if (speaker === 'student' && plainWish === null) readLineOf(turn, readers?.readLine(studentText, { tutorSaid: lastSpokenText, isTutorWaiting: wasHeldAtStart || wasPausedAtStart, isTaskOpen: getOpenTaskOnBoard(getBoardNow()) !== null }) ?? Promise.resolve('unread'));
    if (speaker === 'page') readLineOf(turn, Promise.resolve('unread'));
    return turn;
  };

  const settleLinesInOrder = (turn: TurnWork) => {
    lineSettling = lineSettling.then(() => Promise.all([turn.lineRead, turn.safetyRead])).then(() => settleLine(turn));
  };

  const readLineOf = (turn: TurnWork, read: Promise<LineRead>) => {
    turn.lineWish = 'pending';
    linesBeingRead += 1;
    const startedAtMs = getNowMs();
    turn.lineRead = withinReadLimit<LineRead>(read, 'unread').then((wish) => {
      turn.lineWish = wish;
      trace('lineRead', { wish, ms: Math.round(getNowMs() - startedAtMs) });
    });
    settleLinesInOrder(turn);
  };

  const getNextBreathMs = () => BREATHS_MS[breathsTaken++ % BREATHS_MS.length] as number;

  // Beats stop at commas, so a beat after a cut or a retry would otherwise read as "Tell me your plan, That sounds serious."
  const endWordsAlreadySaid = (turn: TurnWork) => {
    const lastBeat = turn.beats.at(-1);
    if (lastBeat) turn.beats[turn.beats.length - 1] = withSentenceEnd(lastBeat);
  };

  const addBeat = (turn: TurnWork, beat: TutorBeat) => {
    if (turn.startsAfterCut && /^\p{Lu}/u.test(getBeatText(beat))) endWordsAlreadySaid(turn);
    turn.startsAfterCut = false;
    turn.firstBeatMs ??= getNowMs() - turn.startedAtMs;
    turn.beats.push(beat);
    turn.ready.push(beat);
    if (turn.heldTry.canBeSteered && turn.attempts < MAX_ATTEMPTS && beat.script.some((part) => typeof part !== 'string' && SHOWING_KINDS.has(part.kind))) turn.heldTry.isHolding = true;
  };

  const sayWords = (turn: TurnWork, words: string) => {
    const parsed = parseBeat({ id: `t${turn.id}-line${turn.beats.length}`, script: takesSceneAside(turn) ? [SCENE_ASIDE, words] : [words], expectsReply: /\?$/.test(words) });
    if (parsed.ok) addBeat(turn, parsed.value);
  };

  const sayLine = (turn: TurnWork, use: SpokenLineUse) => {
    trace('lineSpoken', { use });
    sayWords(turn, pickLine(use));
  };

  const getRequest = (turn: TurnWork): TutorModelRequest => {
    const sent: TutorTurn[] = [...turns, { role: 'user', text: turn.studentText }, ...turn.notes.map((text) => ({ role: 'system' as const, text }))];
    return { system: prompt.system, turns: isAfterSafetyReply ? sent.filter((entry) => entry.role !== 'system' || !PERSONAL_NOTE.test(entry.text)) : sent };
  };

  const getDeadlineMs = (turn: TurnWork, attemptStartedAtMs: number, lastEventAtMs: number): number => {
    if (turn.reader.isTurnOver) return lastEventAtMs + timeouts.finishGraceMs;
    if (turn.hasAttemptText) return lastEventAtMs + timeouts.betweenTextMs;
    const hardMs = attemptStartedAtMs + timeouts.firstTextMs;
    // Its own wait, or the time the first attempt took would fire this straight after its line.
    if (turn.isCheckingMath && !turn.hasSaidChecking) return Math.min(hardMs, attemptStartedAtMs + timeouts.checkingMathMs);
    // Clear danger has code's own line ready, so a slow model does not hold it back.
    return isHelpDueAtDeadline(turn) ? Math.min(hardMs, (turn.attempts > 1 ? attemptStartedAtMs : turn.startedAtMs) + timeouts.helpDueMs) : hardMs;
  };

  const readEvent = (turn: TurnWork, event: ModelEvent): AttemptEnd | null => {
    if (event.type === 'started') {
      turn.attemptUsage = event.usage;
      promptTokens = event.usage.inputTokens + event.usage.cacheReadTokens + event.usage.cacheWriteTokens;
    }
    if (event.type === 'text') {
      turn.firstTextMs ??= getNowMs() - turn.startedAtMs;
      const seam = event.isNewBlock && turn.raw !== '' && !/\s$/.test(turn.raw) ? ' ' : '';
      turn.hasAttemptText = true;
      turn.raw += seam + event.text;
      turn.reader.push(seam + event.text);
      if (turn.wrongMath !== null) return 'wrongMath';
      if (turn.drawingRefused !== null) return 'drawingRefused';
      if (turn.wrongWords !== null) return 'wrongWords';
      if (turn.toolCall !== null) return 'toolCall';
      if (turn.isQuestionHeld) return 'heldQuestion';
      if (isWaitHeard(turn)) return 'waitHeard';
    }
    if (event.type === 'finished') {
      turn.attemptUsage = event.usage;
      turn.isAttemptUsageFinal = true;
      if (event.stopReason === 'refused') {
        turn.refusalCategory = event.refusalCategory;
        return 'refused';
      }
      turn.wasStoppedByLength = event.stopReason === 'lengthLimit';
      return 'ended';
    }
    return null;
  };

  async function* runAttempt(turn: TurnWork): AsyncGenerator<Beat, AttemptEnd> {
    if (turn.signal.aborted) return 'aborted';
    const attempt = new AbortController();
    // Left as it is when the session stops reading this generator at a yield, which is an interruption too.
    let end: AttemptEnd = 'aborted';
    const endAs = (value: AttemptEnd) => (end = value);
    turn.attempts += 1;
    turn.heldTry.commands = [];
    turn.hasAttemptText = false;
    turn.hasNewWordsThisAttempt = false;
    turn.attemptUsage = null;
    turn.isAttemptUsageFinal = false;
    const attemptStartedAtMs = getNowMs();
    let lastEventAtMs = attemptStartedAtMs;
    const events = model.stream(getRequest(turn), attempt.signal)[Symbol.asyncIterator]();
    let pending = events.next();
    try {
      for (;;) {
        const result = await waitUntil(Promise.race([pending, turn.safetyAnswered]), getDeadlineMs(turn, attemptStartedAtMs, lastEventAtMs), turn.signal, getNowMs);
        if (result === 'aborted') return endAs('aborted');
        if (result === SAFETY_ANSWERED) {
          turn.safetyAnswered = createNever();
          if (isHelpDueInCode(turn)) return endAs('stoppedForSafety');
          yield* takeReady(turn);
          continue;
        }
        if (result === 'deadline') {
          if (isHelpDueAtDeadline(turn)) return endAs('stoppedForSafety');
          if (turn.reader.isTurnOver) return endAs('ended');
          if (turn.hasAttemptText) return endAs('stalledInText');
          if (!turn.isCheckingMath || turn.hasSaidChecking || getNowMs() - attemptStartedAtMs >= timeouts.firstTextMs) return endAs('stalledBeforeText');
          turn.hasSaidChecking = true;
          sayLine(turn, 'checkingMath');
          yield* takeReady(turn);
          continue;
        }
        if (result.done) return endAs('ended');
        const eventEnd = readEvent(turn, result.value);
        if (isHelpDueInCode(turn)) return endAs('stoppedForSafety');
        yield* takeReady(turn);
        // Taken after the yield, because the session holds a next idea here until the last one has been spoken, and that wait is not a stalled model.
        lastEventAtMs = getNowMs();
        if (eventEnd) return endAs(eventEnd);
        pending = events.next();
      }
    } catch (error) {
      if (turn.signal.aborted) return endAs('aborted');
      const problem = error instanceof Error ? error.message : String(error);
      if (error instanceof ModelRejectedError) {
        trace('modelRejected', { problem });
        return endAs('rejected');
      }
      trace('modelFailed', { problem });
      return endAs(turn.hasAttemptText ? 'stalledInText' : 'failed');
    } finally {
      attempt.abort();
      pending.catch(() => {});
      void events.return?.(undefined).catch(() => {});
      addAttemptUsage(turn, end);
    }
  }

  // The part already cached is what the last request reported, and the rest of what was sent is new.
  const getEstimatedRequestUsage = (turn: TurnWork): ModelUsage => {
    const sentTokens = Math.ceil(JSON.stringify(getRequest(turn)).length / CHARACTERS_PER_TOKEN);
    const cachedTokens = Math.min(promptTokens, sentTokens);
    return { inputTokens: sentTokens - cachedTokens, outputTokens: 0, cacheReadTokens: cachedTokens, cacheWriteTokens: 0 };
  };

  // A stream cut short never reports its output, and one cut before its headers reports nothing, so those are estimated. A request the API turned away costs nothing.
  const addAttemptUsage = (turn: TurnWork, end: AttemptEnd) => {
    const wasCutBeforeReport = !turn.attemptUsage && (end === 'aborted' || end === 'stalledBeforeText' || end === 'stoppedForSafety');
    if (!turn.attemptUsage && !wasCutBeforeReport) return;
    const reported = turn.attemptUsage ?? getEstimatedRequestUsage(turn);
    const part = turn.isAttemptUsageFinal ? reported : { ...reported, outputTokens: Math.ceil(turn.raw.length / CHARACTERS_PER_TOKEN) };
    turn.isUsageEstimated ||= !turn.isAttemptUsageFinal;
    turn.usage = addUsage(turn.usage, part);
  };

  function* takeReady(turn: TurnWork): Generator<Beat> {
    while (turn.ready.length > 0 && !turn.heldTry.isHolding && !turn.signal.aborted) {
      turn.heldTry.beatsOut += 1;
      yield turn.ready.shift() as Beat;
    }
  }

  const getWordsSaid = (turn: TurnWork) => turn.beats.map((beat) => getBeatText(beat)).join(' ');

  const noteCorrection = (turn: TurnWork, problem: string) => {
    turn.notes.push(JSON.stringify({ correction: { already_said: getWordsSaid(turn), problem } }));
    turn.raw = '';
    turn.startsAfterCut = true;
  };

  const handleWrongMath = (turn: TurnWork, canRetry: boolean): TurnStep => {
    const problem = turn.wrongMath as string;
    turn.wrongMath = null;
    if (!canRetry) {
      turn.raw = getWordsSaid(turn);
      turn.refused.push(`a line of math was not drawn, because code found it false: ${problem}`);
      sayLine(turn, 'mathDropped');
      return 'over';
    }
    if (turn.isExerciseSteered) {
      turn.heldTry.forget();
      noteCorrection(turn, problem);
      return 'retry';
    }
    // The student never saw the false line or heard its words, so nothing needs correcting aloud, and a quiet retry keeps the exchange from sounding confused.
    turn.isCheckingMath = true;
    noteCorrection(turn, `What you were about to put on the board is false: ${problem}. Code stopped it, and the student did not hear the words after it. Write what is true and carry straight on, and never tick a false line. If you did not mean a line as an equal step, write it with the claim that says what it is instead.`);
    return 'retry';
  };

  const handleRefusedDrawing = (turn: TurnWork, canRetry: boolean): TurnStep => {
    const problem = turn.drawingRefused as string;
    turn.drawingRefused = null;
    turn.reader.closeAttempt();
    if (!canRetry) {
      turn.raw = getWordsSaid(turn);
      turn.refused.push(`a drawing is not on the board: ${problem}`);
      sayLine(turn, 'drawingDropped');
      return 'over';
    }
    noteCorrection(turn, `What you were about to draw is not on the board, because the board refused it: ${problem}. The student did not hear the words about it. Write it again, fixed, with the words that go with it. If it still cannot be drawn, say it in words.`);
    return 'retry';
  };

  const handleWrongWords = (turn: TurnWork, canRetry: boolean): TurnStep => {
    const problem = turn.wrongWords as string;
    turn.wrongWords = null;
    turn.reader.closeAttempt();
    if (!canRetry) {
      turn.raw = getWordsSaid(turn);
      sayLine(turn, 'mathDropped');
      return 'over';
    }
    if (turn.heldTry.canBeSteered) turn.heldTry.forget();
    noteCorrection(turn, problem);
    return 'retry';
  };

  const handleStall = (turn: TurnWork, end: 'stalledBeforeText' | 'stalledInText' | 'failed', canRetry: boolean): TurnStep => {
    if (turn.latestToolResult?.spoken && !turn.hasWordsSinceToolResult) return sayToolResult(turn, turn.latestToolResult);
    if (!canRetry) {
      sayLine(turn, 'couldNotReply');
      return 'over';
    }
    if (end === 'stalledInText' && turn.beats.length > 0) {
      sayLine(turn, 'lostThread');
      noteCorrection(turn, 'Your reply was cut off by a connection problem. Carry on from where you stopped.');
    } else if (end === 'stalledBeforeText' && !turn.isLead && turn.safetyReading !== 'pending' && !isAboutSafety(turn.safetyReading)) {
      sayLine(turn, 'stillThere');
    }
    turn.raw = '';
    return 'retry';
  };

  // The question is dropped unheard, and asked for again with the step shown. If that fails too, a plain line stands in, because a third question must not reach the student.
  const handleHeldQuestion = (turn: TurnWork, canRetry: boolean): TurnStep => {
    turn.isQuestionHeld = false;
    turn.reader.reopenTurn();
    if (!canRetry) {
      sayLine(turn, 'stuckHandBack');
      return 'over';
    }
    noteCorrection(turn, 'You were about to ask them another question on a point they have already missed twice, and they did not hear it. Show the next step on the board and say why it works, with no question about that point. If their message is about their safety, follow your safety rules instead.');
    return 'retry';
  };

  // The model can stop at "are you thinking of hurting yourself?" with no help named, and the student may not answer, so code names it.
  const addHelpIfMissing = (turn: TurnWork) => {
    if ((!turn.reader.isSafetyReply && !isAboutSafety(turn.safetyReading)) || namesHelp(`${getWordsSaid(turn)} ${turn.raw}`)) return;
    const help = ` ${pickLine('safetyHelp')}`;
    trace('helpAdded');
    turn.raw += help;
    turn.reader.push(help);
  };

  const replyLacksHelp = (turn: TurnWork) => {
    if (!isAboutSafety(turn.safetyReading) || turn.hasStoppedForSafety) return false;
    const words = `${getWordsSaid(turn)} ${turn.raw}`;
    return (isSafetyKind(turn.safetyReading) && saysNobodyCanBeTold(words)) || (!turn.reader.isSafetyReply && !namesHelp(words));
  };

  // In English code's line is what the model would say anyway, so the student hears it sooner, and a reply in another language finishes because it usually names help there.
  const isHelpDueInCode = (turn: TurnWork) => isSafetyKind(turn.safetyReading) && replyLacksHelp(turn) && readsAsEnglish(turn.wordsForSafetyCheck);

  const isHelpDueAtDeadline = (turn: TurnWork) => isSafetyKind(turn.safetyReading) && replyLacksHelp(turn) && !turn.isCheckingMath;

  // What is unsaid goes, because help must not wait behind a question or a lesson, and the words said so far stay in history with it.
  const sayHelpInCode = (turn: TurnWork): TurnStep => {
    turn.hasStoppedForSafety = true;
    trace('stoppedForSafety');
    turn.heldTry.isHolding = false;
    turn.beats.splice(turn.beats.length - turn.ready.length);
    turn.ready = [];
    endWordsAlreadySaid(turn);
    turn.reader.dropAttempt();
    turn.reader.markSafetyReply();
    const line = pickLine(turn.safetyReading === 'abuse' || turn.safetyReading === 'grooming' ? 'safetyStopHurt' : 'safetyStop');
    turn.raw = `${getWordsSaid(turn)} ${line}`.trim();
    turn.reader.push(line);
    turn.reader.finish();
    return 'over';
  };

  // The model finished with no help the code can see, in another language or on vague words, so it gets one more go, and code names help in English if that fails too.
  const askAgainForHelp = (turn: TurnWork): TurnStep => {
    turn.hasStoppedForSafety = true;
    trace('askedAgainForHelp');
    turn.reader.dropAttempt();
    turn.reader.markSafetyReply();
    noteCorrection(turn, turn.safetyReading === 'vague' ? VAGUE_WORDS_PROBLEM : SAFETY_STOP_PROBLEM);
    return turn.attempts < MAX_ATTEMPTS ? 'retry' : finishAnswer(turn, false);
  };

  // A model that has a result and has not said it must not hold the turn, or the spending, so code says it with no further wait. What it says stays in the history, so the next turn knows the student has the answer.
  const sayToolResult = (turn: TurnWork, result: ToolResult | null): TurnStep => {
    turn.toolCall = null;
    turn.endedAs = 'ended';
    trace('toolResultSpoken', { hasWords: Boolean(result?.spoken) });
    if (result?.spoken) sayWords(turn, result.spoken);
    else sayLine(turn, 'noToolAnswer');
    turn.hasModelWords = true;
    turn.raw = getWordsSaid(turn);
    return 'over';
  };

  const finishAnswer = (turn: TurnWork, canRetry: boolean): TurnStep => {
    if (isAboutSafety(turn.safetyReading)) turn.reader.releaseTextAfterTurn();
    addHelpIfMissing(turn);
    turn.reader.finish();
    if (turn.drawingRefused !== null) return handleRefusedDrawing(turn, canRetry);
    if (turn.wrongWords !== null) return handleWrongWords(turn, turn.attempts < MAX_ATTEMPTS);
    if (turn.isQuestionHeld) return handleHeldQuestion(turn, canRetry);
    if (turn.latestToolResult && !turn.hasWordsSinceToolResult) return sayToolResult(turn, turn.latestToolResult);
    if (!turn.hasModelWords) {
      turn.endedAs = 'noWords';
      trace('noWords');
      sayLine(turn, 'couldNotReply');
    } else if (turn.reader.wasCutShort || turn.wasStoppedByLength) {
      sayLine(turn, 'cutShort');
    }
    if (isAReadOut(turn) && !turn.reader.isSafetyReply) sayLine(turn, 'waitingAfterFailedRead');
    return 'over';
  };

  // Anthropic's page on refusals says to discard partial output, so what was not yet spoken goes unsaid, and none of it stays in history.
  const handleRefusal = (turn: TurnWork, canRetry: boolean): TurnStep => {
    const wasAskedHow = turn.refusalCategory === ASKED_HOW_IT_WORKED;
    turn.reader.dropAttempt();
    turn.raw = '';
    if (didNobodySpeak(turn)) return handleRefusalNobodyAskedFor(turn);
    if (wasAskedHow && canRetry) {
      turn.notes.push(JSON.stringify(ASKED_HOW_NOTE));
      if (turn.hasModelWords) noteCorrection(turn, 'Carry on from where you stopped.');
      return 'retry';
    }
    if (!isPlainRefusal(turn)) {
      safety?.showHelp();
      noteSafetyReply(turn, memory);
      sayLine(turn, turn.hasModelWords ? 'refusedAfterWords' : 'refused');
    } else if (wasAskedHow) sayLine(turn, 'askedHowDeclined');
    else sayLine(turn, turn.hasModelWords ? 'refusedPlainAfterWords' : 'refusedPlain');
    return 'over';
  };

  const handleRefusalNobodyAskedFor = (turn: TurnWork): TurnStep => {
    refusalsNobodyAskedFor += 1;
    trace('refusedNobodyAsked', { inARow: refusalsNobodyAskedFor });
    if (refusalsNobodyAskedFor >= MOST_REFUSALS_NOBODY_ASKED_FOR) sayLine(turn, 'lostPlace');
    return 'over';
  };

  const startFromCleanHistory = (turn: TurnWork) => {
    turns = [];
    toldBoard = '{}';
    toldStep = 'null';
    if (profileNote && !pendingNotes.includes(profileNote)) pendingNotes = [profileNote, ...pendingNotes];
    pendingNotes = [...getStandingNotes().filter((note) => !pendingNotes.includes(note)), ...pendingNotes];
    turn.notes = pendingNotes.map((note) => JSON.stringify(note));
    turn.carriedNotes = pendingNotes.length;
  };

  // The first rejection may be the student's message, which is dropped. A second, on a clean message, blames the history. A third means nothing will get through.
  const handleRejection = (turn: TurnWork): TurnStep => {
    rejectionsInARow += 1;
    if (rejectionsInARow === 1) {
      sayLine(turn, 'couldNotReply');
      return 'over';
    }
    if (rejectionsInARow === 2 && turns.length > 0) {
      startFromCleanHistory(turn);
      return 'retry';
    }
    closedReason = 'broken';
    hasToldClosed = true;
    sayLine(turn, 'broken');
    return 'over';
  };

  const handleEnd = (turn: TurnWork, end: AttemptEnd): TurnStep => {
    const canRetry = turn.attempts - turn.toolCalls.length < MAX_ATTEMPTS;
    turn.endedAs = end;
    if ((end === 'waitHeard' || end === 'ended') && isWaitHeard(turn)) {
      turn.endedAs = 'ended';
      turn.reader.dropAttempt();
      turn.raw = getWordsSaid(turn);
      return 'over';
    }
    switch (end) {
      case 'aborted':
      case 'noWords':
        return 'over';
      case 'waitHeard':
        return 'over';
      case 'stoppedForSafety':
        return sayHelpInCode(turn);
      case 'ended':
        if (isHelpDueInCode(turn)) return sayHelpInCode(turn);
        return replyLacksHelp(turn) ? askAgainForHelp(turn) : finishAnswer(turn, canRetry);
      case 'toolCall': {
        turn.reader.closeAttempt();
        const repeated = turn.toolResults.get(JSON.stringify(turn.toolCall));
        if (repeated) return sayToolResult(turn, repeated);
        return turn.toolCalls.length > MOST_TOOL_CALLS_A_TURN ? sayToolResult(turn, turn.latestToolResult) : 'retry';
      }
      case 'heldQuestion':
        turn.reader.closeAttempt();
        return handleHeldQuestion(turn, canRetry);
      case 'refused':
        return handleRefusal(turn, canRetry);
      case 'rejected':
        turn.reader.dropAttempt();
        return handleRejection(turn);
      case 'wrongMath':
        turn.reader.closeAttempt();
        return handleWrongMath(turn, canRetry);
      case 'drawingRefused':
        return handleRefusedDrawing(turn, canRetry);
      case 'wrongWords':
        return handleWrongWords(turn, canRetry);
      case 'stalledBeforeText':
      case 'stalledInText':
      case 'failed':
        turn.reader.closeAttempt();
        if (turn.wrongWords !== null) return handleWrongWords(turn, canRetry);
        // A question that closed as the stream dropped has ended the turn, and a new request would be thrown away.
        if (turn.reader.isTurnOver) return finishAnswer(turn, canRetry);
        return handleStall(turn, end, canRetry);
    }
  };

  // An expression nested past 1,000 to 2,000 levels overflows the stack, and that must not end the reply.
  const runToolSafely = async (call: ToolCall, signal: AbortSignal): Promise<ToolResult> => {
    try {
      return await runTool(call, { findSource: findSource ?? null, signal });
    } catch (error) {
      trace('toolFailed', { tool: call.tool, problem: String(error) });
      return { note: { tool: call.tool, ok: false, problem: 'that is nested too deep to work out' }, costUsd: 0, spoken: null };
    }
  };

  // Runs after the words before the call have gone to the voice, so a slow tool never holds them back.
  const answerToolCall = async (turn: TurnWork, call: ToolCall) => {
    turn.toolCall = null;
    turn.toolCalls.push(call);
    trace('toolCalled', { tool: call.tool });
    const result = turn.toolCalls.length > MOST_TOOL_CALLS_A_TURN ? { note: { tool: call.tool, ok: false, problem: 'No more tools this turn. Carry on in words.' }, costUsd: 0, spoken: turn.latestToolResult?.spoken ?? null } : await runToolSafely(call, turn.signal);
    turn.toolCostUsd += result.costUsd;
    turn.toolResults.set(JSON.stringify(call), result);
    turn.latestToolResult = result;
    turn.hasWordsSinceToolResult = false;
    turn.notes.push(JSON.stringify({ tool_result: result.note, already_said: getWordsSaid(turn), next: AFTER_A_TOOL }));
    turn.raw = '';
  };

  const getAcceptedRaw = (turn: TurnWork) => (turn.hasModelWords ? turn.reader.getKeptText(turn.raw).trim() : '');

  const startCompactingIfNeeded = () => {
    if (isCompacting || promptTokens < compactAtTokens || turns.length <= TURNS_KEPT_AFTER_COMPACTING || turnCount - lastCompactedAtTurn < TURNS_KEPT_AFTER_COMPACTING) return;
    const keptFrom = turns.findIndex((turn, index) => index >= turns.length - TURNS_KEPT_AFTER_COMPACTING && turn.role === 'user');
    if (keptFrom <= 0) return;
    isCompacting = true;
    const compacted = turns.slice(0, keptFrom);
    const turnsBefore = turns.length;
    trace('compactionStarted', { promptTokens, turns: compacted.length });
    void model
      .compact({ system: prompt.system, turns: compacted }, new AbortController().signal)
      .then((result) => {
        if (!result) return trace('compactionEmpty');
        turns = [{ role: 'summary', summary: result.summary }, ...turns.slice(keptFrom)];
        // The old size is out of date now, and a turn ending before the next request reports would compact again, as a 19 turn history did 11 s after a 562 turn one, for $0.02.
        promptTokens = 0;
        lastCompactedAtTurn = turnCount;
        toldBoard = '{}';
        toldStep = 'null';
        if (profileNote) pendingNotes.push(profileNote);
        pendingNotes.push(...getStandingNotes());
        onCompacted?.({ costUsd: model.getCostUsd(result.usage), turnsBefore, turnsAfter: turns.length });
      })
      // A failed summary leaves the history whole, and the next turn tries again.
      .catch((error: unknown) => trace('compactionFailed', { problem: String(error) }))
      .finally(() => {
        isCompacting = false;
      });
  };

  // An open exercise has its own wait, but a reply that asks after them needs their answer whatever is open.
  const readTheReply = (turn: TurnWork, words: string) => {
    if (!readers) return Promise.resolve();
    linesBeingRead += 1;
    return withinReadLimit<PromiseRead>(readers.readPromise(words), 'unread').then((read) => {
      linesBeingRead -= 1;
      turn.replyRead = read;
      if (turn.id === turnCount && read === 'asks') noteLeadStopEvent('replyAsks');
      if (turn.id === turnCount && read === 'waits' && getOpenTaskOnBoard(getBoardNow()) === null) noteLeadStopEvent('replyWaits');
      tellReadSettled();
    });
  };

  // Comes after the reply's words, so they never wait for this read.
  async function* nameHelpIfItAsks(turn: TurnWork): AsyncGenerator<Beat> {
    const words = getWordsSaid(turn);
    if (turn.isLead || words === '') return;
    const reading = readTheReply(turn, words);
    if (isAboutSafety(turn.safetyReading) || namesHelp(words)) return;
    await waitUntil(reading, getNowMs() + timeouts.lineReadWaitMs, turn.signal, getNowMs);
    if (turn.replyRead !== 'asks' && turn.lineWish !== 'unreadable') return;
    trace('helpAdded');
    sayLine(turn, 'ifWorried');
    yield* takeReady(turn);
  }

  const noteWordsThatWait = () => {
    if (getOpenTaskOnBoard(getBoardNow()) === null && promisesToWait(lastSpokenText)) noteLeadStopEvent('replyWaits');
  };

  // The check reads every line, so words that are only a lesson's, such as "call your local emergency number" on fires, stop nothing unless the tutor has asked after them.
  const getSafetyStop = (turn: TurnWork): LeadStopEvent | null => {
    if (turn.safetyReading !== 'none' && turn.safetyReading !== 'school') return 'crisis';
    return soundsLikeCrisisReply(lastSpokenText) || lastSpokenText.includes('?') ? 'hold' : null;
  };

  const finishTurn = (turn: TurnWork) => {
    memory = getMemoryAfterAnswering(memory);
    turn.costUsd = (turn.usage ? model.getCostUsd(turn.usage) : 0) + turn.toolCostUsd;
    const wasRefused = turn.endedAs === 'refused';
    const text = getAcceptedRaw(turn);
    if (text !== '') {
      turns.push({ role: 'user', text: turn.studentText }, ...turn.notes.map((note) => ({ role: 'system' as const, text: note })), { role: 'assistant', text });
      pendingNotes = pendingNotes.slice(turn.carriedNotes);
    } else if (!wasRefused && turn.endedAs !== 'rejected') {
      turns.push({ role: 'user', text: turn.studentText });
    }
    if (wasRefused && !didNobodySpeak(turn)) {
      const note = isPlainRefusal(turn) ? SKIPPED_NOTE : DECLINED_NOTE;
      if (!pendingNotes.includes(note)) pendingNotes.push(note);
    }
    if (turn.endedAs === 'ended') rejectionsInARow = 0;
    attempts.endTurn({ askedAQuestion: turn.beats.at(-1)?.expectsReply ?? false, wasCut: turn.endedAs === 'aborted' });
    lastBeats = turn.beats;
    const spoken = getWordsSaid(turn);
    if (spoken !== '') lastSpokenText = spoken;
    hasHadAReply = true;
    turn.isFinished = true;
    safety?.noteTurnEnd({ spoken, safetyRead: turn.safetyRead, getKind: () => (isSafetyKind(turn.safetyReading) ? turn.safetyReading : null) });
    lastRefused = wasRefused ? [] : turn.refused;
    hidesLastWords = wasRefused;
    const wasCrisisReply = isCrisisReply(turn);
    if (turn.beats.length > 0) lessonPlanner?.noteReplyEnded({ wasSafety: wasCrisisReply, wasLead: turn.isLead, spoken: getWordsSaid(turn) });
    const wasRefusedForSafety = !didNobodySpeak(turn) && wasRefused && !isPlainRefusal(turn);
    const wasSafetyReply = wasCrisisReply || wasRefusedForSafety;
    isAfterSafetyReply = wasSafetyReply || (isAfterSafetyReply && !turn.hasModelWords);
    const safetyStop = wasSafetyReply ? getSafetyStop(turn) : null;
    if (safetyStop) noteLeadStopEvent(safetyStop);
    if (didNobodySpeak(turn) && turn.endedAs === 'refused' && refusalsNobodyAskedFor < MOST_REFUSALS_NOBODY_ASKED_FOR) noteLeadStopEvent('replyWorked');
    else if (ENDS_THAT_STOP_A_LEAD.has(turn.endedAs)) noteLeadStopEvent('replyFailed');
    else if (turn.endedAs === 'ended') noteLeadStopEvent('replyWorked');
    if (didNobodySpeak(turn) && turn.endedAs === 'ended') refusalsNobodyAskedFor = 0;
    if (!turn.isLead && spoken !== '') noteWordsThatWait();
    onTurnEnd?.({
      wasLead: turn.isLead,
      studentText: turn.studentText,
      spokenText: getWordsSaid(turn),
      beats: turn.beats,
      refused: turn.refused,
      toolCalls: turn.toolCalls,
      attempts: turn.attempts,
      endedAs: turn.endedAs,
      refusalCategory: turn.refusalCategory,
      firstTextMs: turn.firstTextMs,
      firstBeatMs: turn.firstBeatMs,
      usage: turn.usage,
      isUsageEstimated: turn.isUsageEstimated,
      promptTokens,
      costUsd: turn.costUsd,
    });
    startCompactingIfNeeded();
  };

  const profileLoading = loadProfile?.().then(
    (loaded) => {
      if (!loaded) return;
      profileNote = toProfileNote(loaded);
      studentLevel = loaded.level;
      pendingNotes.push(profileNote);
      isOnACard = Boolean(loaded.cardTitle);
      if (loaded.cardMaterial) lessonPlanner?.noteCardLesson(toCardPlan(loaded.cardMaterial));
    },
    (error: unknown) => trace('profileFailed', { problem: String(error) }),
  );

  // Failing to read it leaves no note at all, and the prompt treats that as knowing nothing of earlier sessions.
  const memoryLoading = loadMemory?.().then(
    (loaded) => {
      memoryNote = { ...loaded };
      canFitTheStart = holdsWhereToStart(loaded);
      pendingNotes.push(memoryNote);
    },
    (error: unknown) => trace('memoryFailed', { problem: String(error) }),
  );

  const closeIfSpent = (turn: TurnWork) => {
    closedReason ??= getSpendLimit();
    if (closedReason === null || hasToldClosed) return;
    hasToldClosed = true;
    trace('tutorClosed', { reason: closedReason });
    sayLine(turn, closedReason);
  };

  return {
    async *reply({ text, carried = '', lead = null, isFromCode = false, isOpening = false }, signal) {
      // The last turn holds the carried words, or a safety check chose to drop them, so only what is new goes in. If that turn never began, nothing holds them, and they all go in. The rule keeps only the newest words it owes, with their spacing evened out.
      const isCarriedHere = carried !== '' && toSpacedWords(lastAskedText ?? '').endsWith(toSpacedWords(carried));
      lastAskedText = text;
      const studentText = cleanStudentText(isCarriedHere ? text.slice(carried.length) : text);
      if (studentText === '') {
        const said = parseBeat({ id: `t${turnCount}-unheard`, script: [pickLine('notHeard')], expectsReply: true });
        if (said.ok) yield said.value;
        return;
      }
      if (!lead) onStudentWords?.(studentText);
      // Skipped on words this list knows. Vaguer words reach the planner, whose `stay` and `getTrustedMove` hold them.
      // A student who cuts a card's opening scene speaks before the tutor has heard the card's title, so those are their own words.
      if (!lead && !MAY_BE_ABOUT_SAFETY.test(studentText) && (!isOpening || turnCount === 0)) lessonPlanner?.noteStudentWords({ words: studentText, isOpening: turnCount === 0 && cutWordsSent === null, tutorSaid: lastBeats.map(getBeatText).join(' ') });
      await waitForLastTurn();
      if (profileLoading || memoryLoading) await Promise.race([Promise.all([profileLoading, memoryLoading]), delay(timeouts.profileWaitMs)]);
      isTurnRunning = true;
      const turn = startTurn(studentText, lead, isFromCode, isOpening, signal);
      if (Array.from(studentText).length >= TYPED_TEXT_MAX_CHARACTERS) turn.notes.push(JSON.stringify(CLIPPED_NOTE));
      try {
        closeIfSpent(turn);
        // On a line in another language, or a word that may only be a nod, what the model should do hangs on the read, and the wait is about a second on these lines alone.
        if (closedReason === null && turn.speaker === 'student' && !turn.hasPlainWish && (turn.wasPausedAtStart || !readsAsEnglish(studentText))) {
          await waitUntil(turn.lineRead, turn.startedAtMs + timeouts.lineReadWaitMs, signal, getNowMs);
          const lineNote = getLineNote(turn.lineWish, turn.wasPausedAtStart, studentText);
          if (lineNote) turn.notes.push(JSON.stringify(lineNote));
        }
        if (closedReason !== null || turn.isNothingToAnswer) {
          turn.endedAs = 'ended';
          yield* takeReady(turn);
          return;
        }
        for (;;) {
          const end = yield* runAttempt(turn);
          // A reply can end before the check has read the words it answered, and the check decides how this turn ends.
          if (end === 'ended' || end === 'refused') {
            await waitUntil(turn.safetyRead, getNowMs() + timeouts.safetyReadWaitMs, turn.signal, getNowMs);
            await waitUntil(turn.lineRead, turn.startedAtMs + timeouts.lineReadWaitMs, turn.signal, getNowMs);
          }
          const step = handleEnd(turn, end);
          turn.heldTry.isHolding = false;
          yield* takeReady(turn);
          if (step === 'over') {
            if (end === 'ended') yield* nameHelpIfItAsks(turn);
            return;
          }
          if (turn.toolCall) await answerToolCall(turn, turn.toolCall);
        }
      } finally {
        finishTurn(turn);
        isTurnRunning = false;
      }
    },
    notePlayed(report) {
      const [, resumedFrom] = RESUMED_BEAT.exec(report.beatId) ?? [];
      const before = resumedFrom ? reports.get(resumedFrom as BeatId) : undefined;
      // A resume repeats the word it was cut on, so its count overlaps the first report by one.
      if (before) reports.set(before.beatId, { ...report, beatId: before.beatId, playedWords: Math.max(before.playedWords - 1, 0) + report.playedWords, firedCues: before.firedCues + report.firedCues });
      else reports.set(report.beatId, report);
    },
    noteCut(wordsSent) {
      cutWordsSent = new Map([...wordsSent].map(([beatId, words]) => [(RESUMED_BEAT.exec(beatId)?.[1] ?? beatId) as BeatId, words]));
    },
    // Built from what the model itself wrote, so a forged report can name only a mark that already exists.
    noteMarkNotDrawn(markId) {
      const mark = marksDrawn.get(markId);
      if (!mark) return;
      marksDrawn.delete(markId);
      pendingNotes.push({ mark_not_drawn: mark });
    },
    noteBoardProblem(report) {
      const note = boardProblems.getNewNote(report);
      if (note) pendingNotes.push({ board_problem: note });
    },
    getClosedReason: () => (hasToldClosed ? closedReason : null),
    noteSceneTurn({ topic, beats }) {
      settleLastTurn();
      lastBeats = beats;
      pendingNotes.push({ scene_on_screen: { topic, said: beats.map(getBeatText).join(' ') } });
    },
    noteCameBack() {
      safety?.showHelpIfRaised?.();
      lessonPlanner?.tellTitleAgain();
      memory = getMemoryOnComingBack(memory);
      isComeBackUnanswered = true;
      toldBoard = '';
      pendingNotes.push({ came_back: true });
    },
    noteWork(work) {
      if (work.way === 'write' && (!isStudentLineId(work.id) || memory.kinds.has(work.id))) return null;
      if (workCount >= MOST_WORK_IN_A_SESSION) return null;
      workCount += 1;
      const board = getBoardNow();
      const taskId = work.task;
      const context = getWorkContext(board, taskId);
      const hadTask = context.task !== null || (context.problemTex ?? null) !== null;
      const checked = checkWorkOnBoard(work, board);
      boardOperations.push({ kind: 'worked', atMs: boardOperations.length, action: { action: 'worked', work, ...checked } });
      onWorkNoted?.(work, checked);
      memory = getMemoryAfterWork(work, checked, memory);
      lessonPlanner?.noteWorkChecked(checked, work);
      const isNotBoardWork = work.way === 'leave' || (work.way === 'write' && (checked.reading?.kind === 'words' || checked.reading?.kind === 'mixed' || getPlainWish(work.text) === 'filler' || getPlainWish(work.text) === 'stop' || getPlainWish(work.text) === 'wait'));
      if (!isNotBoardWork) noteLeadStopEvent('workedOnBoard');
      workSinceLastTurn.push({ work, checked });
      hasNoddedSinceLastTurn ||= getNod(work, checked) !== null;
      const heldNotesOfWork = pendingNotes.filter((note) => 'student_work' in note);
      if (heldNotesOfWork.length >= MOST_NOTES_OF_WORK_HELD) pendingNotes = pendingNotes.filter((note) => note !== heldNotesOfWork[0]);
      pendingNotes.push({ student_work: getWorkNote(work, checked, context) });
      return { checked, hadTask };
    },
    noteWatcher(note) {
      if (note.why.includes('needsAPerson')) {
        didDraftRaiseCrisis = leadStop !== 'crisis';
        noteLeadStopEvent('crisis');
      }
      draftToRead = note.unsent_draft ?? null;
      pendingNotes.push({ watcher: note });
    },
    canLead: () => hasHadAReply && leadStop === 'none' && linesBeingRead === 0 && closedReason === null && !isLessonOver(),
    isLeadStopped: () => leadStop === 'held' || leadStop === 'paused' || leadStop === 'crisis' || linesBeingRead > 0,
    isPaceSlow: () => isPaceSlowNow,
    holdLeads() {
      noteLeadStopEvent('hold');
      tellLeadStopped();
    },
    noteQuietLine(words) {
      const wish = getPlainWish(words) ?? (isNod(words) ? 'filler' : null);
      const stopBefore = leadStop;
      if (wish) noteWish(wish, words);
      if (leadStop === stopBefore) return;
      if (leadStop === 'none') tellReadSettled();
      else tellLeadStopped();
    },
    onLeadStopped: (listener) => void leadStoppedListeners.push(listener),
    onReadSettled: (listener) => void readSettledListeners.push(listener),
    hasLessonLeft,
    noteLead(kind) {
      workedForLead = kind === 'taskLeft' ? getWorkedOpenProblem() : null;
      if (kind === 'taskLeft' || kind === 'taskTried') lessonPlanner?.moveToNextStep();
    },
    getBoard() {
      const state = getBoardNow();
      return { state, openTask: getOpenTaskOnBoard(state)?.id ?? null };
    },
  };
}

