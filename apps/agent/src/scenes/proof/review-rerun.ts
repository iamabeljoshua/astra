import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readKey } from '../../lab/keys.ts';
import { makeAnthropicSceneModels, type ReviewPass } from '../../providers/anthropic.scenes.ts';
import type { SceneBrief } from '../scene-types.ts';
import { createSpendLedger } from './spend-ledger.ts';

const { values: args } = parseArgs({ options: { cases: { type: 'string' }, effort: { type: 'string', default: 'both' }, ledger: { type: 'string' }, out: { type: 'string' }, limit: { type: 'string', default: '5.5' } } });
if (!args.cases || !args.ledger || !args.out) throw new Error('Name --cases, --ledger, and --out');

interface ReviewCase {
  id: string;
  /** Pass means this scene is known to be true, and fail means a person or a planted error says it is not. */
  want: 'pass' | 'fail';
  brief: SceneBrief;
  code: string;
  sheets: string[];
}

// Runs the reviewer alone on scenes whose truth is already known, so a setting can be judged on what it catches and what it wrongly stops.
const REVIEW_PASSES: Record<string, ReviewPass[]> = { low: ['reviewQuick'], high: ['reviewCareful'], both: ['reviewQuick', 'reviewCareful'] };
const ledger = createSpendLedger({ path: args.ledger, limitUsd: Number(args.limit), note: `review ${args.effort}` });
const { reviewer } = makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ledger.onUsage, reviewPasses: REVIEW_PASSES[args.effort as string] });
const cases = JSON.parse(readFileSync(args.cases, 'utf8')) as ReviewCase[];
const rows = [];
for (const { id, want, brief, code, sheets } of cases) {
  const verdict = await reviewer.review({ brief, code, sheets: sheets.map((path) => readFileSync(path)) }, AbortSignal.timeout(120_000)).catch((error: unknown) => ({ isPass: false, errors: [{ what: `no verdict: ${String(error)}` }], ms: 0, costUsd: 0 }));
  rows.push({ id, want, got: verdict.isPass ? 'pass' : 'fail', ms: Math.round(verdict.ms), costUsd: verdict.costUsd, errors: verdict.errors.map(({ what }) => what.slice(0, 200)) });
  console.log(JSON.stringify(rows.at(-1)).slice(0, 300));
}
const sorted = rows.map((row) => row.ms).sort((first, second) => first - second);
const summary = { effort: args.effort, total: rows.length, caught: rows.filter((row) => row.want === 'fail' && row.got === 'fail').length, missed: rows.filter((row) => row.want === 'fail' && row.got === 'pass').map((row) => row.id), wronglyStopped: rows.filter((row) => row.want === 'pass' && row.got === 'fail').map((row) => row.id), passedTrue: rows.filter((row) => row.want === 'pass' && row.got === 'pass').length, medianMs: sorted[rows.length >> 1], costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0) };
writeFileSync(args.out, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
