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

const DEFAULT_MODEL = 'eleven_flash_v2_5';
/** The plugin's default of 22050 Hz runs slow on the wire, because LiveKit frames 10 ms as whole samples. The plugin's type leaves this rate out and its code reads any rate from the name. */
const ENCODING = 'pcm_24000' as unknown as elevenlabs.TTSOptions['encoding'];

// The plugin leaves prewarm empty, so this opens its socket before the first turn.
class WarmElevenLabsTts extends elevenlabs.TTS {
  override prewarm(): void {
    void this.currentConnection().catch(() => {});
  }
}

export function makeElevenLabsVoice({ name, apiKey, voiceId, model = DEFAULT_MODEL, voiceSettings, baseURL, preferredAlignment = 'original' }: ElevenLabsVoiceOptions): VoiceAdapter {
  return { name, makeTts: () => new WarmElevenLabsTts({ apiKey, voiceId, model, voiceSettings, baseURL, preferredAlignment, syncAlignment: true, encoding: ENCODING }) };
}
