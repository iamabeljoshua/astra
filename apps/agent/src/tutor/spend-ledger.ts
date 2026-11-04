import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Spending {
  anthropicUsd: number;
  voiceCharacters: number;
}

/** The rate recorded in `docs/tests/scene-player.md`, 22 credits for 99 characters on Flash. */
const CREDITS_PER_CHARACTER = 22 / 99;

// Each charge is one appended line, because several processes share this file and a rewrite would lose some of their spending.
export function createSpendLedger(path: string, { limitUsd, limitCredits }: { limitUsd: number; limitCredits: number }) {
  const read = (): Spending => {
    const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : [];
    return lines.map((line) => JSON.parse(line) as Partial<Spending>).reduce<Spending>((sum, line) => ({ anthropicUsd: sum.anthropicUsd + (line.anthropicUsd ?? 0), voiceCharacters: sum.voiceCharacters + (line.voiceCharacters ?? 0) }), { anthropicUsd: 0, voiceCharacters: 0 });
  };
  const charge = (change: Partial<Spending>) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(change)}\n`);
  };
  const getCredits = (spending: Spending) => spending.voiceCharacters * CREDITS_PER_CHARACTER;
  return {
    charge,
    read: () => ({ ...read(), credits: getCredits(read()) }),
    isOverModelLimit: () => read().anthropicUsd >= limitUsd,
    isOverVoiceLimit: () => getCredits(read()) >= limitCredits,
  };
}
