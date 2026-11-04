import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Spending {
  anthropicUsd: number;
  voiceCharacters: number;
}

/** ElevenLabs charged 22 credits for 99 characters on Flash, read from its `character-cost` header in M3.2. */
const CREDITS_PER_CHARACTER = 22 / 99;

// Several processes share this file, so each charge rereads it and none overwrites another's spending.
export function createSpendLedger(path: string, { limitUsd, limitCredits }: { limitUsd: number; limitCredits: number }) {
  const read = (): Spending => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Spending) : { anthropicUsd: 0, voiceCharacters: 0 });
  const charge = (change: Partial<Spending>) => {
    const spending = read();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ anthropicUsd: spending.anthropicUsd + (change.anthropicUsd ?? 0), voiceCharacters: spending.voiceCharacters + (change.voiceCharacters ?? 0) }));
  };
  const getCredits = (spending: Spending) => spending.voiceCharacters * CREDITS_PER_CHARACTER;
  return {
    charge,
    read: () => ({ ...read(), credits: getCredits(read()) }),
    isOverModelLimit: () => read().anthropicUsd >= limitUsd,
    isOverVoiceLimit: () => getCredits(read()) >= limitCredits,
  };
}
