import type { Page } from 'playwright';

interface Verdict {
  failures: string[];
  lines: string[];
}

export async function makeDeckSheets(_page: Page, _outFolder: string, _verdict: Verdict): Promise<void> {}
