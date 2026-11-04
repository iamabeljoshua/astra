import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Spending {
  anthropicUsd: number;
  voiceCharacters: number;
}

/** A shared scene's play names the student, so one student cannot use up the project's day alone. */
type Charge = Partial<Spending> & { sharedPlayBy?: string };

/** The rate recorded in `docs/tests/scene-player.md`, 22 credits for 99 characters on Flash. */
const CREDITS_PER_CHARACTER = 22 / 99;

// Each charge is one appended line, because several processes share this file and a rewrite would lose some of their spending.
export function createSpendLedger(path: string, { limitUsd, limitCredits, getDay = () => new Date().toISOString().slice(0, 10) }: { limitUsd: number; limitCredits: number; getDay?(): string }) {
  // A line from before lines had a day counts as today, so a limit never reads low.
  const readToday = (): (Charge & { day?: string })[] => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : []).map((line) => JSON.parse(line) as Charge & { day?: string }).filter(({ day }) => day === undefined || day === getDay());
  const read = (): Spending => {
    return readToday().reduce<Spending>((sum, line) => ({ anthropicUsd: sum.anthropicUsd + (line.anthropicUsd ?? 0), voiceCharacters: sum.voiceCharacters + (line.voiceCharacters ?? 0) }), { anthropicUsd: 0, voiceCharacters: 0 });
  };
  const charge = (change: Charge) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ ...change, day: getDay() })}\n`);
  };
  const getCredits = (spending: Spending) => spending.voiceCharacters * CREDITS_PER_CHARACTER;
  return {
    charge,
    read: () => ({ ...read(), credits: getCredits(read()) }),
    isOverModelLimit: () => read().anthropicUsd >= limitUsd,
    isOverVoiceLimit: () => getCredits(read()) >= limitCredits,
    countSharedPlays: (studentId: string) => readToday().filter(({ sharedPlayBy }) => sharedPlayBy === studentId).length,
  };
}
