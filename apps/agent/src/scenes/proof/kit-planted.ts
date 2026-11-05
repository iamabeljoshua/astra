import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readKey } from '../../keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { getKitSpokenLines } from '../kit-code-check.ts';
import { createFrameCheck } from '../kit-worker.ts';
import { getBrief } from '../make-scene.ts';
import type { StoredScene } from '../scene-types.ts';

interface Plant {
  name: string;
  scene: string;
  from: string;
  to: string;
}

const [plantsPath, ledger, out] = process.argv.slice(2) as [string, string, string];
const plants = JSON.parse(readFileSync(plantsPath, 'utf8')) as Plant[];
const models = makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ({ role, costUsd }) => appendFileSync(ledger, `${JSON.stringify({ role, costUsd })}\n`) });
const checkFrames = createFrameCheck();
let caught = 0;
for (const { name, scene: scenePath, from, to } of plants) {
  const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as StoredScene;
  if (!scene.code.includes(from)) throw new Error(`${name}: the plant does not apply`);
  const code = scene.code.replace(from, to);
  const brief = getBrief(scene.topic, scene.plan);
  const frames = await checkFrames({ code, moments: brief.moments, durationSeconds: brief.durationSeconds, seconds: [1.2, ...Object.values(brief.moments).map((seconds) => Math.min(seconds + 1.3, brief.durationSeconds))] }, new AbortController().signal);
  if (!frames.isOk) {
    console.log(`${name}: stopped by the frame check: ${frames.reasons.join('; ')}`);
    caught += 1;
    continue;
  }
  writeFileSync(join(out, `${name}.jpg`), frames.sheet);
  const verdict = await models.kitReviewer.review({ brief, code, sheets: [{ theme: 'dark', bytes: frames.sheet }], spokenLines: getKitSpokenLines(scene.plan) }, AbortSignal.timeout(60_000));
  if (!verdict.isPass) caught += 1;
  console.log(`${verdict.isPass ? 'MISSED' : 'caught'} ${name} $${verdict.costUsd.toFixed(3)} ${Math.round(verdict.ms)} ms: ${verdict.errors.map(({ what }) => what).join(' | ').slice(0, 420)}`);
}
console.log(`${caught} of ${plants.length} caught`);
process.exit(0);
