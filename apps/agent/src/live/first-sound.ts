import type { AudioFrame } from '@livekit/rtc-node';

/** The 16-bit form of the level `audio-probe-worklet.js` calls audible, so both sides agree where the first sound is. */
export const AUDIBLE_SAMPLE = 328;
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
  settle(): void;
  isKnown(): boolean;
  toTimeline(atMs: number): number;
}

// Finds the silence that leads a real voice, because word times count from the first sample and the contract counts from the first audible one.
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
