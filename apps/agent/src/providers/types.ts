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

/** `summary` is the API's compaction block, sent back exactly as it came. */
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

export type SourceAnswer = { found: true; title: string; site: string; url: string; costUsd: number } | { found: false; costUsd: number };

/** Looks for a page that supports a claim. Only a title and an address come back, so nothing on a page can reach the tutor. */
export type FindSource = (claim: string, signal: AbortSignal) => Promise<SourceAnswer>;

/** The API refused this request for good, so sending it again would fail the same way. */
export class ModelRejectedError extends Error {}

export interface TutorModelAdapter {
  name: string;
  stream(request: TutorModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent>;
  warm(system: string): Promise<void>;
  compact(request: TutorModelRequest, signal: AbortSignal): Promise<CompactedHistory | null>;
  getCostUsd(usage: ModelUsage): number;
}
