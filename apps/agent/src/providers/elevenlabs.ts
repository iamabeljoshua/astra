import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import type { VoiceAdapter } from './types.ts';

export type ElevenLabsVoiceSettings = elevenlabs.VoiceSettings;

export interface ElevenLabsVoiceOptions {
  name: string;
  apiKey: string;
  voiceId: string;
  /** Flash until `voice-choice` is answered. */
  model?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  baseURL?: string;
  /** Original by default, because normalized text can turn "2.5" into several words and move every later cue. */
  preferredAlignment?: 'original' | 'normalized';
}

const DEFAULT_MODEL = 'eleven_flash_v2_5';

// A new socket costs about 420 ms, so the framework's prewarm opens it before the first turn.
class WarmElevenLabsTts extends elevenlabs.TTS {
  override prewarm(): void {
    void this.currentConnection().catch(() => {});
  }
}

export function makeElevenLabsVoice({ name, apiKey, voiceId, model = DEFAULT_MODEL, voiceSettings, baseURL, preferredAlignment = 'original' }: ElevenLabsVoiceOptions): VoiceAdapter {
  return { name, makeTts: () => new WarmElevenLabsTts({ apiKey, voiceId, model, voiceSettings, baseURL, preferredAlignment, syncAlignment: true }) };
}
