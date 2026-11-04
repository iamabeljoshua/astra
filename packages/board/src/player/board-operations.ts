import { type BeatEnding, type Cue, type CueAim, type FrozenFrame, getCues, type InkPoint, type SceneCommand, type SessionEvent, type ElementId, type StudentAction } from '@astra/contracts';

const ASSUMED_WORD_MS = 300;

/** Every change to the board, in session ms. */
export type BoardOperation =
  | { kind: 'beatStarted'; atMs: number }
  | { kind: 'command'; atMs: number; command: SceneCommand; overMs: number | null }
  | { kind: 'reaim'; atMs: number; command: SceneCommand; landsAtMs: number }
  | { kind: 'freeze'; atMs: number; frames: readonly FrozenFrame[] }
  | { kind: 'parameterSample'; atMs: number; target: ElementId; parameter: string; value: number }
  | { kind: 'inkStroke'; atMs: number; id: ElementId; points: readonly InkPoint[] }
  | { kind: 'inkErased'; atMs: number; target: ElementId }
  | { kind: 'rewound'; atMs: number; toMs: number }
  | { kind: 'worked'; atMs: number; action: Extract<StudentAction, { action: 'worked' }> }
  | { kind: 'pointMoved'; atMs: number; task: ElementId; x: number };

export interface PlayedBeatView {
  atMs: number;
  cues: readonly Cue[];
  wordStartsMs: readonly number[];
  firedCueMs: readonly number[];
  cueAims?: readonly CueAim[];
  ending: BeatEnding | null;
  durationMs: number;
  frozen: readonly FrozenFrame[];
}

function getOverWords({ command }: Cue): number | null {
  return 'overWords' in command && command.overWords !== undefined ? command.overWords : null;
}

function getLastKnownWord(wordStartsMs: readonly number[], limit: number): number {
  let known = 0;
  while (known < limit && wordStartsMs[known + 1] !== undefined) known += 1;
  return known;
}

/** Where a cue should land, in ms after its beat started, and whether that is a known word time or an estimate. */
export function getCueAim(cue: Cue, wordStartsMs: readonly number[]): { landsAtMs: number; isKnown: boolean } | null {
  const overWords = getOverWords(cue);
  if (overWords === null) return null;
  const endWord = cue.atWord + overWords;
  const endMs = wordStartsMs[endWord];
  if (endMs !== undefined) return { landsAtMs: endMs, isKnown: true };
  const known = getLastKnownWord(wordStartsMs, endWord);
  const knownMs = wordStartsMs[known] ?? 0;
  const wordMs = known > 0 ? knownMs / known : ASSUMED_WORD_MS;
  return { landsAtMs: Math.round(knownMs + (endWord - known) * wordMs), isKnown: false };
}

function getFiredOperations(view: PlayedBeatView): BoardOperation[] {
  return view.firedCueMs.flatMap((firedMs, index): BoardOperation[] => {
    const cue = view.cues[index] as Cue;
    const aims = view.cueAims?.filter((aim) => aim.cue === index) ?? [];
    const landsAtMs = aims[0]?.landsAtMs ?? getCueAim(cue, view.wordStartsMs)?.landsAtMs ?? null;
    const overMs = landsAtMs === null ? null : Math.max(0, landsAtMs - firedMs);
    const fired: BoardOperation = { kind: 'command', atMs: view.atMs + firedMs, command: cue.command, overMs };
    return [fired, ...aims.slice(1).map((aim): BoardOperation => ({ kind: 'reaim', atMs: view.atMs + aim.afterMs, command: cue.command, landsAtMs: view.atMs + aim.landsAtMs }))];
  });
}

export function getBeatOperations(view: PlayedBeatView): BoardOperation[] {
  const isCut = view.ending !== null && view.ending !== 'finished';
  const freeze: BoardOperation[] = isCut ? [{ kind: 'freeze', atMs: view.atMs + view.durationMs, frames: view.frozen }] : [];
  return [{ kind: 'beatStarted', atMs: view.atMs }, ...getFiredOperations(view), ...freeze];
}

function getRewoundToMs(log: readonly SessionEvent[], event: SessionEvent & { kind: 'studentActed' }): number {
  if (event.action.action !== 'rewound') return event.atMs;
  const { turnId, toBeat } = event.action;
  const rewoundBeat = log.filter((other) => other.kind === 'beatPlayed' && other.turnId === turnId && other.beat.id === toBeat && other.atMs <= event.atMs).at(-1);
  return rewoundBeat?.atMs ?? event.atMs;
}

function getWorkedOperations(action: Extract<StudentAction, { action: 'worked' }>, atMs: number): BoardOperation[] {
  const { work } = action;
  if (work.way !== 'drag') return [{ kind: 'worked', atMs, action }];
  const moves = work.samples.map(({ afterMs, x }): BoardOperation => ({ kind: 'pointMoved', atMs: atMs + afterMs, task: work.task, x }));
  return [...moves, { kind: 'worked', atMs: atMs + (work.samples.at(-1)?.afterMs ?? 0), action }];
}

function getActionOperations(log: readonly SessionEvent[], event: SessionEvent & { kind: 'studentActed' }): BoardOperation[] {
  const { action, atMs } = event;
  switch (action.action) {
    case 'sliderDragged': {
      const parameter = 'constant' in action ? action.constant : action.parameter;
      return action.samples.map(({ afterMs, value }) => ({ kind: 'parameterSample', atMs: atMs + afterMs, target: action.target, parameter, value }));
    }
    case 'inkStroke':
      return [{ kind: 'inkStroke', atMs, id: action.id, points: action.points }];
    case 'inkErased':
      return [{ kind: 'inkErased', atMs, target: action.target }];
    case 'rewound':
      return [{ kind: 'rewound', atMs, toMs: getRewoundToMs(log, event) }];
    case 'fileShared':
      return [];
    case 'worked':
      return getWorkedOperations(action, atMs);
  }
}

function getEventOperations(log: readonly SessionEvent[], event: SessionEvent): BoardOperation[] {
  switch (event.kind) {
    case 'beatPlayed':
      return getBeatOperations({ ...event, cues: getCues(event.beat) });
    case 'boardFrozen':
      return [{ kind: 'freeze', atMs: event.atMs, frames: event.frozen }];
    case 'studentActed':
      return getActionOperations(log, event);
    case 'studentSpoke':
    case 'connectionGap':
      return [];
  }
}

const isStudentOperation = ({ kind }: BoardOperation) => kind === 'parameterSample' || kind === 'inkStroke' || kind === 'inkErased' || kind === 'rewound';

/** By time, and in the same millisecond the tutor's cue comes first, so a live board and a replay cannot order a tie differently. */
export function sortOperations(operations: BoardOperation[]): BoardOperation[] {
  return operations.sort((first, second) => first.atMs - second.atMs || Number(isStudentOperation(first)) - Number(isStudentOperation(second)));
}

/** Sorts by time, not sequence, because a beat is written when it ends and a cue inside it must sort against a drag inside it. */
export function getLogOperations(log: readonly SessionEvent[]): BoardOperation[] {
  return sortOperations(log.flatMap((event) => getEventOperations(log, event)));
}
