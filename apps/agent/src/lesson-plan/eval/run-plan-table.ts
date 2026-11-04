import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicJsonReader, type JsonReader } from '../../providers/anthropic.ts';
import { askPlanner, type PlanAsk } from '../ask-planner.ts';
import { createLessonPlanner } from '../lesson-planner.ts';

interface PlanRow {
  says: string;
  now: string | null;
  earlier?: string[];
  move: 'stay' | 'new' | 'back';
  kind?: 'handsOn' | 'teachFirst';
  topic?: string;
  /** Its exercises must be in words. */
  noWorking?: boolean;
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const DAILY_LIMIT_USD = 3;
const IS_MATH_EXERCISE = /[=+×÷^]|\b(?:solve|calculate|compute|equation)\b/i;

const { values: args } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, session: { type: 'string', default: 'turns-30' } } });

const readRows = <Row>(name: string) => JSON.parse(readFileSync(join(EVAL_FOLDER, name), 'utf8')) as Row[];

function getPercentile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
}

async function runRow(reader: JsonReader, row: PlanRow) {
  const startedAtMs = performance.now();
  const ask: PlanAsk = { now: row.now, earlier: row.earlier ?? [], said: row.says };
  const { move, costUsd } = await askPlanner(reader, ask);
  const problems: string[] = [];
  if (move?.move !== row.move) problems.push(`move ${move?.move ?? 'none'}, wanted ${row.move}`);
  if (move?.move === 'new' && row.kind && move.plan.kind !== row.kind) problems.push(`kind ${move.plan.kind}, wanted ${row.kind}`);
  if (move?.move === 'back' && move.topic !== row.topic) problems.push(`back to ${move.topic}, wanted ${row.topic}`);
  if (move?.move === 'new' && row.noWorking && move.plan.steps.some(({ exercise }) => IS_MATH_EXERCISE.test(exercise))) problems.push('math in a subject with no working');
  return { row, move, costUsd, ms: performance.now() - startedAtMs, problems };
}

// A whole lesson's messages through the same planner a room uses, for what it costs a session.
async function runSession(reader: JsonReader, name: string) {
  const messages = readRows<{ text: string }>(`${name}.json`).map(({ text }) => text);
  let calls = 0;
  let usd = 0;
  const durations: number[] = [];
  const titles: string[] = [];
  const planner = createLessonPlanner({
    ask: (request) => askPlanner(reader, request),
    canSpend: () => true,
    charge(cost) {
      calls += 1;
      usd += cost;
    },
    onTitleChange: (title) => titles.push(title),
    trace: (traceName, fields) => {
      if (traceName === 'planAnswered') durations.push(fields?.ms as number);
      if (traceName === 'planFailed') console.log(`  plan failed: ${String(fields?.problem)}`);
    },
  });
  for (const [index, text] of messages.entries()) {
    planner.noteStudentWords(text, index === 0);
    await planner.whenSettled();
  }
  durations.sort((first, second) => first - second);
  console.log(`\n${name}: ${messages.length} messages, ${calls} plan calls, $${usd.toFixed(5)} a session, ${((usd / DAILY_LIMIT_USD) * 100).toFixed(2)}% of the $${DAILY_LIMIT_USD} daily limit, p50 ${getPercentile(durations, 0.5)} ms, p95 ${getPercentile(durations, 0.95)} ms`);
  console.log(`  titles: ${JSON.stringify(titles)}`);
  return usd;
}

async function main() {
  const rows = readRows<PlanRow>('plan-table.json');
  if (args['dry-run']) {
    console.log(`Loaded ${rows.length} rows. Nothing was sent.`);
    return;
  }
  const reader = makeAnthropicJsonReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
  const results = await Promise.all(rows.map((row) => runRow(reader, row).catch((error: unknown) => ({ row, move: null, costUsd: 0, ms: 0, problems: [`failed: ${String(error)}`] }))));
  for (const { row, move, ms, problems } of results) {
    const shown = move?.move === 'new' ? `new ${move.plan.kind} "${move.plan.topic}" ${JSON.stringify(move.plan.steps)}` : JSON.stringify(move);
    console.log(`${problems.length > 0 ? 'FAIL' : 'ok  '} ${Math.round(ms)} ms  ${row.says.slice(0, 60)}\n     ${shown}${problems.length > 0 ? `\n     ${problems.join('; ')}` : ''}`);
  }
  const durations = results.map(({ ms }) => Math.round(ms)).sort((first, second) => first - second);
  const failures = results.filter(({ problems }) => problems.length > 0);
  const rowUsd = results.reduce((sum, { costUsd }) => sum + costUsd, 0);
  console.log(`\n${results.length - failures.length} of ${results.length} rows right, p50 ${getPercentile(durations, 0.5)} ms, p95 ${getPercentile(durations, 0.95)} ms, most ${durations.at(-1)} ms, $${rowUsd.toFixed(5)}`);
  await runSession(reader, args.session);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
