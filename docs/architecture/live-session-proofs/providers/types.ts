import type { stt, tts } from '@livekit/agents';

/** LiveKit's class already streams text, flushes, cancels, and reports word times, so an adapter only builds one with its vendor's settings. */
export interface VoiceAdapter {
  name: string;
  makeTts(): tts.TTS;
}

export interface TranscriberAdapter {
  name: string;
  makeStt(): stt.STT;
}

export interface TutorTurn {
  role: 'student' | 'tutor' | 'note';
  text: string;
  /** Whatever the model must get back unchanged, such as thinking blocks. Only its own adapter reads it. */
  modelData?: unknown;
}

export interface TutorRequest {
  instructions: string;
  turns: TutorTurn[];
}

export type TutorEvent =
  | { kind: 'text'; text: string }
  | { kind: 'toolCall'; name: string; input: unknown }
  | { kind: 'refused'; reason: string }
  | { kind: 'usage'; inputTokens: number; cachedTokens: number; outputTokens: number };

export interface TutorModelAdapter {
  name: string;
  stream(request: TutorRequest, signal: AbortSignal): AsyncIterable<TutorEvent>;
}
