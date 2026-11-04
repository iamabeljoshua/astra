import Anthropic from '@anthropic-ai/sdk';
import { type CompactedHistory, type FindSource, type ModelEvent, ModelRejectedError, type ModelStopReason, type ModelUsage, type TutorModelAdapter, type TutorModelRequest, type TutorTurn } from './types.ts';

interface ModelSettings {
  id: 'claude-sonnet-5-5' | 'claude-opus-5-5' | 'claude-haiku-5-5';
  /** Dollars per million tokens, from Anthropic's pricing page, read 4 November 2026. */
  prices: { input: number; cacheWrite: number; cacheRead: number; output: number };
  request: Pick<Anthropic.Beta.Messages.MessageCreateParamsStreaming, 'thinking' | 'output_config'> & { fallbacks?: 'default' };
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const COMPACTION_BETA = 'compact-2026-09-04';
const MAX_REPLY_TOKENS = 1000;
const MAX_SUMMARY_TOKENS = 4000;
const TOKENS_PER_MILLION = 1_000_000;
/** The request itself, or the key, is at fault, so sending it again fails the same way. */
const PERMANENT_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 413, 422]);

// Sonnet turns thinking off with between_tools, because disabled is a 400, and Opus cannot turn it off.
const MODEL_SETTINGS = {
  'sonnet-5-5': { id: 'claude-sonnet-5-5', prices: { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 }, request: { thinking: { type: 'between_tools' }, output_config: { effort: 'low' }, fallbacks: 'default' } },
  'opus-5-5': { id: 'claude-opus-5-5', prices: { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 }, request: { output_config: { effort: 'low' }, fallbacks: 'default' } },
  'haiku-5-5': { id: 'claude-haiku-5-5', prices: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 }, request: { thinking: { type: 'disabled' }, output_config: { effort: 'low' } } },
} as const satisfies Record<string, ModelSettings>;

export type TutorModelName = keyof typeof MODEL_SETTINGS;

export const TUTOR_MODEL_NAMES = Object.keys(MODEL_SETTINGS) as TutorModelName[];

function toUsage(usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): ModelUsage {
  return { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, cacheReadTokens: usage.cache_read_input_tokens ?? 0, cacheWriteTokens: usage.cache_creation_input_tokens ?? 0 };
}

function toStopReason(reason: string | null): ModelStopReason {
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'finished';
  if (reason === 'max_tokens') return 'lengthLimit';
  return reason === 'refusal' ? 'refused' : 'other';
}

type ApiMessage = Anthropic.Beta.Messages.BetaMessageParam;

function toApiMessage(turn: TutorTurn): ApiMessage {
  if (turn.role === 'summary') return { role: 'assistant', content: [turn.summary as Anthropic.Beta.Messages.BetaCompactionBlockParam] };
  return { role: turn.role, content: turn.text } as ApiMessage;
}

// The API takes a system message only after a user turn, so a note and a correction in the same place travel as one.
function toApiMessages(turns: readonly TutorTurn[]): ApiMessage[] {
  const merged: TutorTurn[] = [];
  for (const turn of turns) {
    const last = merged.at(-1);
    if (turn.role === 'system' && last?.role === 'system') merged[merged.length - 1] = { role: 'system', text: `${last.text}\n${turn.text}` };
    else merged.push(turn);
  }
  return merged.map(toApiMessage);
}

function toFrozenSystem(system: string): Anthropic.Beta.Messages.BetaTextBlockParam[] {
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

function getIsAbort(signal: AbortSignal, error: unknown): boolean {
  return signal.aborted || error instanceof Anthropic.APIUserAbortError;
}

export function makeAnthropicTutorModel({ name = 'sonnet-5-5', apiKey, thinking }: { name?: TutorModelName; apiKey: string; thinking?: 'adaptive' }): TutorModelAdapter {
  const chosen: ModelSettings = MODEL_SETTINGS[name];
  const settings: ModelSettings = thinking ? { ...chosen, request: { ...chosen.request, thinking: { type: thinking } } } : chosen;
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const { fallbacks, ...thinkingAndEffort } = settings.request;
  // A request that sends a compaction block back needs its beta.
  const betas = fallbacks ? [FALLBACK_BETA, COMPACTION_BETA] : [COMPACTION_BETA];
  const fallbackFields = fallbacks ? { fallbacks } : {};

  async function* stream({ system, turns }: TutorModelRequest, signal: AbortSignal): AsyncGenerator<ModelEvent> {
    const messageStream = client.beta.messages.stream(
      { model: settings.id, max_tokens: MAX_REPLY_TOKENS, system: toFrozenSystem(system), cache_control: { type: 'ephemeral' }, messages: toApiMessages(turns), betas, ...thinkingAndEffort, ...fallbackFields },
      { signal },
    );
    let isNewBlock = false;
    try {
      for await (const event of messageStream) {
        if (event.type === 'message_start') yield { type: 'started', usage: toUsage(event.message.usage) };
        if (event.type === 'content_block_start' && event.content_block.type === 'text') isNewBlock = true;
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text, isNewBlock };
          isNewBlock = false;
        }
      }
      const final = await messageStream.finalMessage();
      yield { type: 'finished', stopReason: toStopReason(final.stop_reason), refusalCategory: final.stop_details?.category ?? null, usage: toUsage(final.usage) };
    } catch (error) {
      if (getIsAbort(signal, error)) return;
      if (error instanceof Anthropic.APIError && PERMANENT_STATUSES.has(error.status as number)) throw new ModelRejectedError(error.message);
      throw error;
    }
  }

  return {
    name,
    stream,
    // The same thinking and effort as a real turn, because both are part of what the cache matches.
    async warm(system) {
      await client.beta.messages.create({ model: settings.id, max_tokens: 0, system: toFrozenSystem(system), messages: [{ role: 'user', content: 'warmup' }], betas, ...thinkingAndEffort });
    },
    async compact({ system, turns }, signal): Promise<CompactedHistory | null> {
      const summary = await client.beta.messages.create(
        { model: settings.id, max_tokens: MAX_SUMMARY_TOKENS, system: toFrozenSystem(system), messages: toApiMessages(turns), compaction: { type: 'summarize' }, betas: [COMPACTION_BETA], ...thinkingAndEffort },
        { signal },
      );
      if (summary.stop_reason !== 'compaction') return null;
      const iterations = summary.usage.iterations ?? [];
      const usage = iterations.map(toUsage).reduce((sum, part) => ({ inputTokens: sum.inputTokens + part.inputTokens, outputTokens: sum.outputTokens + part.outputTokens, cacheReadTokens: sum.cacheReadTokens + part.cacheReadTokens, cacheWriteTokens: sum.cacheWriteTokens + part.cacheWriteTokens }), toUsage({}));
      return { summary: summary.content[0], usage };
    },
    getCostUsd({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }) {
      const { input, output, cacheRead, cacheWrite } = settings.prices;
      return (inputTokens * input + outputTokens * output + cacheReadTokens * cacheRead + cacheWriteTokens * cacheWrite) / TOKENS_PER_MILLION;
    },
  };
}

export interface PictureReader {
  read(request: { png: Buffer; prompt: string; schema: Record<string, unknown>; timeoutMs: number }): Promise<{ answer: unknown; costUsd: number }>;
}

const PICTURE_MODEL = MODEL_SETTINGS['haiku-5-5'];
const PICTURE_MOST_TOKENS = 400;
const TOKENS_PER_PRICE = 1_000_000;

export function makeAnthropicPictureReader({ apiKey }: { apiKey: string }): PictureReader {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return {
    async read({ png, prompt, schema, timeoutMs }) {
      const message = await client.beta.messages.create(
        {
          model: PICTURE_MODEL.id,
          max_tokens: PICTURE_MOST_TOKENS,
          thinking: { type: 'disabled' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } }, { type: 'text', text: prompt }] }],
        },
        { timeout: timeoutMs },
      );
      const text = message.content.find((block) => block.type === 'text')?.text ?? '{}';
      const { input, output } = PICTURE_MODEL.prices;
      return { answer: JSON.parse(text) as unknown, costUsd: (message.usage.input_tokens * input + message.usage.output_tokens * output) / TOKENS_PER_PRICE };
    },
  };
}

/** Reference and science sites a school would point a student at. The API refuses a request naming a site its crawler cannot read, so a new site needs one real call. */
const TRUSTED_SITES = ['nasa.gov', 'noaa.gov', 'nih.gov', 'cdc.gov', 'who.int', 'britannica.com', 'khanacademy.org', 'openstax.org', 'nationalgeographic.com', 'si.edu', 'nature.com', 'wikipedia.org'];
const SEARCH_TOOL = 'web_search_20250305';
const SEARCH_MAX_TOKENS = 600;
const SEARCH_TIMEOUT_MS = 6000;
const LONGEST_SOURCE_TITLE = 100;
/** The listed price, $10 for a thousand searches. */
const USD_PER_SEARCH = 0.01;
const NOT_IN_A_TITLE = /\p{Cc}|\p{Cf}|[<>{}]/gu;

const toMessageCost = ({ input_tokens: input, output_tokens: output }: { input_tokens: number; output_tokens: number }, prices: ModelSettings['prices']) => (input * prices.input + output * prices.output) / TOKENS_PER_MILLION;

function readFirstHit(content: readonly Anthropic.ContentBlock[]): { title: string; url: string } | null {
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    const [hit] = block.content;
    if (hit) return { title: hit.title, url: hit.url };
  }
  return null;
}

export function makeAnthropicSourceFinder({ apiKey, onFailed }: { apiKey: string; onFailed?(problem: string): void }): FindSource {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: SEARCH_TIMEOUT_MS });
  const { id, prices } = MODEL_SETTINGS['haiku-5-5'];
  return async (claim, signal) => {
    try {
      const response = await client.messages.create(
        { model: id, max_tokens: SEARCH_MAX_TOKENS, thinking: { type: 'disabled' }, tools: [{ type: SEARCH_TOOL, name: 'web_search', max_uses: 1, allowed_domains: TRUSTED_SITES }], messages: [{ role: 'user', content: `Search once for a page that supports this claim, then stop: ${claim}` }] },
        { signal },
      );
      const costUsd = USD_PER_SEARCH + toMessageCost(response.usage, prices);
      const hit = readFirstHit(response.content);
      return hit ? { found: true, title: hit.title.replace(NOT_IN_A_TITLE, '').slice(0, LONGEST_SOURCE_TITLE), site: new URL(hit.url).hostname.replace(/^www\./, ''), url: hit.url, costUsd } : { found: false, costUsd };
    } catch (error) {
      onFailed?.(String(error));
      return { found: false, costUsd: 0 };
    }
  };
}

export interface PlainAnswer {
  text: string;
  costUsd: number;
}

/** One plain request with no streaming, for a program that judges or plays a part in an evaluation. */
export function makeAnthropicAsker({ name, apiKey }: { name: TutorModelName; apiKey: string }) {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const { id, prices } = MODEL_SETTINGS[name];
  return async ({ system, messages, maxTokens }: { system: string; messages: Anthropic.MessageParam[]; maxTokens: number }): Promise<PlainAnswer> => {
    const reply = await client.messages.create({ model: id, max_tokens: maxTokens, system, messages });
    return { text: reply.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n').trim(), costUsd: toMessageCost(reply.usage, prices) };
  };
}
