import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { SCENE_THEMES } from '../scene-types.ts';
import { createContainerWorker } from '../render-worker.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore, getSceneId } from '../scene-store.ts';

const store = createSceneStore(getSceneStoreRoot());
const worker = createContainerWorker({ namePrefix: 'astra-m3-14-remake' });
for (const scene of store.list()) {
  const render = await worker({ code: scene.code, moments: scene.moments, durationSeconds: scene.durationSeconds, themes: SCENE_THEMES, values: scene.values }, AbortSignal.timeout(120_000));
  if (!render.isOk) {
    console.log(JSON.stringify({ sceneId: scene.id, isOk: false, reasons: render.reasons }));
    continue;
  }
  store.save({ ...scene, id: getSceneId(scene.topic, scene.values), engineVersion: SCENE_ENGINE_VERSIONS.manimgx, parts: render.takes[0]?.parts ?? scene.parts, takeBytes: Object.fromEntries(render.takes.map(({ theme, bytes }) => [theme, bytes.length])) as typeof scene.takeBytes }, render.takes, []);
  console.log(JSON.stringify({ sceneId: scene.id, isOk: true, ms: Math.round(render.ms), takeBytes: render.takes.map(({ bytes }) => bytes.length) }));
}
