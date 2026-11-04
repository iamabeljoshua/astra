import { SCENE_THEMES } from '../scene-types.ts';
import { createContainerWorker } from '../render-worker.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore } from '../scene-store.ts';

// Stored code makes the takes again with no model call, which is what a new engine version or a new look costs.
const store = createSceneStore(getSceneStoreRoot());
const worker = createContainerWorker({ namePrefix: 'astra-m3-14-remake' });
for (const scene of store.list()) {
  const render = await worker({ code: scene.code, moments: scene.moments, durationSeconds: scene.durationSeconds, themes: SCENE_THEMES, values: scene.values, inspectSeconds: [] }, AbortSignal.timeout(120_000));
  if (!render.isOk) {
    console.log(JSON.stringify({ sceneId: scene.id, isOk: false, reasons: render.reasons }));
    continue;
  }
  store.save({ ...scene, parts: render.takes[0]?.parts ?? scene.parts, takeBytes: Object.fromEntries(render.takes.map(({ theme, bytes }) => [theme, bytes.length])) as typeof scene.takeBytes }, render.takes, []);
  console.log(JSON.stringify({ sceneId: scene.id, isOk: true, ms: Math.round(render.ms), takeBytes: render.takes.map(({ bytes }) => bytes.length) }));
}
