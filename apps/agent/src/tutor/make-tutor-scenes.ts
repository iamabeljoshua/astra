import { readKey } from '../keys.ts';
import { makeAnthropicSceneModels, type SceneModels } from '../providers/anthropic.scenes.ts';
import { makeFakeSceneModels } from '../scenes/lesson/fake-models.ts';
import { createTopicRuns } from '../scenes/lesson/topic-runs.ts';
import { createContainerWorker } from '../scenes/render-worker.ts';
import { getSceneStoreRoot } from '../scenes/scene-settings.ts';
import { createSceneStore } from '../scenes/scene-store.ts';
import type { SpendCaps } from './make-brain.ts';
import { createTutorScenes, type TutorScenes, type TutorScenesOptions } from './tutor-scenes.ts';

/** About four fresh scenes. A saved scene costs nothing, so this only stops a session that keeps asking for new ones. */
const DEFAULT_SCENE_LIMIT_USD = 0.8;

type SessionHooks = Pick<TutorScenesOptions, 'getCardTitle' | 'send' | 'speak' | 'canSpeak' | 'onShown' | 'trace'>;

// A scene's spending lands on the student's day through the same caps as the tutor's, and a scene past the limit is simply not written.
export function makeTutorScenes({ caps, ...hooks }: SessionHooks & { caps: Pick<SpendCaps, 'addScene' | 'getSceneUsd' | 'getSpendLimit'> }): TutorScenes {
  const limitUsd = Number(process.env.ASTRA_SCENE_SESSION_LIMIT_USD ?? DEFAULT_SCENE_LIMIT_USD);
  const assertRoom = () => {
    if (caps.getSpendLimit() || caps.getSceneUsd() >= limitUsd) throw new Error('Stopped at the scene limit');
  };
  const models: SceneModels = process.env.LESSON_FAKES === '1' ? makeFakeSceneModels() : makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ({ costUsd }) => caps.addScene(costUsd), assertRoom });
  const store = createSceneStore(getSceneStoreRoot());
  const runs = createTopicRuns({ planner: models.planner, nameReader: models.nameReader, writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker: createContainerWorker(), store, warn: (line) => hooks.trace('sceneWarning', { problem: line }) });
  return createTutorScenes({ ...hooks, router: models.router, runs, store, getNowMs: () => performance.now() });
}
