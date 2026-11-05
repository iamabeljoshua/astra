import { readFileSync } from 'node:fs';
import { readKey } from '../../keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { createSceneStore } from '../scene-store.ts';

interface Case {
  topic: string;
  fits: string | null;
}

const cases = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as Case[];
const models = makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY') });
const titles = (await createSceneStore(process.env.SCENE_STORE_DIR as string).listShared()).map((scene) => scene.topic);
console.log(`${titles.length} titles`);
let falseMatches = 0;
let missed = 0;
let right = 0;
for (const { topic, fits } of cases) {
  const startedAt = performance.now();
  const title = await models.fitReader.find(topic, titles, AbortSignal.timeout(8000)).catch((error: unknown) => `ERROR ${String(error)}`);
  const isRight = fits === null ? title === null : title !== null && new RegExp(fits, 'i').test(title);
  if (isRight) right += 1;
  else if (title === null) missed += 1;
  else falseMatches += 1;
  console.log(`${isRight ? 'ok   ' : 'WRONG'} ${Math.round(performance.now() - startedAt)} ms | ${topic} -> ${title ?? 'none'}`);
}
console.log(`${right} of ${cases.length} right, ${falseMatches} false matches, ${missed} missed`);
process.exit(0);
