import * as deepgram from '@livekit/agents-plugin-deepgram';
import type { TranscriberAdapter } from './types.ts';

export interface DeepgramAccount {
  name: string;
  apiKey: string;
  baseUrl?: string;
}

// Deepgram's terms license audio for training unless each request opts out, so every request here does.
export function makeDeepgramTranscriber({ name, apiKey, baseUrl }: DeepgramAccount): TranscriberAdapter {
  return { name, makeStt: () => new deepgram.STT({ apiKey, baseUrl, mipOptOut: true }) };
}
