import { type ModelEvent, ModelRejectedError, type ModelStopReason, type ModelUsage, type TutorModelAdapter, type TutorModelRequest, type TutorTurn } from './types.ts';

const OPENAI_NAME_START = 'openai:';
const OPENAI_URL = 'https://api.openai.com/v1';
const MAX_REPLY_TOKENS = 1000;
const TOKENS_PER_MILLION = 1_000_000;
const PERMANENT_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 413, 422]);

/** Dollars per million tokens, from OpenAI's model page, read 5 November 2026. */
const OPENAI_PRICES = {
  'gpt-5.4-mini': { input: 0.75, cacheRead: 0.075, output: 4.5 },
} as const;

type OpenAiModelId = keyof typeof OPENAI_PRICES;

export const OPENAI_MODEL_NAMES = Object.keys(OPENAI_PRICES).map((id) => `${OPENAI_NAME_START}${id}`);

export const isOpenAiModelName = (name: string) => OPENAI_MODEL_NAMES.includes(name);

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface OpenAiChunk {
  usage?: OpenAiUsage | null;
  choices?: readonly { finish_reason?: string | null; delta?: { content?: string | null; refusal?: string | null } }[];
}

function toUsage({ prompt_tokens: prompt = 0, completion_tokens: output = 0, prompt_tokens_details: details }: OpenAiUsage): ModelUsage {
  const cached = details?.cached_tokens ?? 0;
  return { inputTokens: prompt - cached, outputTokens: output, cacheReadTokens: cached, cacheWriteTokens: 0 };
}

function toStopReason(reason: string | null): ModelStopReason {
  if (reason === 'stop') return 'finished';
  if (reason === 'length') return 'lengthLimit';
  return reason === 'content_filter' ? 'refused' : 'other';
}

function toMessages(system: string, turns: readonly TutorTurn[]) {
  return [{ role: 'system', content: system }, ...turns.flatMap((turn) => (turn.role === 'summary' ? [] : [{ role: turn.role, content: turn.text }]))];
}

async function* readChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<OpenAiChunk> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let tail = '';
  for (let piece = await reader.read(); !piece.done; piece = await reader.read()) {
    tail += decoder.decode(piece.value, { stream: true });
    const lines = tail.split('\n');
    tail = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.startsWith('data: ') ? line.slice('data: '.length).trim() : '';
      if (data !== '' && data !== '[DONE]') yield JSON.parse(data) as OpenAiChunk;
    }
  }
}

export function makeOpenAiTutorModel({ name, apiKey }: { name: string; apiKey: string }): TutorModelAdapter {
  const id = name.slice(OPENAI_NAME_START.length) as OpenAiModelId;
  const prices = OPENAI_PRICES[id];
  const url = `${process.env.OPENAI_BASE_URL ?? OPENAI_URL}/chat/completions`;

  async function* stream({ system, turns }: TutorModelRequest, signal: AbortSignal): AsyncGenerator<ModelEvent> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: id, stream: true, stream_options: { include_usage: true }, max_completion_tokens: MAX_REPLY_TOKENS, reasoning_effort: 'none', messages: toMessages(system, turns) }),
      });
      if (!response.ok || !response.body) {
        const problem = `OpenAI answered ${response.status}: ${(await response.text()).slice(0, 300)}`;
        throw PERMANENT_STATUSES.has(response.status) ? new ModelRejectedError(problem) : new Error(problem);
      }
      let isNewBlock = true;
      let stopReason: ModelStopReason = 'other';
      let usage: OpenAiUsage | null = null;
      for await (const chunk of readChunks(response.body)) {
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (choice?.delta?.refusal) stopReason = 'refused';
        if (choice?.delta?.content) {
          yield { type: 'text', text: choice.delta.content, isNewBlock };
          isNewBlock = false;
        }
        if (choice?.finish_reason && stopReason !== 'refused') stopReason = toStopReason(choice.finish_reason);
      }
      // OpenAI reports usage only at the end, so a cut reply stays estimated from what it sent, as one cut before Anthropic's first event does.
      if (!usage) throw new Error('OpenAI ended a reply with no usage, so the reply may be cut');
      yield { type: 'started', usage: toUsage(usage) };
      yield { type: 'finished', stopReason, refusalCategory: null, usage: toUsage(usage) };
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
  }

  return {
    name,
    stream,
    // OpenAI caches a long prompt by itself on the first real request, so there is nothing to warm.
    async warm() {},
    async compact() {
      return null;
    },
    getCostUsd({ inputTokens, outputTokens, cacheReadTokens }) {
      return (inputTokens * prices.input + cacheReadTokens * prices.cacheRead + outputTokens * prices.output) / TOKENS_PER_MILLION;
    },
  };
}
