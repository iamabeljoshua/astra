import type { tts } from '@livekit/agents';

/** LiveKit's class already streams text, flushes, cancels, and reports word times, so an adapter only builds one with its vendor's settings. */
export interface VoiceAdapter {
  name: string;
  makeTts(): tts.TTS;
}
