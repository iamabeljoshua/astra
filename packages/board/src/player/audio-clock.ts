import { createWordClock, type ReportedGap } from './word-clock.ts';

export type ProbeEvent = { kind: 'onset' | 'end' | 'sound' | 'quiet'; atMs: number };

export interface ClockReading {
  /** On the timeline of the turn's word times. */
  positionMs: number;
  /** A cue waits for sound, so a word time inside a silence lands on the next sound. */
  isGateOpen: boolean;
}

export interface TurnClock {
  addGap(gap: ReportedGap): void;
  noteWordTimes(firstWordStartMs: number, lastWordStartMs: number): void;
  /** Null until the turn's first sound. */
  read(): ClockReading | null;
  /** False once the turn's audio has gone quiet for longer than a pause inside a word. */
  isSounding(): boolean;
  /** True while audio from before a stop can still be arriving, so opening the gain now would play it. */
  isOldAudioArriving(): boolean;
}

/** The board's one source of time: audio, a timer, or a test's fake. */
export interface AudioClock {
  getNowMs(): number;
  startTurn(): TurnClock;
  markTurnAudioOver(): void;
  /** Audio already on its way still arrives after a stop, and must not read as the next turn's first sound. */
  markTurnStopped(): void;
  /** Called in audio order, so a turn can close on its own end before the next turn's first sound is read. */
  onAudioEnded(listener: () => void): void;
}

export interface SampleClock extends AudioClock {
  onProbeEvent(event: ProbeEvent): void;
}

/** The silence the agent leaves before a turn's first sound, so that sound is always an onset. `audio-probe-worklet.js` needs 107 ms, and the worst link squeezed 200 ms to 187. It is short because a reaction right after a stop pays it from its 200 ms. */
export const TURN_SILENCE_MS = 150;

/** The next turn's sound cannot come sooner after a stop than the agent's silence, less what a late stop message takes from it. */
const OLD_AUDIO_AFTER_STOP_MS = TURN_SILENCE_MS - 40;

/** The last of the old audio arrived up to 323 ms after a stop on the worst link, and its `end` takes 107 ms more. The gain never stays shut past this, so old and new audio merging with no `end` cannot leave a turn mute. */
const OLD_AUDIO_LIMIT_MS = 500;

/** A first sound this long after a turn's first word times was lost, or has no silence before it, and the turn must not wait for it for ever. */
const FIRST_SOUND_LIMIT_MS = 1000;

/** A word of old audio that starts past the 110 ms is cut off by the stop, so it is short, at most 182 ms on the worst link. No phrase of 48 in 9 real takes ran under 250 ms. */
const SHORTEST_FIRST_SOUND_MS = 200;

const RECENT_SOUND_MS = 300;

interface SampleClockOptions {
  getGraphTimeMs(): number;
  getOutputLatencyMs(): number;
}

// Counts the samples of the tutor's own audio, so the board follows what the student really hears.
export function createSampleClock({ getGraphTimeMs, getOutputLatencyMs }: SampleClockOptions): SampleClock {
  let isBlockAudible = false;
  let isAudioSounding = false;
  let soundEndedAtMs: number | null = null;
  let onsets: number[] = [];
  let onOnset: ((atMs: number) => void) | null = null;
  let onFalseStart: (() => void) | null = null;
  let firstAudibleOfTurnAtMs: number | null = null;
  let oldAudioEndsByMs = 0;
  let oldAudioLimitMs = 0;
  let lastOnsetAtMs = 0;
  let hasTurnWordTimes = false;
  let notifyAudioEnded = () => {};

  const isSoundRecent = () => isAudioSounding || (soundEndedAtMs !== null && getGraphTimeMs() - soundEndedAtMs <= RECENT_SOUND_MS);
  const getHeardMs = () => getGraphTimeMs() - getOutputLatencyMs();

  return {
    getNowMs: getGraphTimeMs,
    markTurnAudioOver() {
      onsets = [];
    },
    markTurnStopped() {
      // Word times go out with a turn's first audio, so a turn with none and no recent sound sent nothing, and the next turn's sound can follow this stop at once.
      if (!hasTurnWordTimes && !isSoundRecent()) return;
      oldAudioEndsByMs = getGraphTimeMs() + OLD_AUDIO_AFTER_STOP_MS;
      oldAudioLimitMs = getGraphTimeMs() + OLD_AUDIO_LIMIT_MS;
    },
    onAudioEnded(listener) {
      notifyAudioEnded = listener;
    },
    onProbeEvent({ kind, atMs }) {
      if (kind === 'onset') {
        isAudioSounding = true;
        lastOnsetAtMs = atMs;
        if (atMs >= oldAudioEndsByMs) {
          onsets.push(atMs);
          onOnset?.(atMs);
        }
      }
      if (kind === 'end') {
        isAudioSounding = false;
        soundEndedAtMs = atMs;
        if (lastOnsetAtMs >= oldAudioEndsByMs && atMs < oldAudioLimitMs && atMs - lastOnsetAtMs < SHORTEST_FIRST_SOUND_MS) {
          onsets = onsets.filter((onsetAtMs) => onsetAtMs !== lastOnsetAtMs);
          onFalseStart?.();
        }
        notifyAudioEnded();
      }
      if (kind === 'sound') {
        isBlockAudible = true;
        firstAudibleOfTurnAtMs ??= atMs;
      }
      if (kind === 'quiet') isBlockAudible = false;
    },
    startTurn() {
      const wordClock = createWordClock();
      let firstWordStartMs = 0;
      let firstWordTimesAtMs: number | null = null;
      firstAudibleOfTurnAtMs = null;
      hasTurnWordTimes = false;
      // On a poor link the audio can arrive first, so the turn starts at the earliest sound since the last turn ended.
      const heardAlready = isSoundRecent() ? onsets[0] : undefined;
      if (heardAlready !== undefined) wordClock.onFirstSound(heardAlready);
      onOnset = (atMs) => wordClock.onFirstSound(atMs);
      onFalseStart = () => wordClock.forgetFirstSound();
      return {
        addGap: (gap) => wordClock.addGap(gap),
        noteWordTimes(firstStartMs) {
          firstWordStartMs = firstStartMs;
          hasTurnWordTimes = true;
          firstWordTimesAtMs ??= getGraphTimeMs();
        },
        read() {
          if (firstWordTimesAtMs !== null && getGraphTimeMs() - firstWordTimesAtMs >= FIRST_SOUND_LIMIT_MS) wordClock.onFirstSound(firstAudibleOfTurnAtMs ?? getGraphTimeMs());
          const positionMs = wordClock.getPositionMs(getHeardMs(), firstWordStartMs);
          return positionMs === null ? null : { positionMs, isGateOpen: isBlockAudible };
        },
        isSounding: () => isAudioSounding,
        isOldAudioArriving() {
          const nowMs = getGraphTimeMs();
          return nowMs < oldAudioEndsByMs || (isAudioSounding && lastOnsetAtMs < oldAudioEndsByMs && nowMs < oldAudioLimitMs);
        },
      };
    },
  };
}

export interface ChoosingClock extends SampleClock {
  getKind(): 'samples' | 'timer';
}

interface ChoosingClockOptions extends SampleClockOptions {
  getIsAudioRunning(): boolean;
  getWallMs(): number;
}

// Chooses per turn, because audio can start after a page connects, and a choice made once would keep the timer for the whole session. One timeline runs across the change, so no report lands before the one before it.
export function createChoosingClock({ getIsAudioRunning, getGraphTimeMs, getOutputLatencyMs, getWallMs }: ChoosingClockOptions): ChoosingClock {
  const samples = createSampleClock({ getGraphTimeMs, getOutputLatencyMs });
  let hasGraphMoved = getIsAudioRunning();
  let graphToTimelineMs = 0;
  let wallToTimelineMs = 0;
  let lastNowMs = 0;

  const getNowMs = () => {
    const isRunning = getIsAudioRunning();
    if (isRunning !== hasGraphMoved) {
      hasGraphMoved = isRunning;
      graphToTimelineMs = lastNowMs - getGraphTimeMs();
      wallToTimelineMs = lastNowMs - getWallMs();
    }
    lastNowMs = isRunning ? getGraphTimeMs() + graphToTimelineMs : getWallMs() + wallToTimelineMs;
    return lastNowMs;
  };
  const timer = createTimerClock({ getNowMs });
  const getKind = () => (getIsAudioRunning() ? 'samples' : 'timer');
  wallToTimelineMs = hasGraphMoved ? 0 : -getWallMs();

  return {
    getKind,
    getNowMs,
    markTurnAudioOver: () => samples.markTurnAudioOver(),
    markTurnStopped: () => samples.markTurnStopped(),
    onAudioEnded: (listener) => samples.onAudioEnded(listener),
    onProbeEvent: (event) => samples.onProbeEvent(event),
    startTurn: () => (getKind() === 'samples' ? samples.startTurn() : timer.startTurn()),
  };
}

const TAIL_OF_LAST_WORD_MS = 600;

interface TimerClockOptions {
  getNowMs(): number;
}

// The one exception to "never from timers": audio is blocked or there is no output device, so nothing can be counted.
export function createTimerClock({ getNowMs }: TimerClockOptions): AudioClock {
  return {
    getNowMs,
    markTurnAudioOver() {},
    markTurnStopped() {},
    onAudioEnded() {},
    startTurn() {
      const wordClock = createWordClock();
      let firstWordStartMs = 0;
      let lastWordStartMs = 0;
      return {
        addGap: () => {},
        noteWordTimes(firstStartMs, lastStartMs) {
          wordClock.onFirstSound(getNowMs());
          firstWordStartMs = firstStartMs;
          lastWordStartMs = lastStartMs;
        },
        read() {
          const positionMs = wordClock.getPositionMs(getNowMs(), firstWordStartMs);
          return positionMs === null ? null : { positionMs, isGateOpen: true };
        },
        isSounding() {
          const positionMs = wordClock.getPositionMs(getNowMs(), firstWordStartMs);
          return positionMs === null || positionMs < lastWordStartMs + TAIL_OF_LAST_WORD_MS;
        },
        isOldAudioArriving: () => false,
      };
    },
  };
}
