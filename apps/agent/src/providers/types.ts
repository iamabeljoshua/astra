import type { stt, tts } from '@livekit/agents';

export interface VoiceAdapter {
  name: string;
  makeTts(): tts.TTS;
}

export interface TranscriberAdapter {
  name: string;
  makeStt(): stt.STT;
}

/** One entry of the history the tutor keeps itself. A summary is the model's own compaction block, sent back exactly as it came. */
export type TutorTurn = { role: 'user' | 'assistant' | 'system'; text: string } | { role: 'summary'; summary: unknown };

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type ModelStopReason = 'finished' | 'lengthLimit' | 'refused' | 'other';

export type ModelEvent =
  | { type: 'started'; usage: ModelUsage }
  /** `isNewBlock` marks the first piece of a text block, because blocks can join with no space between them. */
  | { type: 'text'; text: string; isNewBlock: boolean }
  | { type: 'finished'; stopReason: ModelStopReason; refusalCategory: string | null; usage: ModelUsage };

export interface TutorModelRequest {
  system: string;
  turns: readonly TutorTurn[];
}

export interface CompactedHistory {
  summary: unknown;
  usage: ModelUsage;
}

/** A model the tutor can run by name. Thinking, effort, refusal categories, and compaction stay inside the adapter. */
export interface TutorModelAdapter {
  name: string;
  stream(request: TutorModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent>;
  /** Opens the connection and warms the prompt cache before the first turn. */
  warm(system: string): Promise<void>;
  /** Null when no summary came back, so the history simply stays as it is. */
  compact(request: TutorModelRequest, signal: AbortSignal): Promise<CompactedHistory | null>;
  getCostUsd(usage: ModelUsage): number;
}
