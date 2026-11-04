import { type Beat, type BeatId, getBeatText, getCues, getPlayedCues, getSpokenWords, parseBeat, parseWrittenBeat } from '@astra/contracts';
import type { ModelEvent, ModelUsage, TutorModelAdapter, TutorModelRequest, TutorTurn } from '../providers/types.ts';
import { BeatTextReader, type WrittenBeatParts } from './beat-text-reader.ts';
import { type BoardMemory, checkAgainstBoard, EMPTY_BOARD, getMemoryAfter } from './board-memory.ts';
import { TUTOR_SYSTEM } from './prompt.ts';
import { createLinePicker, type SpokenLineUse } from './spoken-lines.ts';

export interface TutorRequest {
  text: string;
}

export interface BeatReport {
  beatId: BeatId;
  playedWords: number;
  firedCues: number;
}

export interface TutorBrain {
  reply(request: TutorRequest, signal: AbortSignal): AsyncIterable<Beat>;
  notePlayed?(report: BeatReport): void;
  noteCut?(wordsSent: ReadonlyMap<BeatId, number>): void;
}

export interface StudentProfile {
  level: string;
  interests: readonly string[];
  goal: string;
}

export const TUTOR_TIMEOUTS = {
  /** First text stayed under 1.9 s at p95 in the evaluation, so this fires only on a slow turn. */
  stillWorkingMs: 3000,
  /** Sonnet stalled for 9 to 10 s in the speed test, and a new request's first text is under 2 s at p95. */
  firstTextMs: 5000,
  betweenTextMs: 4000,
  /** A model told to stop at a question usually ends at once, and this keeps its real token count. */
  finishGraceMs: 300,
  /** A short wait for a cut turn's report, so a lost one cannot hold up the reply. */
  reportWaitMs: 150,
};

export type TutorTimeouts = typeof TUTOR_TIMEOUTS;

export type TraceNote = (name: string, fields?: Record<string, unknown>) => void;

export interface TurnSummary {
  studentText: string;
  spokenText: string;
  beats: readonly Beat[];
  refused: readonly string[];
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
  timeouts?: TutorTimeouts;
  trace?: TraceNote;
  onTurnEnd?(summary: TurnSummary): void;
  onCompacted?(summary: { costUsd: number; turnsBefore: number; turnsAfter: number }): void;
  compactAtTokens?: number;
  isOverBudget?(): boolean;
  getNowMs?(): number;
}

type TurnStep = 'over' | 'retry';

type AttemptEnd = 'ended' | 'aborted' | 'stalledBeforeText' | 'stalledInText' | 'failed' | 'wrongMath' | 'refused';

interface TurnWork {
  id: number;
  studentText: string;
  signal: AbortSignal;
  startedAtMs: number;
  reader: BeatTextReader;
  beats: Beat[];
  ready: Beat[];
  refused: string[];
  notes: string[];
  raw: string;
  hasModelWords: boolean;
  hasAttemptText: boolean;
  hasSaidStillWorking: boolean;
  wrongMath: string | null;
  refusalCategory: string | null;
  firstTextMs: number | null;
  firstBeatMs: number | null;
  attempts: number;
  usage: ModelUsage | null;
  attemptUsage: ModelUsage | null;
  isAttemptUsageFinal: boolean;
  isUsageEstimated: boolean;
  costUsd: number;
  wasRefused: boolean;
  endedAs: AttemptEnd;
}

const RESUMED_BEAT = /^(.+?)(?:-r\d+(?:-rest)?)+$/;
const WAIT_STEP_MS = 5;
const MAX_ATTEMPTS = 2;
const COMPACT_AT_TOKENS = 60_000;
const TURNS_KEPT_AFTER_COMPACTING = 8;
const CHARACTERS_PER_TOKEN = 3.2;
const LONGEST_STUDENT_TEXT = 2000;
const TOO_MANY_MARKS = /(\p{M}{4})\p{M}+/gu;
const NOT_STUDENT_TEXT = /\p{Cf}|\p{Co}|\p{Variation_Selector}|[^\P{Cc}\n\t]/gu;

/** Strips control and invisible characters, which can hide text from a reader. */
export function cleanStudentText(text: string): string {
  return text.replace(NOT_STUDENT_TEXT, '').replace(TOO_MANY_MARKS, '$1').trim().slice(0, LONGEST_STUDENT_TEXT);
}

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

export function createTutorBrain({ model, profile = null, timeouts = TUTOR_TIMEOUTS, trace = () => {}, onTurnEnd, onCompacted, compactAtTokens = COMPACT_AT_TOKENS, isOverBudget = () => false, getNowMs = () => performance.now() }: TutorBrainOptions): Required<TutorBrain> {
  const pickLine = createLinePicker();
  const profileNote = profile ? { student: { level: profile.level, interests: profile.interests, goal: profile.goal } } : null;
  const reports = new Map<BeatId, BeatReport>();
  let turns: TutorTurn[] = [];
  let memory: BoardMemory = EMPTY_BOARD;
  let toldBoard = '{}';
  let pendingNotes: Record<string, unknown>[] = profileNote ? [profileNote] : [];
  let lastBeats: readonly Beat[] = [];
  let lastRefused: readonly string[] = [];
  let cutWordsSent: ReadonlyMap<BeatId, number> | null = null;
  let turnCount = 0;
  let promptTokens = 0;
  let isCompacting = false;
  let isTurnRunning = false;

  // Board and heard words come from the browser's report, because the model may write past what the student saw.
  const settleLastTurn = () => {
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
    const note: Record<string, unknown> = {};
    if (missed.length > 0) note.cut = { heard: heard.join(' '), not_heard: missed.join(' ') };
    if (lastRefused.length > 0) note.refused = lastRefused;
    const board = JSON.stringify(Object.fromEntries([...memory.kinds].map(([id, kind]) => [id, memory.lines.get(id) ?? kind])));
    if (board !== toldBoard) note.board = JSON.parse(board);
    toldBoard = board;
    if (Object.keys(note).length > 0) pendingNotes.push(note);
    lastBeats = [];
    lastRefused = [];
    cutWordsSent = null;
    reports.clear();
  };

  const hasEveryReport = () => cutWordsSent === null || [...cutWordsSent.keys()].every((beatId) => reports.has(beatId));

  const waitForLastTurn = async () => {
    const deadlineMs = getNowMs() + timeouts.reportWaitMs;
    while ((isTurnRunning || !hasEveryReport()) && getNowMs() < deadlineMs) await delay(WAIT_STEP_MS);
  };

  const startTurn = (studentText: string, signal: AbortSignal): TurnWork => {
    settleLastTurn();
    turnCount += 1;
    let readerMemory = memory;
    const turn: TurnWork = {
      id: turnCount,
      studentText,
      signal,
      startedAtMs: getNowMs(),
      reader: new BeatTextReader({
        board: memory.kinds,
        checkCommand: (command) => checkAgainstBoard(command, readerMemory),
        onCommandKept(command) {
          readerMemory = getMemoryAfter(command, readerMemory);
        },
        onBadCommand(problem) {
          turn.refused.push(problem);
          trace('commandRefused', { problem });
        },
        onWrongMath(problem) {
          turn.wrongMath = problem;
          trace('mathRefused', { problem });
        },
        onBeatEnd(parts) {
          const beat = getWrittenBeat(parts, `t${turnCount}-b${turn.beats.length}`, turn.refused);
          if (beat) addBeat(turn, beat);
        },
      }),
      beats: [],
      ready: [],
      refused: [],
      notes: pendingNotes.map((note) => JSON.stringify(note)),
      raw: '',
      hasModelWords: false,
      hasAttemptText: false,
      hasSaidStillWorking: false,
      wrongMath: null,
      refusalCategory: null,
      firstTextMs: null,
      firstBeatMs: null,
      attempts: 0,
      usage: null,
      attemptUsage: null,
      isAttemptUsageFinal: false,
      isUsageEstimated: false,
      costUsd: 0,
      wasRefused: false,
      endedAs: 'ended',
    };
    return turn;
  };

  const addBeat = (turn: TurnWork, beat: Beat) => {
    turn.firstBeatMs ??= getNowMs() - turn.startedAtMs;
    turn.beats.push(beat);
    turn.ready.push(beat);
  };

  const sayLine = (turn: TurnWork, use: SpokenLineUse) => {
    const line = pickLine(use);
    const parsed = parseBeat({ id: `t${turn.id}-line${turn.beats.length}`, script: [line], expectsReply: /\?$/.test(line) });
    trace('lineSpoken', { use });
    if (parsed.ok) addBeat(turn, parsed.value);
  };

  const getRequest = (turn: TurnWork): TutorModelRequest => ({
    system: TUTOR_SYSTEM,
    turns: [...turns, { role: 'user', text: turn.studentText }, ...turn.notes.map((text) => ({ role: 'system' as const, text }))],
  });

  const getDeadlineMs = (turn: TurnWork, attemptStartedAtMs: number, lastEventAtMs: number): number => {
    if (turn.reader.isTurnOver) return lastEventAtMs + timeouts.finishGraceMs;
    if (turn.hasAttemptText) return lastEventAtMs + timeouts.betweenTextMs;
    const hardMs = attemptStartedAtMs + timeouts.firstTextMs;
    return turn.hasSaidStillWorking ? hardMs : Math.min(hardMs, turn.startedAtMs + timeouts.stillWorkingMs);
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
      turn.hasModelWords = turn.hasModelWords || turn.reader.wordsThisTurn > 0;
      if (turn.wrongMath !== null) return 'wrongMath';
    }
    if (event.type === 'finished') {
      turn.attemptUsage = event.usage;
      turn.isAttemptUsageFinal = true;
      if (event.stopReason === 'refused') {
        turn.refusalCategory = event.refusalCategory;
        return 'refused';
      }
      return 'ended';
    }
    return null;
  };

  async function* runAttempt(turn: TurnWork): AsyncGenerator<Beat, AttemptEnd> {
    const attempt = new AbortController();
    turn.attempts += 1;
    turn.hasAttemptText = false;
    turn.attemptUsage = null;
    turn.isAttemptUsageFinal = false;
    const attemptStartedAtMs = getNowMs();
    let lastEventAtMs = attemptStartedAtMs;
    const events = model.stream(getRequest(turn), attempt.signal)[Symbol.asyncIterator]();
    let pending = events.next();
    try {
      for (;;) {
        const result = await waitUntil(pending, getDeadlineMs(turn, attemptStartedAtMs, lastEventAtMs), turn.signal, getNowMs);
        if (result === 'aborted') return 'aborted';
        if (result === 'deadline') {
          if (turn.reader.isTurnOver) return 'ended';
          if (turn.hasAttemptText) return 'stalledInText';
          if (turn.hasSaidStillWorking || getNowMs() - attemptStartedAtMs >= timeouts.firstTextMs) return 'stalledBeforeText';
          turn.hasSaidStillWorking = true;
          sayLine(turn, 'stillWorking');
          yield* takeReady(turn);
          continue;
        }
        if (result.done) return 'ended';
        lastEventAtMs = getNowMs();
        const end = readEvent(turn, result.value);
        yield* takeReady(turn);
        if (end) return end;
        pending = events.next();
      }
    } catch (error) {
      if (turn.signal.aborted) return 'aborted';
      trace('modelFailed', { problem: error instanceof Error ? error.message : String(error) });
      return turn.hasAttemptText ? 'stalledInText' : 'failed';
    } finally {
      attempt.abort();
      pending.catch(() => {});
      addAttemptUsage(turn);
    }
  }

  // A stream cut short never reports its output, so its size is estimated from the text that arrived.
  const addAttemptUsage = (turn: TurnWork) => {
    if (!turn.attemptUsage) return;
    const part = turn.isAttemptUsageFinal ? turn.attemptUsage : { ...turn.attemptUsage, outputTokens: Math.ceil(turn.raw.length / CHARACTERS_PER_TOKEN) };
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
      sayLine(turn, 'mathStillWrong');
      return 'over';
    }
    sayLine(turn, 'checkingMath');
    noteCorrection(turn, `The last line of math you wrote was false: ${problem}. It is not on the board. Say so in a few words and give the right step.`);
    return 'retry';
  };

  const handleStall = (turn: TurnWork, end: 'stalledBeforeText' | 'stalledInText' | 'failed', canRetry: boolean): TurnStep => {
    if (!canRetry) {
      sayLine(turn, 'couldNotReply');
      return 'over';
    }
    if (end === 'stalledInText') {
      sayLine(turn, 'lostThread');
      noteCorrection(turn, 'Your reply was cut off by a connection problem. Carry on from where you stopped.');
    } else if (turn.hasSaidStillWorking) {
      sayLine(turn, 'stillThere');
    }
    return 'retry';
  };

  const handleEnd = (turn: TurnWork, end: AttemptEnd): TurnStep => {
    const canRetry = turn.attempts < MAX_ATTEMPTS;
    turn.endedAs = end;
    switch (end) {
      case 'aborted':
        return 'over';
      case 'ended':
        turn.reader.finish();
        return 'over';
      case 'refused':
        turn.reader.closeAttempt();
        turn.wasRefused = !turn.hasModelWords;
        sayLine(turn, turn.hasModelWords ? 'refusedAfterWords' : 'refused');
        return 'over';
      case 'wrongMath':
        turn.reader.closeAttempt();
        return handleWrongMath(turn, canRetry);
      case 'stalledBeforeText':
      case 'stalledInText':
      case 'failed':
        turn.reader.closeAttempt();
        return handleStall(turn, end, canRetry);
    }
  };

  const getAcceptedRaw = (turn: TurnWork) => turn.raw.slice(0, turn.raw.length - turn.reader.textAfterTurn.length).trim();

  const startCompactingIfNeeded = () => {
    if (isCompacting || promptTokens < compactAtTokens || turns.length <= TURNS_KEPT_AFTER_COMPACTING) return;
    const keptFrom = turns.findIndex((turn, index) => index >= turns.length - TURNS_KEPT_AFTER_COMPACTING && turn.role === 'user');
    if (keptFrom <= 0) return;
    isCompacting = true;
    const compacted = turns.slice(0, keptFrom);
    const turnsBefore = turns.length;
    trace('compactionStarted', { promptTokens, turns: compacted.length });
    void model
      .compact({ system: TUTOR_SYSTEM, turns: compacted }, new AbortController().signal)
      .then((result) => {
        if (!result) return trace('compactionEmpty');
        turns = [{ role: 'summary', summary: result.summary }, ...turns.slice(keptFrom)];
        toldBoard = '{}';
        if (profileNote) pendingNotes.push(profileNote);
        onCompacted?.({ costUsd: model.getCostUsd(result.usage), turnsBefore, turnsAfter: turns.length });
      })
      // A failed summary leaves the history whole, and the next turn tries again.
      .catch((error: unknown) => trace('compactionFailed', { problem: String(error) }))
      .finally(() => {
        isCompacting = false;
      });
  };

  const finishTurn = (turn: TurnWork) => {
    turn.costUsd = turn.usage ? model.getCostUsd(turn.usage) : 0;
    const text = getAcceptedRaw(turn);
    if (text !== '') {
      turns.push({ role: 'user', text: turn.studentText }, ...turn.notes.map((note) => ({ role: 'system' as const, text: note })), { role: 'assistant', text });
      pendingNotes = [];
    } else if (!turn.wasRefused) {
      turns.push({ role: 'user', text: turn.studentText });
    }
    lastBeats = turn.beats;
    lastRefused = turn.refused;
    onTurnEnd?.({
      studentText: turn.studentText,
      spokenText: getWordsSaid(turn),
      beats: turn.beats,
      refused: turn.refused,
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

  return {
    async *reply({ text }, signal) {
      if (cleanStudentText(text) === '') return;
      await waitForLastTurn();
      isTurnRunning = true;
      const turn = startTurn(cleanStudentText(text), signal);
      try {
        if (isOverBudget()) {
          trace('overBudget');
          sayLine(turn, 'couldNotReply');
          yield* takeReady(turn);
          return;
        }
        for (;;) {
          const end = yield* runAttempt(turn);
          const step = handleEnd(turn, end);
          yield* takeReady(turn);
          if (step === 'over') return;
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
  };
}

