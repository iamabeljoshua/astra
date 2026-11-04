import { type Beat, type BeatId, clipTypedText, type ElementId, getBeatText, getCues, getPlayedCues, getSpokenWords, isStudentLineId, parseBeat, parseWrittenBeat, type SceneCommand, type StudentWork, type TutorClosedReason, TYPED_TEXT_MAX_CHARACTERS } from '@astra/contracts';
import { type BoardOperation, type BoardState, type CheckedWork, checkWorkOnBoard, cleanStudentText as cleanLine, getBoardAt, getNod, getOpenTaskOnBoard, getWorkContext } from '@astra/board/shared';
import { type FindSource, type ModelEvent, ModelRejectedError, type ModelUsage, type TutorModelAdapter, type TutorModelRequest, type TutorTurn } from '../providers/types.ts';
import { getProblemNote, getTeachFirstNote, type LessonPlanner } from '../lesson-plan/lesson-planner.ts';
import { createAttemptTracker } from './attempts.ts';
import { BeatTextReader, type WrittenBeatParts } from './beat-text-reader.ts';
import { type BoardMemory, checkAgainstBoard, EMPTY_BOARD, getClaimProblem, getMemoryAfter, getMemoryAfterAnswering, getMemoryAfterWork, getMemoryOnComingBack, getMemoryOnNewTurn, getPictureProblem, getWordsProblem } from './board-memory.ts';
import type { MemoryNote } from '../learner-record/memory-note.ts';
import { TUTOR_PROMPT, type TutorPrompt } from './prompt.ts';
import { createLinePicker, type SpokenLineUse } from './spoken-lines.ts';
import { runTool, type ToolResult } from './tools/run-tool.ts';
import type { ToolCall } from './tools/tool-call.ts';
import { getWorkNote } from './watcher/work-note.ts';

export interface TutorRequest {
  text: string;
  /** How `text` starts, when it repeats the words of a request whose reply was cut. */
  carried?: string;
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
}

export const TUTOR_TIMEOUTS = {
  /** First text stayed under 1.9 s at p95 in the evaluation, so this fires only on a slow turn. */
  stillWorkingMs: 3000,
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
};

export type TutorTimeouts = typeof TUTOR_TIMEOUTS;

export type TraceNote = (name: string, fields?: Record<string, unknown>) => void;

export interface TurnSummary {
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
  /** Prepares a lesson plan beside the replies, which a reply never waits for. */
  lessonPlanner?: LessonPlanner;
  /** Another version of the prompt, so an evaluation can run the same questions on it, or a session with scenes can name them. */
  prompt?: TutorPrompt;
  findSource?: FindSource;
  onAskScene?(topic: string): void;
  onSafetyReply?(): void;
}

type TurnStep = 'over' | 'retry';

type AttemptEnd = 'ended' | 'noWords' | 'aborted' | 'stalledBeforeText' | 'stalledInText' | 'failed' | 'rejected' | 'wrongMath' | 'wrongWords' | 'refused' | 'toolCall' | 'heldQuestion';

interface TurnWork {
  sceneAside?: 'due' | 'moved';
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
  hasSaidStillWorking: boolean;
  wrongMath: string | null;
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
}

const RESUMED_BEAT = /^(.+?)(?:-r\d+(?:-rest)?)+$/;
const MOST_NOTES_OF_WORK_HELD = 20;
const MOST_WORK_IN_A_SESSION = 2000;
const WAIT_STEP_MS = 5;
const MAX_ATTEMPTS = 2;
/** Each one costs a new request, about 2 s of quiet, and a search 5.5 to 8.7 s, so more than this in one reply would sound like the tutor has wandered off. */
const MOST_TOOL_CALLS_A_TURN = 3;
/** Drawing these shows a student the step, and a ring or a pointer does not. */
const SHOWING_KINDS: ReadonlySet<SceneCommand['kind']> = new Set(['writeMath', 'transformMath', 'text', 'simulate']);
/** Varied, because a pause of one fixed length turns into a tic. The voice adds about 400 ms to each. */
const BREATHS_MS = [300, 450, 350];
/** A repeated opening of a few words is dropped only at the start of a retry, where it sounds like starting over, and a longer repeat anywhere. */
const FEWEST_WORDS_IN_A_REPEAT = 4;
const COMPACT_AT_TOKENS = 60_000;
const TURNS_KEPT_AFTER_COMPACTING = 8;
const CHARACTERS_PER_TOKEN = 3.2;
const NAMES_HELP = /\b(?:adult|emergency)\b/i;

/** What the model is told after a safety check stops a student's message, built by code, so it holds none of what was refused. */
const DECLINED_NOTE = {
  declined: "A safety check stopped an earlier message of the student's, so you cannot see that one. It may have been serious. The message just above this note is newer, you can read it, and it comes first: if it says anyone is hurting them or that they are in danger, follow your safety rules for it. The app has already told them to tell an adult they trust or call their local emergency number. Otherwise, before you teach on, ask once, gently, whether they are safe and have an adult to talk to. Do not guess what the earlier message said, do not ask them to repeat it, and never say you cannot see a message.",
};
/** A frozen picture has no place behind a safety reply, so it goes small, with no words. */
const SCENE_ASIDE = { kind: 'boardMode', mode: 'handsOn' } as const;
const SKIPPED_NOTE = { skipped: "An automatic check stopped an earlier message of the student's, and the app told them it could not go into that. It is not about their safety. Teach on, and do not ask them to repeat it." };
const CLIPPED_NOTE = { clipped: 'The student wrote more than you can see, and this is only the first part. Say so in a few words, and answer what you can.' };
/** These categories cannot be about the student's own safety. The list of categories is open, so one it does not name counts as possibly serious. */
const PLAIN_REFUSALS: ReadonlySet<string> = new Set(['cyber', 'frontier_llm', 'reasoning_extraction']);
const ASKED_HOW_IT_WORKED = 'reasoning_extraction';
/** A refused message in a plain category can still say this, as "my dad hits me, how do i hack his phone" does, and the model never saw it. */
const MAY_BE_ABOUT_SAFETY = /\b(?:hit|hits|hitting|hurt|hurts|hurting|beat|beats|beating|abuse|abused|abusing|touch|touches|touched|rape|raped|kill|killing|suicide|die|dying|alive|harm|harming|cut myself|cutting myself|scared|afraid|unsafe|danger|threaten|threatens|threatened)\b/i;
/** Asking how a tutor worked something out is core teaching, and the check can read it as asking for hidden reasoning. The retry keeps the student's own words, because replacing them could hide a disclosure in the same message. Measured at 0 of 8 refused against 8 of 8 without. */
const AFTER_A_TOOL = 'You have the result now. Say it in plain words in this reply, and do not make this call again.';
const ASKED_HOW_NOTE = { asked_how: 'They are asking you to go through the subject step by step, as teaching. Their words may mention your reasoning. Answer anything else they said first.' };

/** Strips control and invisible characters, which can hide text from a reader. */
export function cleanStudentText(text: string): string {
  return clipTypedText(cleanLine(text));
}

const isPlainRefusal = ({ refusalCategory, studentText }: { refusalCategory: string | null; studentText: string }) => refusalCategory !== null && PLAIN_REFUSALS.has(refusalCategory) && !MAY_BE_ABOUT_SAFETY.test(studentText);

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

const toProfileNote = ({ level, interests, goal, cardTitle }: StudentProfile) => ({ student: { level, interests, goal, ...(cardTitle ? { card_title: cardTitle } : {}) } });

export function createTutorBrain({ model, profile = null, loadProfile, memory: knownMemory = null, loadMemory, onWorkNoted, timeouts: chosenTimeouts, trace = () => {}, onTurnEnd, onCompacted, compactAtTokens = COMPACT_AT_TOKENS, getSpendLimit = () => null, getNowMs = () => performance.now(), prompt = TUTOR_PROMPT, findSource, lessonPlanner, onAskScene, onSafetyReply }: TutorBrainOptions): Required<TutorBrain> {
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
  const getStandingNotes = () => [profileNote, memoryNote].filter((note) => note !== null);
  let isComeBackUnanswered = false;
  let pendingNotes: Record<string, unknown>[] = getStandingNotes();
  let lastBeats: readonly Beat[] = [];
  let lastRefused: readonly string[] = [];
  /** A refused reply's words must not go back to the model, even when the student cut across them. */
  let hidesLastWords = false;
  let closedReason: TutorClosedReason | null = null;
  let hasToldClosed = false;
  let rejectionsInARow = 0;
  const marksDrawn = new Map<string, { target: string; tex?: string }>();
  let cutWordsSent: ReadonlyMap<BeatId, number> | null = null;
  let turnCount = 0;
  let promptTokens = 0;
  let isCompacting = false;
  let isTurnRunning = false;
  let lastAskedText: string | null = null;
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

  const noteSafetyReply = (turn: TurnWork, board: { kinds: ReadonlyMap<string, string> }) => {
    onSafetyReply?.();
    if ([...board.kinds.values()].includes('richScene')) turn.sceneAside = 'due';
  };

  const takesSceneAside = (turn: TurnWork) => {
    const moves = turn.sceneAside === 'due';
    if (moves) turn.sceneAside = 'moved';
    return moves;
  };

  const startTurn = (studentText: string, signal: AbortSignal): TurnWork => {
    settleLastTurn(studentText);
    turnCount += 1;
    memory = getMemoryOnNewTurn(memory, studentText);
    if (memory.hasComeBack && !isComeBackUnanswered) memory = { ...memory, hasComeBack: false };
    isComeBackUnanswered = false;
    const nodded = hasNoddedSinceLastTurn;
    hasNoddedSinceLastTurn = false;
    let readerMemory = memory;
    const shapeNote = lessonPlanner && !memory.openTask && !MAY_BE_ABOUT_SAFETY.test(studentText) ? (getProblemNote(studentText) ?? getTeachFirstNote(studentText, turnCount === 1)) : null;
    const turnNotes = [attempts.startTurn(studentText), prompt.turnNote, shapeNote].filter((note) => note !== null);
    const turn: TurnWork = {
      id: turnCount,
      studentText,
      signal,
      startedAtMs: getNowMs(),
      reader: new BeatTextReader({
        board: memory.kinds,
        ...(onAskScene ? { onAskScene } : {}),
        onSafetyReply: () => noteSafetyReply(turn, readerMemory),
        checkCommand: (command) => checkAgainstBoard(command, readerMemory),
        onToolCall(call) {
          turn.toolCall = call;
        },
        onAttemptReport(report) {
          attempts.noteReport(report);
          trace('attemptReported', { report });
        },
        onCommandKept(command) {
          readerMemory = getMemoryAfter(command, readerMemory);
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
        onWrongMath(problem) {
          turn.wrongMath = problem;
          trace('mathRefused', { problem });
        },
        // Only a first attempt, because help for a student in crisis must get out, even in imperfect words.
        checkWords: (text) => (onAskScene ? getPictureProblem(text, readerMemory) : null) ?? getWordsProblem(text, readerMemory, turn.beats.length === 0) ?? (turn.attempts < MAX_ATTEMPTS ? getClaimProblem(text) : null),
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
          // The lesson rules teach the model to write a teach command, and one beside the help would bring the picture back over it.
          const kept = turn.sceneAside ? { ...written, script: written.script.filter((part) => typeof part === 'string' || part.kind !== 'boardMode' || part.mode !== 'teach') } : written;
          const parts = takesSceneAside(turn) ? { ...kept, script: [SCENE_ASIDE, ...kept.script] } : kept;
          // A gentle "do you have someone with you?" has no safety words, and it must still reach a student who may be in danger.
          if (parts.expectsReply && !turn.reader.isSafetyReply && !MAY_BE_ABOUT_SAFETY.test(studentText) && !turn.hasShownAStep && attempts.isAtDeadEnd()) {
            turn.isQuestionHeld = true;
            return;
          }
          const beat = getWrittenBeat(turn.startsAfterNod && turn.beats.length === 0 ? withoutOpeningNod(parts) : parts, `t${turnCount}-b${turn.beats.length}`, turn.refused);
          if (!beat) return;
          turn.hasModelWords = true;
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
      hasSaidStillWorking: false,
      wrongMath: null,
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
    };
    return turn;
  };

  const getNextBreathMs = () => BREATHS_MS[breathsTaken++ % BREATHS_MS.length] as number;

  const addBeat = (turn: TurnWork, beat: TutorBeat) => {
    turn.firstBeatMs ??= getNowMs() - turn.startedAtMs;
    turn.beats.push(beat);
    turn.ready.push(beat);
  };

  const sayWords = (turn: TurnWork, words: string) => {
    const parsed = parseBeat({ id: `t${turn.id}-line${turn.beats.length}`, script: takesSceneAside(turn) ? [SCENE_ASIDE, words] : [words], expectsReply: /\?$/.test(words) });
    if (parsed.ok) addBeat(turn, parsed.value);
  };

  const sayLine = (turn: TurnWork, use: SpokenLineUse) => {
    trace('lineSpoken', { use });
    sayWords(turn, pickLine(use));
  };

  const getRequest = (turn: TurnWork): TutorModelRequest => ({
    system: prompt.system,
    turns: [...turns, { role: 'user', text: turn.studentText }, ...turn.notes.map((text) => ({ role: 'system' as const, text }))],
  });

  const getDeadlineMs = (turn: TurnWork, attemptStartedAtMs: number, lastEventAtMs: number): number => {
    if (turn.reader.isTurnOver) return lastEventAtMs + timeouts.finishGraceMs;
    if (turn.hasAttemptText) return lastEventAtMs + timeouts.betweenTextMs;
    const hardMs = attemptStartedAtMs + timeouts.firstTextMs;
    if (turn.hasSaidStillWorking) return hardMs;
    // A retry starts its own wait, or the time the first attempt took would fire a filler straight after its line.
    const softStartMs = turn.attempts > 1 ? attemptStartedAtMs : turn.startedAtMs;
    return Math.min(hardMs, softStartMs + (turn.isCheckingMath ? timeouts.checkingMathMs : timeouts.stillWorkingMs));
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
      if (turn.wrongWords !== null) return 'wrongWords';
      if (turn.toolCall !== null) return 'toolCall';
      if (turn.isQuestionHeld) return 'heldQuestion';
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
        const result = await waitUntil(pending, getDeadlineMs(turn, attemptStartedAtMs, lastEventAtMs), turn.signal, getNowMs);
        if (result === 'aborted') return endAs('aborted');
        if (result === 'deadline') {
          if (turn.reader.isTurnOver) return endAs('ended');
          if (turn.hasAttemptText) return endAs('stalledInText');
          if (turn.hasSaidStillWorking || getNowMs() - attemptStartedAtMs >= timeouts.firstTextMs) return endAs('stalledBeforeText');
          turn.hasSaidStillWorking = true;
          sayLine(turn, turn.isCheckingMath ? 'checkingMath' : 'stillWorking');
          yield* takeReady(turn);
          continue;
        }
        if (result.done) return endAs('ended');
        const eventEnd = readEvent(turn, result.value);
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
    const wasCutBeforeReport = !turn.attemptUsage && (end === 'aborted' || end === 'stalledBeforeText');
    if (!turn.attemptUsage && !wasCutBeforeReport) return;
    const reported = turn.attemptUsage ?? getEstimatedRequestUsage(turn);
    const part = turn.isAttemptUsageFinal ? reported : { ...reported, outputTokens: Math.ceil(turn.raw.length / CHARACTERS_PER_TOKEN) };
    turn.isUsageEstimated ||= !turn.isAttemptUsageFinal;
    turn.usage = addUsage(turn.usage, part);
  };

  function* takeReady(turn: TurnWork): Generator<Beat> {
    while (turn.ready.length > 0 && !turn.signal.aborted) yield turn.ready.shift() as Beat;
  }

  const getWordsSaid = (turn: TurnWork) => turn.beats.map((beat) => getBeatText(beat)).join(' ');

  const noteCorrection = (turn: TurnWork, problem: string) => {
    turn.notes.push(JSON.stringify({ correction: { already_said: getWordsSaid(turn), problem } }));
    turn.raw = '';
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
    // The student never saw the false line or heard its words, so nothing needs correcting aloud, and a quiet retry keeps the exchange from sounding confused.
    turn.isCheckingMath = true;
    noteCorrection(turn, `What you were about to put on the board is false: ${problem}. Code stopped it, and the student did not hear the words after it. Write what is true and carry straight on, and never tick a false line. If you did not mean a line as an equal step, write it with the claim that says what it is instead.`);
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
    } else if (turn.hasSaidStillWorking) {
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
    if (!turn.reader.isSafetyReply || NAMES_HELP.test(`${getWordsSaid(turn)} ${turn.raw}`)) return;
    const help = ` ${pickLine('safetyHelp')}`;
    trace('helpAdded');
    turn.raw += help;
    turn.reader.push(help);
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
    addHelpIfMissing(turn);
    turn.reader.finish();
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
    return 'over';
  };

  // Anthropic's page on refusals says to discard partial output, so what was not yet spoken goes unsaid, and none of it stays in history.
  const handleRefusal = (turn: TurnWork, canRetry: boolean): TurnStep => {
    const wasAskedHow = turn.refusalCategory === ASKED_HOW_IT_WORKED;
    turn.reader.dropAttempt();
    turn.raw = '';
    if (wasAskedHow && canRetry) {
      turn.notes.push(JSON.stringify(ASKED_HOW_NOTE));
      if (turn.hasModelWords) noteCorrection(turn, 'Carry on from where you stopped.');
      return 'retry';
    }
    if (!isPlainRefusal(turn)) {
      noteSafetyReply(turn, memory);
      sayLine(turn, turn.hasModelWords ? 'refusedAfterWords' : 'refused');
    } else if (wasAskedHow) sayLine(turn, 'askedHowDeclined');
    else sayLine(turn, turn.hasModelWords ? 'refusedPlainAfterWords' : 'refusedPlain');
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
    switch (end) {
      case 'aborted':
      case 'noWords':
        return 'over';
      case 'ended':
        return finishAnswer(turn, canRetry);
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
    if (isCompacting || promptTokens < compactAtTokens || turns.length <= TURNS_KEPT_AFTER_COMPACTING) return;
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
    if (wasRefused) {
      const note = isPlainRefusal(turn) ? SKIPPED_NOTE : DECLINED_NOTE;
      if (!pendingNotes.includes(note)) pendingNotes.push(note);
    }
    if (turn.endedAs === 'ended') rejectionsInARow = 0;
    attempts.endTurn({ askedAQuestion: turn.beats.at(-1)?.expectsReply ?? false, wasCut: turn.endedAs === 'aborted' });
    lastBeats = turn.beats;
    lastRefused = wasRefused ? [] : turn.refused;
    hidesLastWords = wasRefused;
    lessonPlanner?.noteReplyEnded({ wasSafety: turn.reader.isSafetyReply });
    onTurnEnd?.({
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
      pendingNotes.push(profileNote);
    },
    (error: unknown) => trace('profileFailed', { problem: String(error) }),
  );

  // Failing to read it leaves no note at all, and the prompt treats that as knowing nothing of earlier sessions.
  const memoryLoading = loadMemory?.().then(
    (loaded) => {
      memoryNote = { ...loaded };
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
    async *reply({ text, carried = '' }, signal) {
      // The last turn holds the carried words, or a safety check chose to drop them, so only what is new goes in. If that turn never began, nothing holds them, and they all go in. The rule keeps only the newest words it owes, with their spacing evened out.
      const isCarriedHere = carried !== '' && toSpacedWords(lastAskedText ?? '').endsWith(toSpacedWords(carried));
      lastAskedText = text;
      const studentText = cleanStudentText(isCarriedHere ? text.slice(carried.length) : text);
      if (studentText === '') {
        const said = parseBeat({ id: `t${turnCount}-unheard`, script: [pickLine('notHeard')], expectsReply: true });
        if (said.ok) yield said.value;
        return;
      }
      // Skipped on words this list knows. Vaguer words reach the planner, whose `stay` and `getTrustedMove` hold them.
      // A student who cuts a card's opening scene speaks before the tutor has heard the card's title, so those are their own words.
      if (!MAY_BE_ABOUT_SAFETY.test(studentText)) lessonPlanner?.noteStudentWords({ words: studentText, isOpening: turnCount === 0 && cutWordsSent === null, tutorSaid: lastBeats.map(getBeatText).join(' ') });
      await waitForLastTurn();
      if (profileLoading || memoryLoading) await Promise.race([Promise.all([profileLoading, memoryLoading]), delay(timeouts.profileWaitMs)]);
      isTurnRunning = true;
      const turn = startTurn(studentText, signal);
      if (Array.from(studentText).length >= TYPED_TEXT_MAX_CHARACTERS) turn.notes.push(JSON.stringify(CLIPPED_NOTE));
      try {
        closeIfSpent(turn);
        if (closedReason !== null) {
          turn.endedAs = 'ended';
          yield* takeReady(turn);
          return;
        }
        for (;;) {
          const end = yield* runAttempt(turn);
          const step = handleEnd(turn, end);
          yield* takeReady(turn);
          if (step === 'over') return;
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
    getClosedReason: () => (hasToldClosed ? closedReason : null),
    noteSceneTurn({ topic, beats }) {
      settleLastTurn();
      lastBeats = beats;
      pendingNotes.push({ scene_on_screen: { topic, said: beats.map(getBeatText).join(' ') } });
    },
    noteCameBack() {
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
      workSinceLastTurn.push({ work, checked });
      hasNoddedSinceLastTurn ||= getNod(work, checked) !== null;
      const heldNotesOfWork = pendingNotes.filter((note) => 'student_work' in note);
      if (heldNotesOfWork.length >= MOST_NOTES_OF_WORK_HELD) pendingNotes = pendingNotes.filter((note) => note !== heldNotesOfWork[0]);
      pendingNotes.push({ student_work: getWorkNote(work, checked, context) });
      return { checked, hadTask };
    },
    noteWatcher(note) {
      pendingNotes.push({ watcher: note });
    },
    getBoard() {
      const state = getBoardNow();
      return { state, openTask: getOpenTaskOnBoard(state)?.id ?? null };
    },
  };
}

