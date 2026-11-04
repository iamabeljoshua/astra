import { cpus, loadavg } from 'node:os';
import { readKey } from '../keys.ts';
import { makeAnthropicJsonReader } from '../providers/anthropic.ts';
import { makeAnthropicSceneModels, type SceneModels } from '../providers/anthropic.scenes.ts';
import { matchLibrary } from '../scene-queue/library-match.ts';
import { createSceneQueue, type SceneQueue } from '../scene-queue/scene-queue.ts';
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

export interface SessionScenes extends TutorScenes {
  /** Null when scenes ahead are off, so a session asks for what it asks for and nothing more. */
  queue: SceneQueue | null;
  onTutorAsk(topic: string): void;
}

const hasScenesAhead = () => process.env.ASTRA_SCENES_AHEAD !== '0';

const getLoadPerCore = () => (loadavg()[0] ?? 0) / Math.max(cpus().length, 1);

type MakeOptions = SessionHooks & { caps: Pick<SpendCaps, 'addScene' | 'addTurn' | 'getSceneUsd' | 'getSpendLimit' | 'getLeftTodayUsd'>; moveToNextStep(): void; getLastFirstTextMs(): number | null };

// A scene's spending lands on the student's day through the same caps as the tutor's, and a scene past the limit is simply not written.
export function makeTutorScenes({ caps, moveToNextStep, getLastFirstTextMs, ...hooks }: MakeOptions): SessionScenes {
  const limitUsd = Number(process.env.ASTRA_SCENE_SESSION_LIMIT_USD ?? DEFAULT_SCENE_LIMIT_USD);
  const assertRoom = () => {
    if (caps.getSpendLimit() || caps.getSceneUsd() >= limitUsd) throw new Error('Stopped at the scene limit');
  };
  const isFake = process.env.LESSON_FAKES === '1';
  const models: SceneModels = isFake ? makeFakeSceneModels() : makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ({ costUsd }) => caps.addScene(costUsd), assertRoom });
  const store = createSceneStore(getSceneStoreRoot());
  const runs = createTopicRuns({ planner: models.planner, nameReader: models.nameReader, writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker: createContainerWorker(process.env.ASTRA_SCENE_CONTAINERS ? { mostAtOnce: Number(process.env.ASTRA_SCENE_CONTAINERS) } : {}), store, warn: (line) => hooks.trace('sceneWarning', { problem: line }) });
  let queue: SceneQueue | null = null;
  const scenes = createTutorScenes({
    ...hooks,
    router: models.router,
    runs,
    store,
    getNowMs: () => performance.now(),
    onShown(shown) {
      hooks.onShown(shown);
      queue?.noteAhead(shown.topic, 'shown');
    },
    onAhead: (request, state) => queue?.noteAhead(request, state),
    onPageReady: () => queue?.onPageReady(),
  });
  if (hasScenesAhead()) {
    const titles = store.listSharedTitles().catch(() => []);
    const reader = isFake ? null : makeAnthropicJsonReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
    queue = createSceneQueue({
      scenes,
      async readLibrary(plan) {
        if (!reader || caps.getSpendLimit()) return [];
        const { matches, costUsd } = await matchLibrary(reader, plan, await titles);
        caps.addTurn({ usd: costUsd, voiceCharacters: 0 });
        hooks.trace('sceneLibraryRead', { costUsd, matches: matches.filter(Boolean).length, steps: plan.steps.length });
        return matches;
      },
      getFacts: () => ({ writesStarted: 0, sceneUsd: caps.getSceneUsd(), sceneLimitUsd: limitUsd, leftTodayUsd: caps.getLeftTodayUsd(), isOverLimit: caps.getSpendLimit() !== null, loadPerCore: getLoadPerCore(), lastFirstTextMs: getLastFirstTextMs() }),
      canPlay: scenes.canPlay,
      moveToNextStep,
      trace: hooks.trace,
    });
  }
  return {
    ...scenes,
    queue,
    onTutorAsk(topic) {
      if (queue) return queue.onTutorAsk(topic);
      hooks.trace('sceneCue', { text: topic, source: 'asked', wallMs: Date.now() });
      scenes.ask(topic);
    },
  };
}
