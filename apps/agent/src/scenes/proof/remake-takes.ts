import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readKey } from '../../lab/keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { getPlanNames, getPlanProblems } from '../content-check.ts';
import { getSpokenLines } from '../lesson/lesson-beats.ts';
import { getBrief } from '../make-scene.ts';
import { createContainerWorker } from '../render-worker.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore, getSceneKey } from '../scene-store.ts';
import { SCENE_THEMES, type StoredScene } from '../scene-types.ts';
import { createProofLedger } from './proof-ledger.ts';

const LIBRARY_PATH = resolve(import.meta.dirname, '../../../../api/src/picks/library.json');
const SECONDS_AFTER_MOMENT = 1.3;

const { values: args } = parseArgs({ options: { from: { type: 'string' }, ledger: { type: 'string' }, limit: { type: 'string', default: '2' } } });
if (!args.from) throw new Error('Name --from, the store to read scenes from, and --ledger to review them');

// Only a library card's title makes a shared scene. Anything else stays behind, because whoever typed it is not recorded.
const libraryTitles = new Set((JSON.parse(readFileSync(LIBRARY_PATH, 'utf8')) as { topics: { title: string }[] }).topics.map(({ title }) => title.trim().toLowerCase()));
const scenesRoot = join(args.from, 'scenes');
const oldScenes = readdirSync(scenesRoot).map((id) => join(scenesRoot, id, 'scene.json')).filter(existsSync).map((path) => JSON.parse(readFileSync(path, 'utf8')) as StoredScene);
const ledger = args.ledger ? createProofLedger(args.ledger, Number(args.limit)) : null;
const models = ledger ? makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ledger.onUsage, assertRoom: ledger.assertRoom }) : null;
const reviewer = models?.reviewer ?? null;
const store = createSceneStore(getSceneStoreRoot());
const worker = createContainerWorker({ namePrefix: 'astra-m3-14-remake' });
for (const scene of oldScenes) {
  const planProblems = getPlanProblems(scene.topic, scene.plan, await models?.nameReader.clear(getPlanNames(scene.topic, scene.plan), AbortSignal.timeout(10_000)));
  if (scene.status !== 'checked' || !libraryTitles.has(scene.topic.trim().toLowerCase()) || planProblems.length > 0) {
    console.log(JSON.stringify({ topic: scene.topic, skipped: true, status: scene.status, planProblems }));
    continue;
  }
  const inspectSeconds = [...new Set(Object.values(scene.moments).map((seconds) => Math.min(seconds + SECONDS_AFTER_MOMENT, scene.durationSeconds)))].sort((first, second) => first - second);
  const render = await worker({ code: scene.code, moments: scene.moments, durationSeconds: scene.durationSeconds, themes: SCENE_THEMES, values: scene.values, inspectSeconds }, AbortSignal.timeout(120_000));
  if (!render.isOk) {
    console.log(JSON.stringify({ topic: scene.topic, isOk: false, reasons: render.reasons }));
    continue;
  }
  const verdict = await reviewer?.review({ brief: getBrief(scene.topic, scene.plan), code: scene.code, sheets: render.sheets, spokenLines: getSpokenLines(scene.plan) }, AbortSignal.timeout(120_000));
  if (verdict && !verdict.isPass) {
    console.log(JSON.stringify({ topic: scene.topic, isOk: false, review: verdict.errors }));
    continue;
  }
  const saved = await store.saveChecked({ ...scene, ...getSceneKey(scene.topic), engineVersion: SCENE_ENGINE_VERSIONS.manimgx, parts: render.takes[0]?.parts ?? scene.parts, takeBytes: Object.fromEntries(render.takes.map(({ theme, bytes }) => [theme, bytes.length])) as StoredScene['takeBytes'], review: verdict?.errors ?? scene.review }, render.takes, render.sheets);
  console.log(JSON.stringify({ topic: scene.topic, sceneId: saved.id, isOk: true, renderMs: Math.round(render.ms), reviewMs: Math.round(verdict?.ms ?? 0), costUsd: verdict?.costUsd ?? 0, spentUsd: ledger?.getSpentUsd() ?? 0 }));
}
