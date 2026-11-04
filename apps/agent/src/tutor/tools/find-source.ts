import Anthropic from '@anthropic-ai/sdk';

export type SourceAnswer = { found: true; title: string; site: string; url: string; costUsd: number } | { found: false; costUsd: number };

export type FindSource = (claim: string, signal: AbortSignal) => Promise<SourceAnswer>;

/** Reference and science sites a school would point a student at. A claim with no page here gets no source, and the tutor says so. */
const TRUSTED_SITES = ['nasa.gov', 'noaa.gov', 'nih.gov', 'cdc.gov', 'who.int', 'britannica.com', 'khanacademy.org', 'openstax.org', 'nationalgeographic.com', 'si.edu', 'nature.com', 'wikipedia.org'];
const SEARCH_MODEL = 'claude-haiku-5-5';
const SEARCH_TOOL = 'web_search_20250305';
const SEARCH_MAX_TOKENS = 600;
const SEARCH_TIMEOUT_MS = 6000;
const LONGEST_TITLE = 100;
/** Listed prices: $10 for a thousand searches, and Haiku's tokens. */
const USD_PER_SEARCH = 0.01;
const HAIKU_USD_PER_MILLION = { input: 0.1, output: 0.5 };
const NOT_SHOWN = /\p{Cc}|\p{Cf}|[<>{}]/gu;

const getSite = (url: string) => new URL(url).hostname.replace(/^www\./, '');

// Only the title and address reach the tutor, never the page, so nothing on a page can talk to the model.
function readFirstHit(content: readonly Anthropic.ContentBlock[]): { title: string; url: string } | null {
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    const [hit] = block.content;
    if (hit) return { title: hit.title, url: hit.url };
  }
  return null;
}

export function createSourceFinder({ apiKey, onFailed }: { apiKey: string; onFailed?(problem: string): void }): FindSource {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: SEARCH_TIMEOUT_MS });
  return async (claim, signal) => {
    try {
      const response = await client.messages.create(
        { model: SEARCH_MODEL, max_tokens: SEARCH_MAX_TOKENS, thinking: { type: 'disabled' }, tools: [{ type: SEARCH_TOOL, name: 'web_search', max_uses: 1, allowed_domains: TRUSTED_SITES }], messages: [{ role: 'user', content: `Search once for a page that supports this claim, then stop: ${claim}` }] },
        { signal },
      );
      const costUsd = USD_PER_SEARCH + (response.usage.input_tokens * HAIKU_USD_PER_MILLION.input + response.usage.output_tokens * HAIKU_USD_PER_MILLION.output) / 1_000_000;
      const hit = readFirstHit(response.content);
      return hit ? { found: true, title: hit.title.replace(NOT_SHOWN, '').slice(0, LONGEST_TITLE), site: getSite(hit.url), url: hit.url, costUsd } : { found: false, costUsd };
    } catch (error) {
      onFailed?.(String(error));
      return { found: false, costUsd: 0 };
    }
  };
}
