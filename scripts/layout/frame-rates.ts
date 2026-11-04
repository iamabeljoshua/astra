import type { DeckBrowser } from './deck-server.ts';

interface Verdict {
  failures: string[];
  lines: string[];
}

export async function runFrameRates(_browser: DeckBrowser, _url: string, _options: { outFolder: string; scenes?: readonly string[] }, _verdict: Verdict): Promise<void> {}
