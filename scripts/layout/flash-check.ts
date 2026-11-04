import type { Page } from 'playwright';

interface Verdict {
  failures: string[];
  lines: string[];
}

export async function runFlashCheck(_page: Page, _verdict: Verdict): Promise<void> {}
