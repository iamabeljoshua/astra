import { tokenize } from '@livekit/agents';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import type { VoiceAdapter } from './types.ts';

export type ElevenLabsVoiceSettings = elevenlabs.VoiceSettings;

export interface ElevenLabsVoiceOptions {
  name: string;
  apiKey: string;
  voiceId: string;
  model?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  baseURL?: string;
  preferredAlignment?: 'original' | 'normalized';
}

const DEFAULT_MODEL = 'eleven_v4_turbo';
/** The plugin's default of 22050 Hz runs slow on the wire, because LiveKit frames 10 ms as whole samples. The plugin's type leaves this rate out and its code reads any rate from the name. */
export const VOICE_SAMPLE_RATE = 24000;
const ENCODING = `pcm_${VOICE_SAMPLE_RATE}` as unknown as elevenlabs.TTSOptions['encoding'];

class WholeStretchStream extends tokenize.SentenceStream {
  constructor() {
    super();
    void this.#pump();
  }

  async #pump(): Promise<void> {
    let held = '';
    for await (const item of this.input) {
      if (typeof item === 'string') {
        held += item;
      } else if (held.trim() !== '') {
        this.queue.put({ segmentId: 'stretch', token: held.trim() });
        held = '';
      }
    }
    if (held.trim() !== '' && !this.queue.closed) this.queue.put({ segmentId: 'stretch', token: held.trim() });
    this.queue.close();
  }
}

// The plugin's own tokenizer flushes the voice at every sentence, and the flushes are ours to choose, because the voice only keeps its natural pauses inside one synthesis.
class WholeStretchTokenizer extends tokenize.SentenceTokenizer {
  tokenize(text: string): string[] {
    return [text];
  }

  stream(): tokenize.SentenceStream {
    return new WholeStretchStream();
  }
}

// The plugin leaves prewarm empty, so this opens its socket before the first turn.
class WarmElevenLabsTts extends elevenlabs.TTS {
  override prewarm(): void {
    void this.currentConnection().catch(() => {});
  }
}

export function makeElevenLabsVoice({ name, apiKey, voiceId, model = DEFAULT_MODEL, voiceSettings, baseURL, preferredAlignment = 'original' }: ElevenLabsVoiceOptions): VoiceAdapter {
  return { name, makeTts: () => new WarmElevenLabsTts({ apiKey, voiceId, model, voiceSettings, baseURL, preferredAlignment, syncAlignment: true, encoding: ENCODING, wordTokenizer: new WholeStretchTokenizer() }) };
}
