import type { BeatId, TurnId } from './ids.ts';
import type { SceneCommand } from './scene-command.ts';
import type { FrozenSimulation, PlayReport, StudentAction } from './session-event.ts';

/** The largest message allowed on the data channel, in UTF-8 bytes of its JSON. */
export const LIVE_MESSAGE_MAX_BYTES = 15 * 1024;

const CUE_WRAPPER_BYTES = 1024;

export const COMMAND_MAX_BYTES = LIVE_MESSAGE_MAX_BYTES - CUE_WRAPPER_BYTES;

/** One spoken word and where it starts, in ms after the first audible sound of the turn. */
export interface TimedWord {
  text: string;
  startMs: number;
}

/** `yield` and `stop` go on both data channels, and the rest on the reliable one. */
export type AgentMessage =
  | { type: 'turnStarted'; turnId: TurnId }
  | { type: 'cue'; turnId: TurnId; beatId: BeatId; atWord: number; command: SceneCommand }
  | { type: 'words'; turnId: TurnId; beatId: BeatId; firstWord: number; words: TimedWord[] }
  /** The model finished this beat, so the browser knows how many words to expect. */
  | { type: 'beatClosed'; turnId: TurnId; beatId: BeatId; wordCount: number }
  /** The student's voice started or ended over the tutor. The tutor lowers its volume and the dot rests. */
  | { type: 'yield'; turnId: TurnId; isYielding: boolean }
  /** The student really is interrupting. The browser cuts the audio and freezes the board at once. */
  | { type: 'stop'; turnId: TurnId };

export type BrowserMessage =
  | ({ type: 'played'; turnId: TurnId; beatId: BeatId; startedMsAgo: number } & PlayReport)
  | { type: 'acted'; action: StudentAction }
  /** A stop landed after the beat's last word, with something still moving. */
  | { type: 'boardFrozen'; turnId: TurnId; frozen: FrozenSimulation[] };
