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
}

/** The board's one source of time: audio, a timer, or a test's fake. */
export interface AudioClock {
  getNowMs(): number;
  startTurn(): TurnClock;
  markTurnAudioOver(): void;
}

export interface SampleClock extends AudioClock {
  onProbeEvent(event: ProbeEvent): void;
}

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

  const isSoundRecent = () => isAudioSounding || (soundEndedAtMs !== null && getGraphTimeMs() - soundEndedAtMs <= RECENT_SOUND_MS);
  const getHeardMs = () => getGraphTimeMs() - getOutputLatencyMs();

  return {
    getNowMs: getGraphTimeMs,
    markTurnAudioOver() {
      onsets = [];
    },
    onProbeEvent({ kind, atMs }) {
      if (kind === 'onset') {
        isAudioSounding = true;
        onsets.push(atMs);
        onOnset?.(atMs);
      }
      if (kind === 'end') {
        isAudioSounding = false;
        soundEndedAtMs = atMs;
      }
      if (kind === 'sound') isBlockAudible = true;
      if (kind === 'quiet') isBlockAudible = false;
    },
    startTurn() {
      const wordClock = createWordClock();
      let firstWordStartMs = 0;
      // On a poor link the audio can arrive first, so the turn starts at the earliest sound since the last turn ended.
      const heardAlready = isSoundRecent() ? onsets[0] : undefined;
      if (heardAlready !== undefined) wordClock.onFirstSound(heardAlready);
      onOnset = (atMs) => wordClock.onFirstSound(atMs);
      return {
        addGap: (gap) => wordClock.addGap(gap),
        noteWordTimes(firstStartMs) {
          firstWordStartMs = firstStartMs;
        },
        read() {
          const positionMs = wordClock.getPositionMs(getHeardMs(), firstWordStartMs);
          return positionMs === null ? null : { positionMs, isGateOpen: isBlockAudible };
        },
        isSounding: () => isAudioSounding,
      };
    },
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
      };
    },
  };
}
