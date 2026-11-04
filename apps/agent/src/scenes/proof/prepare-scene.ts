import { getPlanNames } from '../content-check.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { makeScene } from '../make-scene.ts';
import { createContainerWorker } from '../render-worker.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore, getSceneKey } from '../scene-store.ts';
import type { LessonPlan } from '../scene-types.ts';
import { createProofLedger } from './proof-ledger.ts';

const { values: args } = parseArgs({
  options: {
    topic: { type: 'string' },
    planFile: { type: 'string' },
    force: { type: 'boolean', default: false },
    ledger: { type: 'string' },
    limit: { type: 'string', default: '5.5' },
    out: { type: 'string' },
  },
});
if (!args.topic || !args.ledger) throw new Error('Name a --topic and a --ledger file');

const ledger = createProofLedger(args.ledger, Number(args.limit));
ledger.assertRoom();
const models = makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ledger.onUsage });
const store = createSceneStore(getSceneStoreRoot());
const key = getSceneKey(args.topic);
const sceneId = key.id;
if (store.find(key) && !args.force) {
  console.log(JSON.stringify({ sceneId, isSaved: true }));
  process.exit(0);
}
const startedAt = performance.now();
const plan: LessonPlan = args.planFile ? (JSON.parse(readFileSync(args.planFile, 'utf8')) as LessonPlan) : await models.planner.plan(args.topic, AbortSignal.timeout(45_000));
const planMs = performance.now() - startedAt;
const clearedNames = await models.nameReader.clear(getPlanNames(args.topic, plan), AbortSignal.timeout(10_000));
const made = await makeScene({ writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker: createContainerWorker(), store }, { topic: args.topic, plan, clearedNames });
const saved = store.find(key);
const summary = { sceneId, isOk: made.isOk, reasons: made.isOk ? [] : made.reasons, planMs: Math.round(planMs), totalMs: Math.round(performance.now() - startedAt), trace: saved?.trace ?? null, status: saved?.status ?? null, takeBytes: saved?.takeBytes ?? null, notes: saved?.layoutNotes ?? [], spentUsd: ledger.getSpentUsd() };
console.log(JSON.stringify(summary));
if (args.out) writeFileSync(args.out, JSON.stringify(summary, null, 1));
