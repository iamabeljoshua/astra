import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRouteFromText, getVerdictFromText } from '../scenes/model-replies.ts';
import { getPlanFromText } from '../scenes/lesson/lesson-plan.ts';
import type { LessonPlanner, SceneBrief, SceneRepair, SceneReviewer, SceneRouter, SceneUsage, SceneWriter, UsageListener } from '../scenes/scene-types.ts';

const PROMPTS = join(import.meta.dirname, '../scenes/prompts');
const readPrompt = (name: string) => readFileSync(join(PROMPTS, name), 'utf8');

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FAST_BETA = 'fast-mode-2026-02-01';
const TOKENS_PER_MILLION = 1_000_000;
const WRITER_TOKENS = 20_000;
const REVIEWER_TOKENS = 4000;
const PLANNER_TOKENS = 1500;
const ROUTER_TOKENS = 120;
const CODE_BLOCK = /```(?:python|py)?\s*\n([\s\S]*?)```/;

/** Dollars per million tokens, from the Claude API skill's table, read 4 November 2026. */
const SETTINGS = {
  opusFast: { model: 'claude-opus-5-5', prices: { input: 8, cacheWrite: 10, cacheRead: 0.4, output: 40 }, request: { speed: 'fast', output_config: { effort: 'low' }, fallbacks: 'default' }, betas: [FAST_BETA, FALLBACK_BETA] },
  sonnetFast: { model: 'claude-sonnet-5-5', prices: { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 }, request: { thinking: { type: 'between_tools' }, output_config: { effort: 'low' }, fallbacks: 'default' }, betas: [FALLBACK_BETA] },
  sonnetReview: { model: 'claude-sonnet-5-5', prices: { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 }, request: { output_config: { effort: 'low' }, fallbacks: 'default' }, betas: [FALLBACK_BETA] },
  haiku: { model: 'claude-haiku-5-5', prices: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 }, request: { thinking: { type: 'disabled' }, output_config: { effort: 'low' } }, betas: [] },
} as const;

type SettingName = keyof typeof SETTINGS;
type UserContent = string | Anthropic.Beta.Messages.BetaContentBlockParam[];

interface ModelCall {
  setting: SettingName;
  system: string;
  user: UserContent;
  maxTokens: number;
  signal: AbortSignal;
}

function getCostUsd(setting: SettingName, usage: Anthropic.Beta.Messages.BetaUsage): number {
  const { prices } = SETTINGS[setting];
  const dollars = (usage.input_tokens ?? 0) * prices.input + (usage.cache_read_input_tokens ?? 0) * prices.cacheRead + (usage.cache_creation_input_tokens ?? 0) * prices.cacheWrite + (usage.output_tokens ?? 0) * prices.output;
  return dollars / TOKENS_PER_MILLION;
}

function getReplyText(message: Anthropic.Beta.Messages.BetaMessage): string {
  if (message.stop_reason === 'refusal') throw new Error(`the model refused: ${message.stop_details?.category ?? 'no category'}`);
  if (message.stop_reason === 'max_tokens') throw new Error('the model ran out of tokens');
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
}

function toSceneMessage({ topic, narration, plan, moments, durationSeconds }: SceneBrief, repair: SceneRepair | null): string {
  const lines = Object.entries(moments).map(([id, seconds]) => `- ${id} at ${seconds.toFixed(2)}s`).join('\n');
  const base = `Topic: ${topic}\n\nThe tutor says this, with [[moment]] marks on the word each visual belongs to:\n${narration}\n\nWhat each moment should show:\n${plan}\n\nMoments, with their times for this take. Never hard-code these times, always refer to the moment by name:\n${lines}\nScene length: ${durationSeconds.toFixed(1)}s.`;
  return repair ? `${base}\n\nA previous attempt was rejected. Fix these problems and return the whole scene again.\nProblems:\n${repair.problems.join('\n')}\n\nPrevious attempt:\n${repair.code}` : base;
}

export interface SceneModels {
  writer: SceneWriter;
  fallbackWriter: SceneWriter;
  reviewer: SceneReviewer;
  router: SceneRouter;
  planner: LessonPlanner;
}

// Each role has its own small interface, so Abel can move one to another vendor without touching the others.
export function makeAnthropicSceneModels({ apiKey, onUsage }: { apiKey: string; onUsage?: UsageListener }): SceneModels {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const writerSystem = `${readPrompt('writer.md')}\n\n${readPrompt('truth-kit.md')}`;

  const call = async ({ setting, system, user, maxTokens, signal }: ModelCall): Promise<{ text: string } & SceneUsage> => {
    const { model, request, betas } = SETTINGS[setting];
    const startedAt = performance.now();
    const params = { model, max_tokens: maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }], betas, ...request } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming;
    const message = await client.beta.messages.stream(params, { signal }).finalMessage();
    return { text: getReplyText(message), model: message.model, ms: performance.now() - startedAt, costUsd: getCostUsd(setting, message.usage) };
  };

  const makeWriter = (name: string, setting: SettingName): SceneWriter => ({
    name,
    async write(brief, repair, signal) {
      const reply = await call({ setting, system: writerSystem, user: toSceneMessage(brief, repair), maxTokens: WRITER_TOKENS, signal });
      onUsage?.({ role: 'writer', model: reply.model, ms: reply.ms, costUsd: reply.costUsd });
      return { code: (reply.text.match(CODE_BLOCK)?.[1] ?? reply.text).trim(), model: reply.model, ms: reply.ms, costUsd: reply.costUsd };
    },
  });

  return {
    writer: makeWriter('opus-5-5-low-fast', 'opusFast'),
    fallbackWriter: makeWriter('sonnet-5-5-low', 'sonnetFast'),
    reviewer: {
      async review({ brief, code, sheets }, signal) {
        const images = sheets.map((sheet): Anthropic.Beta.Messages.BetaContentBlockParam => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: sheet.toString('base64') } }));
        const text = `Topic: ${brief.topic}\n\nThe tutor says, with [[moment]] marks:\n${brief.narration}\n\nMoments, in seconds on this take: ${JSON.stringify(brief.moments)}\n\nThe scene's code, so you can read what it really does. Check directions, geometry, and numbers in the code against what the frames and the words claim:\n${code}`;
        const reply = await call({ setting: 'sonnetReview', system: readPrompt('reviewer.md'), user: [...images, { type: 'text', text }], maxTokens: REVIEWER_TOKENS, signal });
        onUsage?.({ role: 'reviewer', model: reply.model, ms: reply.ms, costUsd: reply.costUsd });
        return { ...getVerdictFromText(reply.text), model: reply.model, ms: reply.ms, costUsd: reply.costUsd };
      },
    },
    router: {
      async route(request, signal) {
        const reply = await call({ setting: 'haiku', system: readPrompt('router.md'), user: request, maxTokens: ROUTER_TOKENS, signal });
        onUsage?.({ role: 'router', model: reply.model, ms: reply.ms, costUsd: reply.costUsd });
        return { ...getRouteFromText(reply.text), model: reply.model, ms: reply.ms, costUsd: reply.costUsd };
      },
    },
    planner: {
      async plan(topic, signal) {
        const reply = await call({ setting: 'sonnetFast', system: readPrompt('planner.md'), user: `Topic: ${topic}`, maxTokens: PLANNER_TOKENS, signal });
        onUsage?.({ role: 'planner', model: reply.model, ms: reply.ms, costUsd: reply.costUsd });
        return { ...getPlanFromText(reply.text), model: reply.model, ms: reply.ms, costUsd: reply.costUsd };
      },
    },
  };
}
