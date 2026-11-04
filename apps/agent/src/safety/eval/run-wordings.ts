import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicTutorModel } from '../../providers/anthropic.ts';
import { createTutorBrain, type TurnSummary } from '../../tutor/brain.ts';
import { makeAnthropicSafetyCheck } from '../safety-check.ts';
import { createSafetyWatch, type SafetyFlag } from '../safety-watch.ts';
import { TUTOR_PROMPT } from '../../tutor/prompt.ts';
import { STAYING_SAFE_V1 } from '../../tutor/prompts/staying-safe-v1.ts';
import { STAYING_SAFE_V2 } from '../../tutor/prompts/staying-safe-v2.ts';
import { readReply, type SafetyExpect } from './read-reply.ts';

interface Wording {
  id: string;
  expect: SafetyExpect;
  group: string;
  lang: string;
  text: string;
  /** Sent first in the same session, for a wording whose meaning depends on the lesson before it. */
  after?: string;
  /** Asked after this long in the session, to see the tutor suggest a break. */
  minutesIn?: number;
}

const EVAL_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '../../../../../evals/tutor-turns');
const MS_PER_MINUTE = 60_000;
const PROFILE = { level: 'high_school', interests: ['basketball', 'space'], goal: 'exam' };

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'run' },
    reps: { type: 'string', default: '1' },
    knownReps: { type: 'string', default: '5' },
    expect: { type: 'string' },
    group: { type: 'string' },
    workers: { type: 'string', default: '3' },
    limit: { type: 'string', default: '1' },
    check: { type: 'string', default: 'on' },
    block: { type: 'string', default: 'v2' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const getPercentile = (values: number[], fraction: number) => [...values].sort((first, second) => first - second)[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? null;

function loadWordings(): { wording: Wording; rep: number }[] {
  const wordings = JSON.parse(readFileSync(join(EVAL_FOLDER, 'safety-wordings.json'), 'utf8')) as Wording[];
  const chosen = wordings.filter((wording) => (!args.expect || wording.expect === args.expect) && (!args.group || wording.group === args.group));
  return chosen.flatMap((wording) => Array.from({ length: Number(wording.group === 'known' ? args.knownReps : args.reps) }, (_, rep) => ({ wording, rep })));
}

function printCounts(rows: ReturnType<typeof readReply>[]): void {
  for (const name of new Set(rows.map((row) => `${row.expect}/${row.group}`))) {
    const members = rows.filter((row) => `${row.expect}/${row.group}` === name);
    console.log(`${name.padEnd(36)} ${members.filter((row) => row.passes).length} of ${members.length}`);
  }
  for (const row of rows.filter((candidate) => !candidate.passes)) console.log(`FAIL ${row.id}: ${row.problems.join(', ')}\n  S: ${row.text}\n  T: ${row.spoken}`);
  const firstTexts = rows.flatMap((row) => (row.firstTextMs === null ? [] : [row.firstTextMs]));
  const firstBeats = rows.flatMap((row) => (row.firstBeatMs === null ? [] : [row.firstBeatMs]));
  console.log(`first text p50 ${getPercentile(firstTexts, 0.5)} p95 ${getPercentile(firstTexts, 0.95)}; first beat p50 ${getPercentile(firstBeats, 0.5)} p95 ${getPercentile(firstBeats, 0.95)}`);
}

async function main(): Promise<void> {
  const queue = loadWordings();
  console.log(`Loaded ${queue.length} replies to run.`);
  if (args['dry-run']) return;
  const prompt = args.block === 'v1' ? { ...TUTOR_PROMPT, system: TUTOR_PROMPT.system.replace(STAYING_SAFE_V2, STAYING_SAFE_V1) } : TUTOR_PROMPT;
  const model = makeAnthropicTutorModel({ apiKey: readKey('ANTHROPIC_API_KEY') });
  await model.warm(prompt.system);
  const results = join(EVAL_FOLDER, 'results');
  mkdirSync(results, { recursive: true });
  const path = join(results, `safety-${args.label}.jsonl`);
  writeFileSync(path, '');
  const rows: ReturnType<typeof readReply>[] = [];
  let spentUsd = 0;
  const runOne = async ({ wording, rep }: { wording: Wording; rep: number }) => {
    const traces: string[] = [];
    let summary: TurnSummary | null = null;
    const flags: SafetyFlag[] = [];
    let helpShown = false;
    const safety = args.check === 'on'
      ? createSafetyWatch({ check: makeAnthropicSafetyCheck({ apiKey: readKey('ANTHROPIC_API_KEY'), onCost: (usd) => (spentUsd += usd) }), addFlag: async (flag) => void flags.push(flag), showHelp: () => (helpShown = true), trace: () => {} })
      : undefined;
    let msAhead = 0;
    const brain = createTutorBrain({ model, prompt, profile: PROFILE, getNowMs: () => performance.now() + msAhead, trace: (name) => traces.push(name), onTurnEnd: (ended) => (summary = ended), ...(safety ? { safety } : {}) });
    if (wording.after) for await (const beat of brain.reply({ text: wording.after }, new AbortController().signal)) void beat;
    msAhead = (wording.minutesIn ?? 0) * MS_PER_MINUTE;
    for await (const beat of brain.reply({ text: wording.text }, new AbortController().signal)) void beat;
    const ended = summary as unknown as TurnSummary;
    spentUsd += ended.costUsd;
    await safety?.flush();
    const row = readReply({ ...wording, rep, spoken: ended.spokenText, traces, endedAs: ended.endedAs, refusal: ended.refusalCategory, firstTextMs: ended.firstTextMs === null ? null : Math.round(ended.firstTextMs), firstBeatMs: ended.firstBeatMs === null ? null : Math.round(ended.firstBeatMs), costUsd: ended.costUsd, flags, helpShown });
    rows.push(row);
    appendFileSync(path, `${JSON.stringify(row)}\n`);
  };
  const work = async () => {
    for (let next = queue.shift(); next && spentUsd < Number(args.limit); next = queue.shift()) await runOne(next).catch((error: unknown) => console.log(`ERROR ${next?.wording.id}: ${String(error)}`));
  };
  await Promise.all(Array.from({ length: Number(args.workers) }, work));
  printCounts(rows);
  console.log(`spend $${spentUsd.toFixed(4)}, transcripts ${path}`);
}

await main();
