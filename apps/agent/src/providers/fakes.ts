import { tts, voice as agentsVoice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import type { VoiceAdapter } from './types.ts';

export const FAKE_SAMPLE_RATE = 22050;
const FRAME_SAMPLES = 2205;
const WORD_MS = 280;
const LOUD = 0.5;
const QUIET = 0.05;
const TONE_HZ = 1000;
const LOUD_MS = 70;
const MS_PER_SECOND = 1000;

function renderWord(): Int16Array {
  const samples = Math.round((WORD_MS / MS_PER_SECOND) * FAKE_SAMPLE_RATE);
  const loudSamples = Math.round((LOUD_MS / MS_PER_SECOND) * FAKE_SAMPLE_RATE);
  return Int16Array.from({ length: samples }, (_, index) => Math.round((index < loudSamples ? LOUD : QUIET) * 32767 * Math.sin((2 * Math.PI * TONE_HZ * index) / FAKE_SAMPLE_RATE)));
}

export interface SpokenAudio {
  pcm: Int16Array;
  sampleRate: number;
  words: { text: string; startMs: number }[];
}

/** What a stored phrase is: audio and word times read back with no vendor call. A fake voice renders a tone for each word. */
export type RenderSpeech = (text: string) => SpokenAudio;

export const renderTone: RenderSpeech = (text) => {
  const words = text.split(/\s+/).filter(Boolean);
  const pcm = new Int16Array(words.length * renderWord().length);
  const wordSamples = renderWord();
  words.forEach((_, index) => pcm.set(wordSamples, index * wordSamples.length));
  return { pcm, sampleRate: FAKE_SAMPLE_RATE, words: words.map((word, index) => ({ text: word, startMs: index * WORD_MS })) };
};

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
    super(FAKE_SAMPLE_RATE, 1, { streaming: true, alignedTranscript: true });
    this.#render = render;
  }

  synthesize(): tts.ChunkedStream {
    throw new Error('the live session only streams');
  }

  stream(): tts.SynthesizeStream {
    return new RenderedStream(this, this.#render);
  }
}

/** A voice with no vendor: a tone per word, or a stored phrase. It passes the same suite as a real one. */
export function makeRenderedVoice({ name, render = renderTone }: { name: string; render?: RenderSpeech }): VoiceAdapter {
  return { name, makeTts: () => new RenderedTts(render) };
}
