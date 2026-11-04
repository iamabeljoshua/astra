import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readKey } from '../../lab/keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { createProofLedger } from './proof-ledger.ts';

const { values: args } = parseArgs({ options: { labels: { type: 'string' }, ledger: { type: 'string' }, out: { type: 'string' }, limit: { type: 'string', default: '5.5' } } });
if (!args.labels || !args.ledger || !args.out) throw new Error('Name --labels, --ledger, and --out');

const ledger = createProofLedger(args.ledger, Number(args.limit));
const { router } = makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ledger.onUsage });
const { requests } = JSON.parse(readFileSync(args.labels, 'utf8')) as { requests: { id: number; text: string; engine: string }[] };
const rows = [];
for (const { id, text, engine } of requests) {
  const route = await router.route(text, AbortSignal.timeout(20_000)).catch((error: unknown) => ({ engine: 'none', kind: `failed: ${String(error)}`, topic: '', ms: 0, costUsd: 0 }));
  rows.push({ id, text, want: engine, got: route.engine, kind: route.kind, topic: route.topic, ms: Math.round(route.ms), costUsd: route.costUsd });
}
const wrong = rows.filter((row) => row.got !== row.want);
const sorted = rows.map((row) => row.ms).sort((first, second) => first - second);
const summary = { total: rows.length, right: rows.length - wrong.length, sceneWhenNoneWanted: wrong.filter((row) => row.want === 'none').length, noSceneWhenWanted: wrong.filter((row) => row.got === 'none').length, medianMs: sorted[rows.length >> 1], p95Ms: sorted[Math.floor(rows.length * 0.95)], costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0), wrong };
writeFileSync(args.out, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
