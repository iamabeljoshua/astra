import { tts, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import type { TutorEvent, TutorModelAdapter, TutorRequest, VoiceAdapter } from './types.ts';

const SAMPLE_RATE = 24000;
const WORD_MS = 280;
const BURST_MS = 70;
const BURST_AMPLITUDE = 0.5;
const HUM_AMPLITUDE = 0.05;
const TONE_HZ = 1000;
const CHUNK_SAMPLES = 2400;
const SECONDS_PER_MS = 0.001;
const FRAGMENT_CHARACTERS = 12;
const FRAGMENT_MS = 30;

function renderWord(): Int16Array {
  const pcm = new Int16Array(Math.round(WORD_MS * SECONDS_PER_MS * SAMPLE_RATE));
  const burstSamples = Math.round(BURST_MS * SECONDS_PER_MS * SAMPLE_RATE);
  for (let index = 0; index < pcm.length; index++) {
    const amplitude = index < burstSamples ? BURST_AMPLITUDE : HUM_AMPLITUDE;
    pcm[index] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * TONE_HZ * index) / SAMPLE_RATE));
  }
  return pcm;
}

class InProcessStream extends tts.SynthesizeStream {
  label = 'fake.in-process-voice';
  cursorSeconds = 0;

  speak(text: string, segmentId: string): void {
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const pcm = renderWord();
      const startTime = this.cursorSeconds;
      this.cursorSeconds += pcm.length / SAMPLE_RATE;
      const timedWord = voice.createTimedString({ text: word, startTime, endTime: this.cursorSeconds });
      for (let offset = 0; offset < pcm.length; offset += CHUNK_SAMPLES) {
        const samples = pcm.slice(offset, offset + CHUNK_SAMPLES);
        this.queue.put({
          requestId: segmentId,
          segmentId,
          frame: new AudioFrame(samples, SAMPLE_RATE, 1, samples.length),
          final: false,
          timedTranscripts: offset === 0 ? [timedWord] : undefined,
        });
      }
    }
  }

  protected async run(): Promise<void> {
    let pending = '';
    let segment = 0;
    for await (const item of this.input) {
      if (typeof item === 'string') pending += item;
      else {
        this.speak(pending, `fake-${segment++}`);
        pending = '';
      }
    }
    this.speak(pending, `fake-${segment}`);
    this.queue.put(tts.SynthesizeStream.END_OF_STREAM);
  }
}

class InProcessTts extends tts.TTS {
  label = 'fake.in-process-tts';

  constructor() {
    super(SAMPLE_RATE, 1, { streaming: true, alignedTranscript: true });
  }

  synthesize(): tts.ChunkedStream {
    throw new Error('the live session only streams');
  }

  stream(): tts.SynthesizeStream {
    return new InProcessStream(this);
  }
}

export const IN_PROCESS_VOICE: VoiceAdapter = { name: 'in-process', makeTts: () => new InProcessTts() };

export interface FakeModelScript {
  name: string;
  text: string;
  firstTextMs?: number;
}

export function makeFakeModel({ name, text, firstTextMs = 0 }: FakeModelScript): TutorModelAdapter {
  return {
    name,
    async *stream(_request: TutorRequest, signal: AbortSignal): AsyncIterable<TutorEvent> {
      if (firstTextMs > 0) await new Promise((resolve) => setTimeout(resolve, firstTextMs));
      for (let offset = 0; offset < text.length && !signal.aborted; offset += FRAGMENT_CHARACTERS) {
        yield { kind: 'text', text: text.slice(offset, offset + FRAGMENT_CHARACTERS) };
        await new Promise((resolve) => setTimeout(resolve, FRAGMENT_MS));
      }
      yield { kind: 'usage', inputTokens: 1000, cachedTokens: 0, outputTokens: Math.ceil(text.length / 4) };
    },
  };
}
