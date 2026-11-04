import { type BoardOperation, type BoardState, getBoardAt, getLogOperations } from '@astra/board';
import { getBeatText, getSpokenWords, parseSessionEvent, type SessionEvent } from '@astra/contracts';
import { getKeyMoments } from './keyMoments';

/** Holds the last words on screen for a moment before a replay ends. */
const LAST_WORDS_HOLD_MS = 1500;
const PAST_LINES_SHOWN = 2;

export interface SpokenWord {
  text: string;
  atMs: number;
}

/** One beat as the student heard it, on the replay's own time. */
export interface SpokenBeat {
  key: string;
  /** A new run counts its turns again, so this names the run too. */
  turnKey: string;
  atMs: number;
  endMs: number;
  words: readonly SpokenWord[];
}

interface ReplayRun {
  startsAtMs: number;
  endsAtMs: number;
  operations: BoardOperation[];
}

export interface StudentLineAt {
  atMs: number;
  text: string;
}

export interface ReplayLesson {
  durationMs: number;
  runs: readonly ReplayRun[];
  beats: readonly SpokenBeat[];
  studentLines: readonly StudentLineAt[];
  /** Moments worth a mark on the timeline, in ms. */
  moments: readonly number[];
}

export interface CaptionAt {
  past: readonly string[];
  heard: readonly string[];
  coming: readonly string[];
  isSpeaking: boolean;
}

function readRunLog(events: readonly unknown[]): SessionEvent[] {
  return events.flatMap((event) => {
    const parsed = parseSessionEvent(event);
    return parsed.ok ? [parsed.value] : [];
  });
}

function getLogEndMs(log: readonly SessionEvent[], operations: readonly BoardOperation[]): number {
  const lastOperationMs = operations.at(-1)?.atMs ?? 0;
  const lastBeatMs = Math.max(0, ...log.map((event) => (event.kind === 'beatPlayed' ? event.atMs + event.durationMs : event.atMs)));
  return Math.max(lastOperationMs, lastBeatMs);
}

function getSpokenBeats(log: readonly SessionEvent[], startsAtMs: number): SpokenBeat[] {
  return log.flatMap((event) => {
    if (event.kind !== 'beatPlayed' || event.playedWords === 0) return [];
    const atMs = startsAtMs + event.atMs;
    const words = getSpokenWords(getBeatText(event.beat)).slice(0, event.playedWords).map((text, index) => ({ text, atMs: atMs + (event.wordStartsMs[index] ?? event.wordStartsMs.at(-1) ?? 0) }));
    return [{ key: `${startsAtMs}/${event.seq}`, turnKey: `${startsAtMs}/${event.turnId}`, atMs, endMs: atMs + event.durationMs, words }];
  });
}

const getStudentLines = (log: readonly SessionEvent[], startsAtMs: number): StudentLineAt[] => log.flatMap((event) => (event.kind === 'studentSpoke' && !event.isReaction ? [{ atMs: startsAtMs + event.atMs, text: event.text }] : []));

const byTime = <Timed extends { atMs: number }>(first: Timed, second: Timed) => first.atMs - second.atMs;

// Each tutor kept its own clock and started on a clear board, so a lesson plays its runs one after another and skips the time between them. Anything the parser refuses is left out, so one bad row cannot take the lesson with it.
export function readReplayLesson(savedRuns: readonly { events: readonly unknown[] }[]): ReplayLesson {
  const lesson = { durationMs: 0, runs: [] as ReplayRun[], beats: [] as SpokenBeat[], studentLines: [] as StudentLineAt[], moments: [] as number[] };
  for (const { events } of savedRuns) {
    const log = readRunLog(events);
    if (log.length === 0) continue;
    const startsAtMs = lesson.durationMs;
    const operations = getLogOperations(log);
    const endsAtMs = startsAtMs + getLogEndMs(log, operations);
    lesson.runs.push({ startsAtMs, endsAtMs, operations });
    lesson.beats.push(...getSpokenBeats(log, startsAtMs));
    lesson.studentLines.push(...getStudentLines(log, startsAtMs));
    lesson.moments.push(...getKeyMoments(operations).map((moment) => startsAtMs + moment));
    lesson.durationMs = endsAtMs;
  }
  lesson.beats.sort(byTime);
  lesson.studentLines.sort(byTime);
  if (lesson.runs.length > 0) lesson.durationMs += LAST_WORDS_HOLD_MS;
  return lesson;
}

/** The board as it stood at this moment of the lesson, by the same reducer the live board reads. */
export function getReplayBoard({ runs }: ReplayLesson, atMs: number): { board: BoardState; atMs: number } {
  const run = runs.filter(({ startsAtMs }) => startsAtMs <= atMs).at(-1) ?? runs[0];
  if (!run) return { board: getBoardAt([], 0), atMs: 0 };
  const runAtMs = atMs - run.startsAtMs;
  return { board: getBoardAt(run.operations, runAtMs), atMs: runAtMs };
}

export function getReplayCaption({ beats }: ReplayLesson, atMs: number): CaptionAt {
  const started = beats.filter((beat) => beat.atMs <= atMs);
  const turnKey = started.at(-1)?.turnKey;
  if (!turnKey) return { past: [], heard: [], coming: [], isSpeaking: false };
  const thisTurn = beats.filter((beat) => beat.turnKey === turnKey);
  const words = thisTurn.flatMap((beat) => beat.words);
  const earlierTurns = started.filter((beat) => beat.turnKey !== turnKey);
  const lastWords = [...new Set(earlierTurns.map((beat) => beat.turnKey))].slice(-PAST_LINES_SHOWN).map((earlier) => earlierTurns.filter((beat) => beat.turnKey === earlier).flatMap((beat) => beat.words.map((word) => word.text)).join(' '));
  return {
    past: lastWords,
    heard: words.filter((word) => word.atMs <= atMs).map((word) => word.text),
    coming: words.filter((word) => word.atMs > atMs).map((word) => word.text),
    isSpeaking: thisTurn.some((beat) => beat.atMs <= atMs && atMs < beat.endMs),
  };
}

/** What the student last said or typed, as text. Their voice was never kept. */
export function getReplayStudentLine({ studentLines }: ReplayLesson, atMs: number): string | null {
  return studentLines.filter((line) => line.atMs <= atMs).at(-1)?.text ?? null;
}

/** The beat being spoken at this moment and the word it has reached, for the device's voice to follow. */
export function getSpokenBeatAt({ beats }: ReplayLesson, atMs: number): { beat: SpokenBeat; word: number } | null {
  const beat = beats.find((candidate) => candidate.atMs <= atMs && atMs < candidate.endMs);
  if (!beat) return null;
  const next = beat.words.findIndex((word) => word.atMs > atMs);
  return { beat, word: Math.max(0, (next < 0 ? beat.words.length : next) - 1) };
}
