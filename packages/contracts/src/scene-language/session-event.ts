import type { Beat } from './beat.ts';
import type { ElementId, FileId, TurnId } from './ids.ts';
import type { SimulationParameter } from './scene-command.ts';

export const SPEECH_SOURCES = ['voice', 'typed'] as const;
export type SpeechSource = (typeof SPEECH_SOURCES)[number];

export const BEAT_ENDINGS = ['finished', 'interrupted', 'disconnected'] as const;
export type BeatEnding = (typeof BEAT_ENDINGS)[number];

export const PLAY_REPORTERS = ['browser', 'agent-estimate'] as const;
export type PlayReporter = (typeof PLAY_REPORTERS)[number];

/** A frozen simulation stays on this frame until a later `runSimulation`. */
export interface FrozenSimulation {
  target: ElementId;
  /** The simulation's own time at the frozen frame. */
  simulationSeconds: number;
}

/** Each sample sets the value and restarts the motion. */
export interface SliderSample {
  /** Counts from the event's `atMs`. */
  afterMs: number;
  value: number;
}

/** x and y are fractions of the board panel from its top left, each 0 to 1. `afterMs` counts from the event's `atMs`. */
export type InkPoint = [x: number, y: number, afterMs: number];

export type StudentAction =
  | { action: 'sliderDragged'; target: ElementId; parameter: SimulationParameter; samples: SliderSample[] }
  | { action: 'rewound'; toBeat: Beat['id'] }
  /** A long stroke is sent as several actions with the same id. */
  | { action: 'inkStroke'; id: ElementId; points: InkPoint[] }
  | { action: 'inkErased'; target: ElementId }
  | { action: 'fileShared'; fileId: FileId; name: string };

export interface PlayReport {
  /** When each word of the beat starts, in ms after `atMs`. */
  wordStartsMs: number[];
  durationMs: number;
  /** Counts the words that started playing, so a cut word counts. */
  playedWords: number;
  /** Counts, in script order, the cues that really fired. */
  firedCues: number;
  ending: BeatEnding;
  frozen: FrozenSimulation[];
}

export interface BeatPlayed extends PlayReport {
  kind: 'beatPlayed';
  turnId: TurnId;
  beat: Beat;
  reportedBy: PlayReporter;
}

/** `atMs` is when the student started speaking. */
export interface StudentSpoke {
  kind: 'studentSpoke';
  text: string;
  source: SpeechSource;
  /** A small reaction such as "uh-huh" is logged but does not end the tutor's turn. */
  isReaction: boolean;
  durationMs: number;
}

export interface StudentActed {
  kind: 'studentActed';
  action: StudentAction;
}

/** A replay skips the gap. A drop with no return simply ends the log. */
export interface ConnectionGap {
  kind: 'connectionGap';
  durationMs: number;
}

/** A stop that lands after the beat's last word, with something still moving. */
export interface BoardFrozen {
  kind: 'boardFrozen';
  turnId: TurnId;
  frozen: FrozenSimulation[];
}

export type SessionEventBody = BeatPlayed | StudentSpoke | StudentActed | ConnectionGap | BoardFrozen;

/** Silence has no event: it is the gap between two entries. */
export type SessionEvent = SessionEventBody & {
  /** Unique within a session, so a repeated write changes nothing. */
  seq: number;
  /** In ms after the session started. */
  atMs: number;
};
