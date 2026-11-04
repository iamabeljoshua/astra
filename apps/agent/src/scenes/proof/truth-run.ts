import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { makeScene } from '../make-scene.ts';
import { createContainerWorker } from '../render-worker.ts';
import { createSceneStore, getSceneKey } from '../scene-store.ts';
import { createProofLedger } from './proof-ledger.ts';

const { values: args } = parseArgs({ options: { store: { type: 'string' }, ledger: { type: 'string' }, narrations: { type: 'string' }, out: { type: 'string' }, limit: { type: 'string', default: '5.5' } } });
if (!args.store || !args.ledger || !args.narrations || !args.out) throw new Error('Name --store, --ledger, --narrations, and --out');

const TOPICS = { moon: 'why-the-moon-has-phases', heart: 'a-beating-heart', blackhole: 'how-a-black-hole-bends-light', seasons: 'why-earth-has-seasons-axial-tilt', efield: 'electric-field-lines-around-charges', fourier: 'fourier-series-building-a-square-wave', mitosis: 'mitosis-how-a-cell-divides', pythagoras: 'the-pythagorean-theorem-by-rearranging-areas', dna: 'dna-replication' };

mkdirSync(args.store, { recursive: true });
const ledger = createProofLedger(args.ledger, Number(args.limit));
const models = makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ledger.onUsage });
const store = createSceneStore(args.store);
const worker = createContainerWorker({ namePrefix: 'astra-m3-14-truth' });
const rows: object[] = [];
for (const [key, file] of Object.entries(TOPICS)) {
  ledger.assertRoom();
  const narration = JSON.parse(readFileSync(join(args.narrations, `${file}.json`), 'utf8')) as { topic: string; marked: string; plan: string };
  const plan = { opening: [], setup: 'Watch closely.', narration: narration.marked, plan: narration.plan, close: 'What do you notice?' };
  const made = await makeScene({ writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker, store }, { topic: narration.topic, plan });
  const saved = store.find(getSceneKey(narration.topic));
  rows.push({ key, topic: narration.topic, isOk: made.isOk, reasons: made.isOk ? [] : made.reasons, sceneId: saved?.id ?? null, status: saved?.status ?? 'none', trace: saved?.trace ?? null, takeBytes: saved?.takeBytes ?? null });
  writeFileSync(args.out, JSON.stringify({ spentUsd: ledger.getSpentUsd(), rows }, null, 1));
  console.log(JSON.stringify({ key, isOk: made.isOk, status: saved?.status, writer: saved?.trace.writer, attempts: saved?.trace.attempts, totalMs: Math.round(saved?.trace.totalMs ?? 0), costUsd: saved?.trace.costUsd, reasons: (made.isOk ? [] : made.reasons).map((reason) => reason.slice(0, 160)) }));
}
