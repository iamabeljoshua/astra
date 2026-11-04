import type { FrozenFrame } from './beat.ts';
import type { BeatId, TurnId } from './ids.ts';
import type { SceneCommand } from './scene-command.ts';
import type { PlayReport, StudentAction } from './session-event.ts';

/** The longest typed reply, in characters. */
export const TYPED_TEXT_MAX_CHARACTERS = 2000;

/** The longest caption line of the student's words, in characters. */
export const STUDENT_WORDS_MAX_CHARACTERS = 2000;

/** The largest message allowed on the data channel, in UTF-8 bytes of its JSON. */
export const LIVE_MESSAGE_MAX_BYTES = 15 * 1024;

const CUE_WRAPPER_BYTES = 1024;

export const COMMAND_MAX_BYTES = LIVE_MESSAGE_MAX_BYTES - CUE_WRAPPER_BYTES;

/** One spoken word and where it starts, in ms after the first audible sound of the turn. */
export interface TimedWord {
  text: string;
  startMs: number;
}

/** `yield`, `stop`, and `audioGap` go on both data channels, and the rest on the reliable one. */
export type AgentMessage =
  | { type: 'turnStarted'; turnId: TurnId }
  | { type: 'cue'; turnId: TurnId; beatId: BeatId; atWord: number; command: SceneCommand }
  | { type: 'words'; turnId: TurnId; beatId: BeatId; firstWord: number; words: TimedWord[] }
  /** The model finished this beat, so the browser knows how many words to expect. */
  | { type: 'beatClosed'; turnId: TurnId; beatId: BeatId; wordCount: number; expectsReply: boolean }
  /** The student's voice started or ended over the tutor. The tutor lowers its volume and the dot rests. */
  | { type: 'yield'; turnId: TurnId; isYielding: boolean }
  /** The student really is interrupting. The browser cuts the audio and freezes the board at once. */
  | { type: 'stop'; turnId: TurnId }
  /** The voice ran dry here. atMs is on the same timeline as TimedWord.startMs. It is sent with no `ms` when the audio stops, and again with `ms` when it returns. */
  | { type: 'audioGap'; turnId: TurnId; atMs: number; ms?: number }
  /** What the student said so far, for the student's own captions. An interim line replaces the last one, and a final line stays. */
  | { type: 'studentWords'; text: string; isFinal: boolean }
  /** Code knows the student finished, so the dot reacts before any voice can. */
  | { type: 'heard' }
  /** Sent every half second on the lossy channel, so the browser knows the agent can still reach it. */
  | { type: 'pulse' };

/**
 * `browserMs` says when this was sent, on the browser's audio clock, and `startedMsAgo` how long before that it really happened.
 * The agent keeps one offset per `clockId`, so the gaps in the log are the gaps the student saw and a slow message moves nothing, and a reloaded page, whose clock restarts at zero, gets its own.
 */
export interface BrowserStamp {
  clockId: string;
  browserMs: number;
  startedMsAgo: number;
}

export type BrowserMessage = BrowserStamp &
  (
    | ({ type: 'played'; turnId: TurnId; beatId: BeatId } & PlayReport)
    | { type: 'acted'; action: StudentAction }
    /** A stop landed after the beat's last word, with something still moving. */
    | { type: 'boardFrozen'; turnId: TurnId; frozen: FrozenFrame[] }
    /** The last word of an `expectsReply` beat started playing, so "yes" now counts as an answer and the 8 second timer starts. */
    | { type: 'questionHeard'; turnId: TurnId; beatId: BeatId }
    /** The student typed instead of speaking. */
    | { type: 'typed'; text: string }
    /** Sent every half second on the lossy channel. `hearsAgent` is false once the agent's own pulse has stopped arriving. */
    | { type: 'pulse'; hearsAgent: boolean }
    /** Whether audio can play. A student who cannot hear the tutor reads the captions, and the note must not say "heard". */
    | { type: 'audioState'; isRunning: boolean }
  );
