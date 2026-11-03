import * as cartesia from '@livekit/agents-plugin-cartesia';
import type { VoiceAdapter } from './types.ts';

export interface CartesiaAccount {
  name: string;
  apiKey: string;
  baseUrl?: string;
  wordTimestamps?: boolean;
}

// Training and retention are set on the Cartesia account, not per request, so nothing here can turn them off.
export function makeCartesiaVoice({ name, apiKey, baseUrl, wordTimestamps = true }: CartesiaAccount): VoiceAdapter {
  return { name, makeTts: () => new cartesia.TTS({ apiKey, baseUrl, wordTimestamps }) };
}
