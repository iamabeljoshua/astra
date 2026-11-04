import { createPcmRecorder, type PcmRecorder } from './pcmRecorder';
import pcmTapWorkletUrl from './pcm-tap-worklet.js?url';

export interface LessonBench {
  notes: { name: string; epochMs: number }[];
  pcm: PcmRecorder | null;
  getGraphEpochZeroMs(): number;
}

declare global {
  interface Window {
    astraLesson?: LessonBench;
    astraRecordLesson?: boolean;
  }
}

// Development only. Keeps what a proof needs from a real lesson on the window, and taps the sound when a proof asks for a recording.
export function createLessonBench() {
  const bench: LessonBench = { notes: [], pcm: null, getGraphEpochZeroMs: () => 0 };
  window.astraLesson = bench;
  return {
    note: (name: string) => void bench.notes.push({ name, epochMs: performance.timeOrigin + performance.now() }),
    async onAudioReady(audioContext: AudioContext, gain: GainNode) {
      bench.getGraphEpochZeroMs = () => performance.timeOrigin + performance.now() - audioContext.currentTime * 1000;
      if (!window.astraRecordLesson) return;
      await audioContext.audioWorklet.addModule(pcmTapWorkletUrl);
      bench.pcm = createPcmRecorder(audioContext);
      bench.pcm.tap('output', gain);
    },
  };
}
