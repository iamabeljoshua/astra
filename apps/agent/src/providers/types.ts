import type { tts } from '@livekit/agents';

export interface VoiceAdapter {
  name: string;
  makeTts(): tts.TTS;
}
