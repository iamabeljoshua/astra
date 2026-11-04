import type { FrozenFrame } from './beat.ts';
import type { BeatId, TurnId } from './ids.ts';
import type { SceneCommand } from './scene-command.ts';
import type { PlayReport, StudentAction } from './session-event.ts';

/** Each side of a session sends a pulse this often, on the lossy channel. */
export const PULSE_EVERY_MS = 500;

/** Three missed pulses is a drop and not a late packet. */
export const LINK_QUIET_LIMIT_MS = 3 * PULSE_EVERY_MS;

/** The longest typed reply, in characters. */
export const TYPED_TEXT_MAX_CHARACTERS = 2000;

const LONE_SURROGATE = /\p{Cs}/gu;

/** Cuts between whole characters, because half an emoji makes the JSON the model's API reads invalid. */
export function clipTypedText(text: string): string {
  return Array.from(text.replace(LONE_SURROGATE, '')).slice(0, TYPED_TEXT_MAX_CHARACTERS).join('');
}

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

export const TUTOR_CLOSED_REASONS = ['sessionLimit', 'dailyLimit', 'broken'] as const;

/** Why the tutor will not answer again in this room: a spending limit, or a model that rejects every request. */
export type TutorClosedReason = (typeof TUTOR_CLOSED_REASONS)[number];

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
  /** The tutor is working on a reply and has no words yet, so the student can see why it is quiet. */
  | { type: 'thinking'; isThinking: boolean }
  /** The tutor has said why it stopped, and will not speak again, so the page can keep saying why it is quiet. */
  | { type: 'tutorClosed'; reason: TutorClosedReason }
  /** Sent every half second on the lossy channel, so the browser knows the agent can still reach it. */
  | { type: 'pulse' }
  /** This microphone's sound now reaches a transcriber that has answered, so the browser lets go of what it held. */
  | { type: 'earsOpen' }
  /** The room has been quiet for most of its limit. A later message with `isOn` false takes the warning down. */
  | { type: 'quietWarning'; isOn: boolean }
  /** The room stayed quiet to its limit and closes now. */
  | { type: 'closingForQuiet' }
  /** The tutor keeps getting cut off by sound with at most one word in it, so the page may suggest holding to talk. */
  | { type: 'keptBeingCut' }
  /** The tutor told this student they can talk, so the page records that and it is not said again. */
  | { type: 'talkInvited' };

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
    /** The page has joined and hears the tutor's track. `wantsGreeting` is false when the student opened the room by typing, or came back after a drop. `invitesTalk` is true when the tutor should tell this student they can talk. */
    | { type: 'hello'; wantsGreeting: boolean; invitesTalk: boolean }
    /** The student typed instead of speaking. */
    | { type: 'typed'; text: string }
    /** The board could not draw this mark, so the tutor is pointing at something the student cannot see. */
    | { type: 'markNotDrawn'; markId: string }
    /** Sent every half second on the lossy channel. `hearsAgent` is false once the agent's own pulse has stopped arriving. */
    | { type: 'pulse'; hearsAgent: boolean }
    /** Whether audio can play. A student who cannot hear the tutor reads the captions, and the note must not say "heard". */
    | { type: 'audioState'; isRunning: boolean }
    /** The student answered a quiet warning, so the room stays open. */
    | { type: 'stillHere' }
    /** The student turned the microphone on, so they know they can talk. */
    | { type: 'talkPressed' }
    /** The student is holding to talk. The tutor stops, and only `lineEnded` ends what they are saying. */
    | { type: 'holdStarted' }
    /** The student let go and all they said has left the page, so nothing waits for the voice detector. */
    | { type: 'lineEnded' }
  );
