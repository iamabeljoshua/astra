import type { stt, tts } from '@livekit/agents';

export interface VoiceAdapter {
  name: string;
  makeTts(): tts.TTS;
}

/** A transcriber that can be told the student's line has ended, so its final does not wait to hear silence. */
export interface LineTranscriber extends stt.STT {
  endLine(): void;
}

export interface TranscriberAdapter {
  name: string;
  makeStt(): LineTranscriber;
}
