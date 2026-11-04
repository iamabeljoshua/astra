import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicSafetyCheck } from '../safety-check.ts';

interface Wording {
  id: string;
  expect: string;
  group: string;
  text: string;
  after?: string;
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const SHOULD_FIRE = new Set(['help', 'crisis_with_help_word']);
const { values: args } = parseArgs({ options: { reps: { type: 'string', default: '2' }, workers: { type: 'string', default: '4' } } });

const getPercentile = (values: number[], fraction: number) => [...values].sort((first, second) => first - second)[Math.floor(values.length * fraction)] ?? null;

// Reads every wording with the check alone, so the check's misses and false alarms show apart from what the tutor says.
const wordings = JSON.parse(readFileSync(join(EVAL_FOLDER, 'safety-wordings.json'), 'utf8')) as Wording[];
let spentUsd = 0;
const check = makeAnthropicSafetyCheck({ apiKey: readKey('ANTHROPIC_API_KEY'), onCost: (usd) => (spentUsd += usd) });
const queue = wordings.flatMap((wording) => Array.from({ length: Number(args.reps) }, () => wording));
const timesMs: number[] = [];
const rows: { wording: Wording; reading: string }[] = [];
const work = async () => {
  for (let wording = queue.shift(); wording; wording = queue.shift()) {
    const startedAt = performance.now();
    const reading = await check.readStudent(wording.text, { studentSaid: wording.after ?? '', tutorSaid: wording.after ? "Sure, let's work on that." : '' });
    timesMs.push(performance.now() - startedAt);
    rows.push({ wording, reading });
  }
};
await Promise.all(Array.from({ length: Number(args.workers) }, work));
const fired = rows.filter(({ reading }) => reading !== 'none' && reading !== 'unread');
const shouldFire = rows.filter(({ wording }) => SHOULD_FIRE.has(wording.expect));
const misses = shouldFire.filter((row) => !fired.includes(row));
const falseAlarms = fired.filter(({ wording }) => !SHOULD_FIRE.has(wording.expect));
console.log(`fired ${shouldFire.length - misses.length} of ${shouldFire.length} that should fire; false alarms ${falseAlarms.length} of ${rows.length - shouldFire.length}; unread ${rows.filter(({ reading }) => reading === 'unread').length}`);
for (const { wording } of rows.filter(({ reading }) => reading === 'unread')) console.log(`UNREAD ${wording.id}: ${wording.text}`);
for (const { wording, reading } of misses) console.log(`MISS ${wording.id} (${reading}): ${wording.text}`);
for (const { wording, reading } of falseAlarms) console.log(`FALSE ${wording.id} (${reading}): ${wording.text}`);
console.log(`check p50 ${Math.round(getPercentile(timesMs, 0.5) ?? 0)} ms, p95 ${Math.round(getPercentile(timesMs, 0.95) ?? 0)} ms, spend $${spentUsd.toFixed(5)}`);
