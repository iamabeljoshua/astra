import type { stt, tts } from '@livekit/agents';

export interface VoiceAdapter {
  name: string;
  makeTts(): tts.TTS;
}

export interface LineTranscriber extends stt.STT {
  endLine(): void;
}

export interface TranscriberAdapter {
  name: string;
  makeStt(): LineTranscriber;
}
