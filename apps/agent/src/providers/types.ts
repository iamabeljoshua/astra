import type { stt, tts } from '@livekit/agents';

export interface VoiceAdapter {
  name: string;
  makeTts(): tts.TTS;
}

export interface TranscriberAdapter {
  name: string;
  makeStt(): stt.STT;
}
