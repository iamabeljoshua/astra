import { type BeatEnding, type Cue, type FrozenFrame, getCues, type InkPoint, type SceneCommand, type SessionEvent, type SimulationParameter, type ElementId } from '@astra/contracts';

/** Only for a cue whose later word times are unknown: the live board and a replay read the same word times, so both land on the same guess. */
const ASSUMED_WORD_MS = 300;

/** Every change to the board, in session ms. The live board and a replay both reduce a list of these, so they cannot drift apart in how they apply it. */
export type BoardOperation =
  | { kind: 'beatStarted'; atMs: number }
  | { kind: 'command'; atMs: number; command: SceneCommand; overMs: number | null }
  | { kind: 'freeze'; atMs: number; frames: readonly FrozenFrame[] }
  | { kind: 'parameterSample'; atMs: number; target: ElementId; parameter: SimulationParameter; value: number }
  | { kind: 'inkStroke'; atMs: number; id: ElementId; points: readonly InkPoint[] }
  | { kind: 'inkErased'; atMs: number; target: ElementId }
  | { kind: 'rewound'; atMs: number; toMs: number };

/** What the board needs from one beat, whether it is still playing or already in the log. */
export interface PlayedBeatView {
  atMs: number;
  cues: readonly Cue[];
  wordStartsMs: readonly number[];
  firedCueMs: readonly number[];
  /** Null while the beat is still playing. */
  ending: BeatEnding | null;
  durationMs: number;
  frozen: readonly FrozenFrame[];
}

function getOverMs({ atWord, command }: Cue, wordStartsMs: readonly number[]): number | null {
  if (!('overWords' in command) || command.overWords === undefined) return null;
  const endWord = atWord + command.overWords;
  const startMs = wordStartsMs[atWord];
  const endMs = wordStartsMs[endWord];
  if (startMs !== undefined && endMs !== undefined) return endMs - startMs;
  const knownFrom = Math.max(atWord, Math.min(endWord, wordStartsMs.length - 1));
  const knownMs = startMs === undefined ? 0 : (wordStartsMs[knownFrom] ?? startMs) - startMs;
  return knownMs + (endWord - knownFrom) * ASSUMED_WORD_MS;
}

export function getBeatOperations(view: PlayedBeatView): BoardOperation[] {
  const fired = view.firedCueMs.map((firedMs, index): BoardOperation => {
    const cue = view.cues[index] as Cue;
    return { kind: 'command', atMs: view.atMs + firedMs, command: cue.command, overMs: getOverMs(cue, view.wordStartsMs) };
  });
  const isCut = view.ending !== null && view.ending !== 'finished';
  const freeze: BoardOperation[] = isCut ? [{ kind: 'freeze', atMs: view.atMs + view.durationMs, frames: view.frozen }] : [];
  return [{ kind: 'beatStarted', atMs: view.atMs }, ...fired, ...freeze];
}

function getRewoundToMs(log: readonly SessionEvent[], event: SessionEvent & { kind: 'studentActed' }): number {
  if (event.action.action !== 'rewound') return event.atMs;
  const { turnId, toBeat } = event.action;
  const rewoundBeat = log.filter((other) => other.kind === 'beatPlayed' && other.turnId === turnId && other.beat.id === toBeat && other.atMs <= event.atMs).at(-1);
  return rewoundBeat?.atMs ?? event.atMs;
}

function getActionOperations(log: readonly SessionEvent[], event: SessionEvent & { kind: 'studentActed' }): BoardOperation[] {
  const { action, atMs } = event;
  switch (action.action) {
    case 'sliderDragged':
      return action.samples.map(({ afterMs, value }) => ({ kind: 'parameterSample', atMs: atMs + afterMs, target: action.target, parameter: action.parameter, value }));
    case 'inkStroke':
      return [{ kind: 'inkStroke', atMs, id: action.id, points: action.points }];
    case 'inkErased':
      return [{ kind: 'inkErased', atMs, target: action.target }];
    case 'rewound':
      return [{ kind: 'rewound', atMs, toMs: getRewoundToMs(log, event) }];
    case 'fileShared':
      return [];
  }
}

function getEventOperations(log: readonly SessionEvent[], event: SessionEvent): BoardOperation[] {
  switch (event.kind) {
    case 'beatPlayed':
      // A beat nobody heard changed nothing, and the live board never saw it start.
      return event.playedWords === 0 && event.firedCueMs.length === 0 ? [] : getBeatOperations({ ...event, cues: getCues(event.beat) });
    case 'boardFrozen':
      return [{ kind: 'freeze', atMs: event.atMs, frames: event.frozen }];
    case 'studentActed':
      return getActionOperations(log, event);
    case 'studentSpoke':
    case 'connectionGap':
      return [];
  }
}

/** Flattens by time and not by sequence number, because a beat is written when it ends, so a cue inside it sorts against a drag inside it. */
export function getLogOperations(log: readonly SessionEvent[]): BoardOperation[] {
  return log.flatMap((event) => getEventOperations(log, event)).sort((first, second) => first.atMs - second.atMs);
}
