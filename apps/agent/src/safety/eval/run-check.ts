import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicSafetyCheck } from '../safety-check.ts';
import { isSafetyKind } from '../student-reading.ts';

interface Wording {
  id: string;
  expect: string;
  group: string;
  text: string;
  after?: string;
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const SHOULD_FIRE = new Set(['help', 'crisis_with_help_word']);

interface ContextRow {
  id: string;
  group: string;
  lesson?: string;
  expect: 'none' | 'fires' | 'clear';
  studentSaid: string;
  tutorSaid: string;
  text: string;
}
const { values: args } = parseArgs({ options: { reps: { type: 'string', default: '2' }, workers: { type: 'string', default: '4' } } });

const getPercentile = (values: number[], fraction: number) => [...values].sort((first, second) => first - second)[Math.floor(values.length * fraction)] ?? null;

const wordings = (JSON.parse(readFileSync(join(EVAL_FOLDER, 'safety-wordings.json'), 'utf8')) as Wording[]).filter((wording) => wording.expect !== 'school' && wording.group !== 'in-lesson');
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
const fired = rows.filter(({ reading }) => isSafetyKind(reading) || reading === 'vague');
const shouldFire = rows.filter(({ wording }) => SHOULD_FIRE.has(wording.expect));
const misses = shouldFire.filter((row) => !fired.includes(row));
const falseAlarms = fired.filter(({ wording }) => !SHOULD_FIRE.has(wording.expect));
console.log(`fired ${shouldFire.length - misses.length} of ${shouldFire.length} that should fire; false alarms ${falseAlarms.length} of ${rows.length - shouldFire.length}; unread ${rows.filter(({ reading }) => reading === 'unread').length}`);
for (const { wording } of rows.filter(({ reading }) => reading === 'unread')) console.log(`UNREAD ${wording.id}: ${wording.text}`);
for (const { wording, reading } of misses) console.log(`MISS ${wording.id} (${reading}): ${wording.text}`);
for (const { wording, reading } of falseAlarms) console.log(`FALSE ${wording.id} (${reading}): ${wording.text}`);

// Fixed lines, so this part spends nothing on the tutor. The watch excuses `vague` in a school talk, so it is no stop here.
const contextRows = JSON.parse(readFileSync(join(EVAL_FOLDER, 'safety-context.json'), 'utf8')) as ContextRow[];
const contextQueue = contextRows.flatMap((row) => Array.from({ length: Number(args.reps) }, () => row));
const contextReads: { row: ContextRow; reading: string; fits: boolean | null }[] = [];
const workOnContext = async () => {
  for (let row = contextQueue.shift(); row; row = contextQueue.shift()) {
    const reading = await check.readStudent(row.text, row);
    contextReads.push({ row, reading, fits: isSafetyKind(reading) && row.studentSaid !== '' ? await check.fitsSchoolTalk(row.text, row) : null });
  }
};
await Promise.all(Array.from({ length: Number(args.workers) }, workOnContext));
const isStopped = ({ reading, fits }: (typeof contextReads)[number]) => isSafetyKind(reading) && fits !== true;
for (const group of new Set(contextRows.map((row) => row.group))) {
  const reads = contextReads.filter(({ row }) => row.group === group);
  console.log(`${group}: ${reads.length} reads, ${reads.filter(isStopped).length} stop, ${reads.filter(({ reading }) => reading === 'vague').length} vague, ${reads.filter(({ reading }) => reading === 'school' || reading === 'none').length} quiet`);
}
for (const read of contextReads.filter((candidate) => (candidate.row.expect === 'none' ? isStopped(candidate) : !isStopped(candidate) && candidate.reading !== 'vague'))) console.log(`${read.row.expect === 'none' ? 'FALSE' : 'MISS'} ${read.row.id} (${read.reading}): ${read.row.text}`);
console.log(`check p50 ${Math.round(getPercentile(timesMs, 0.5) ?? 0)} ms, p95 ${Math.round(getPercentile(timesMs, 0.95) ?? 0)} ms, spend $${spentUsd.toFixed(5)}`);
