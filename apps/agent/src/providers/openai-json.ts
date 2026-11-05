import type { JsonReader } from './anthropic.ts';

const OPENAI_URL = 'https://api.openai.com/v1';
const TOKENS_PER_MILLION = 1_000_000;
/** Dollars per million tokens, from OpenAI's model page, read 5 November 2026. */
const PRICES = { input: 0.75, cacheRead: 0.075, output: 4.5 };
const MODEL = 'gpt-5.4-mini';

interface JsonReply {
  choices: readonly { message: { content: string | null } }[];
  usage: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } };
}

export function makeOpenAiJsonReader({ apiKey }: { apiKey: string }): JsonReader {
  return {
    async read({ system, text, schema, timeoutMs, mostTokens }) {
      const response = await fetch(`${process.env.OPENAI_BASE_URL ?? OPENAI_URL}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, reasoning_effort: 'none', max_completion_tokens: mostTokens, response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema } }, messages: [{ role: 'system', content: system }, { role: 'user', content: text }] }),
      });
      if (!response.ok) throw new Error(`OpenAI answered ${response.status}`);
      const { choices, usage } = (await response.json()) as JsonReply;
      const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
      const costUsd = ((usage.prompt_tokens - cached) * PRICES.input + cached * PRICES.cacheRead + usage.completion_tokens * PRICES.output) / TOKENS_PER_MILLION;
      return { answer: JSON.parse(choices[0]?.message.content ?? '{}') as unknown, costUsd };
    },
  };
}
