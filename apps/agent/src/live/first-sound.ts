import type { AudioFrame } from '@livekit/rtc-node';

/** The same level the browser's probe calls audible, so both sides agree where the first sound is. */
const AUDIBLE_SAMPLE = 328;
const MS_PER_SECOND = 1000;

export function getFrameMs(frame: AudioFrame): number {
  return (frame.samplesPerChannel / frame.sampleRate) * MS_PER_SECOND;
}

function findFirstAudibleMs(frame: AudioFrame): number | null {
  const index = frame.data.findIndex((sample) => Math.abs(sample) >= AUDIBLE_SAMPLE);
  return index < 0 ? null : (index / frame.sampleRate) * MS_PER_SECOND;
}

export interface FirstSound {
  noteFrame(frame: AudioFrame): void;
  /** The voice ended, so whatever was read counts as leading silence. */
  settle(): void;
  isKnown(): boolean;
  /** A voice counts from its first sample, and the contract and the browser's clock count from the first audible one. */
  toTimeline(atMs: number): number;
}

// Finds the 0 to 75 ms of silence that leads a real voice, so it reaches no word time and no gap report.
export function createFirstSound(): FirstSound {
  let leadingSilenceMs: number | null = null;
  let silentAudioReadMs = 0;
  return {
    noteFrame(frame) {
      if (leadingSilenceMs !== null) return;
      const firstAudibleMs = findFirstAudibleMs(frame);
      if (firstAudibleMs === null) silentAudioReadMs += getFrameMs(frame);
      else leadingSilenceMs = silentAudioReadMs + firstAudibleMs;
    },
    settle() {
      leadingSilenceMs ??= silentAudioReadMs;
    },
    isKnown: () => leadingSilenceMs !== null,
    toTimeline: (atMs) => Math.max(0, Math.round(atMs - (leadingSilenceMs ?? silentAudioReadMs))),
  };
}
