import { tts, voice as agentsVoice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import type { VoiceAdapter } from './types.ts';

/** LiveKit frames 10 ms as whole samples, and 24 kHz is what the voice line's silence and the browser's clock were measured on. */
export const RENDERED_SAMPLE_RATE = 24000;
const FRAME_SAMPLES = 2400;
const MS_PER_SECOND = 1000;

export interface SpokenAudio {
  pcm: Int16Array;
  sampleRate: number;
  words: { text: string; startMs: number }[];
}

export type RenderSpeech = (text: string) => SpokenAudio;

class RenderedStream extends tts.SynthesizeStream {
  label = 'astra.rendered-voice';
  #render: RenderSpeech;
  #timelineMs = 0;

  constructor(voice: tts.TTS, render: RenderSpeech) {
    super(voice);
    this.#render = render;
  }

  #speak(text: string, segmentId: string): void {
    if (text.trim() === '') return;
    const { pcm, sampleRate, words } = this.#render(text);
    const timed = words.map((word) => agentsVoice.createTimedString({ text: `${word.text} `, startTime: (this.#timelineMs + word.startMs) / MS_PER_SECOND }));
    for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES) {
      const samples = pcm.slice(offset, offset + FRAME_SAMPLES);
      this.queue.put({ requestId: segmentId, segmentId, frame: new AudioFrame(samples, sampleRate, 1, samples.length), final: false, timedTranscripts: offset === 0 ? timed : undefined });
    }
    this.#timelineMs += (pcm.length / sampleRate) * MS_PER_SECOND;
  }

  protected async run(): Promise<void> {
    let pending = '';
    let segment = 0;
    for await (const item of this.input) {
      if (typeof item === 'string') {
        pending += item;
      } else {
        this.#speak(pending, `rendered-${segment++}`);
        pending = '';
      }
    }
    this.#speak(pending, `rendered-${segment}`);
  }
}

class RenderedTts extends tts.TTS {
  label = 'astra.rendered-tts';
  #render: RenderSpeech;

  constructor(render: RenderSpeech) {
    super(RENDERED_SAMPLE_RATE, 1, { streaming: true, alignedTranscript: true });
    this.#render = render;
  }

  synthesize(): tts.ChunkedStream {
    throw new Error('the live session only streams');
  }

  stream(): tts.SynthesizeStream {
    return new RenderedStream(this, this.#render);
  }
}

export function makeRenderedVoice({ name, render }: { name: string; render: RenderSpeech }): VoiceAdapter {
  return { name, makeTts: () => new RenderedTts(render) };
}
