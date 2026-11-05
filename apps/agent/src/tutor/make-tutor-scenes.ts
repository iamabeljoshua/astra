import { cpus, loadavg } from 'node:os';
import { readKey } from '../keys.ts';
import { getCardPictures } from '../lesson-plan/card-lesson.ts';
import { makeAnthropicJsonReader } from '../providers/anthropic.ts';
import { makeAnthropicSceneModels, type RecipeModels, type SceneModels } from '../providers/anthropic.scenes.ts';
import { getKitCodeProblems, getKitSpokenLines } from '../scenes/kit-code-check.ts';
import { createKitWorker } from '../scenes/kit-worker.ts';
import { matchLibrary, toShelfScene } from '../scene-queue/library-match.ts';
import { createSceneQueue, type SceneQueue } from '../scene-queue/scene-queue.ts';
import { makeFakeSceneModels } from '../scenes/lesson/fake-models.ts';
import { createTopicRuns } from '../scenes/lesson/topic-runs.ts';
import { createContainerWorker } from '../scenes/render-worker.ts';
import { getSceneStoreRoot, hasKitLive } from '../scenes/scene-settings.ts';
import { createSceneStore } from '../scenes/scene-store.ts';
import { getCoreSource, getUsableParts } from '../scenes/recipe/catalogue.ts';
import { createRecipeWork } from '../scenes/recipe/recipe-work.ts';
import type { SpendCaps } from './make-brain.ts';
import type { TutorBeat } from './brain.ts';
import { createTutorScenes, type FastSceneHooks, type TutorScenes, type TutorScenesOptions } from './tutor-scenes.ts';

/** About four fresh scenes. A saved scene costs nothing, so this only stops a session that keeps asking for new ones. */
const DEFAULT_SCENE_LIMIT_USD = 0.8;
/** Three whole lessons of a card's six scenes. Each play is spoken again, at about 100 credits. */
const DEFAULT_SHARED_PLAYS_A_DAY = 18;

const FAST_ASK_LIMIT_MS = 20_000;
const FAST_MOST_ASKS = 40;
/** A fresh drawing takes about 12 s after the recipe call, and 20 s at worst in the lab. */
const FRESH_ASK_LIMIT_MS = 40_000;
const MOST_FRESH_DRAWINGS = 6;

export const hasFastScenes = () => process.env.ASTRA_FAST_SCENES === '1';

const hasFreshDraw = () => process.env.ASTRA_FRESH_DRAW === '1';

type SessionHooks = Pick<TutorScenesOptions, 'getCardTitle' | 'send' | 'speak' | 'canSpeak' | 'onShown' | 'trace'>;

export interface SessionScenes extends TutorScenes {
  queue: SceneQueue | null;
  onTutorAsk(topic: string): void;
}

const hasScenesAhead = () => process.env.ASTRA_SCENES_AHEAD !== '0';

const getLoadPerCore = () => (loadavg()[0] ?? 0) / Math.max(cpus().length, 1);

type MakeOptions = SessionHooks & { isTutorClosed?(): boolean; caps: Pick<SpendCaps, 'addScene' | 'addTurn' | 'getSceneUsd' | 'getSpendLimit' | 'getLeftTodayUsd' | 'getSharedPlaysToday'>; moveToNextStep(): void; getLastFirstTextMs(): number | null; canCutIn?(): boolean; isInBreath?(): boolean; isBeforeFirstWord?(): boolean; cutIn?(beats: readonly TutorBeat[]): boolean; getLevel?(): string | null };

// A scene's spending lands on the student's day through the same caps as the tutor's, and a scene past the limit is simply not written.
export function makeTutorScenes({ caps, moveToNextStep, getLastFirstTextMs, canCutIn, isInBreath, isBeforeFirstWord, cutIn, getLevel, ...hooks }: MakeOptions): SessionScenes {
  const limitUsd = Number(process.env.ASTRA_SCENE_SESSION_LIMIT_USD ?? DEFAULT_SCENE_LIMIT_USD);
  const sharedPlaysADay = Number(process.env.ASTRA_SHARED_PLAYS_A_DAY ?? DEFAULT_SHARED_PLAYS_A_DAY);
  if (!process.env.ASTRA_SPEND_FILE) process.stderr.write('ASTRA_SPEND_FILE is not set, so shared scenes have no project ceiling and no per-student cap past this session.\n');
  const isClosed = () => caps.getSpendLimit() !== null || (hooks.isTutorClosed?.() ?? false);
  const assertRoom = () => {
    if (isClosed() || caps.getSceneUsd() >= limitUsd) throw new Error('Stopped at the scene limit');
  };
  const isFake = process.env.LESSON_FAKES === '1';
  const models: SceneModels & RecipeModels = isFake ? makeFakeSceneModels() : makeAnthropicSceneModels({ apiKey: readKey('ANTHROPIC_API_KEY'), onUsage: ({ costUsd }) => caps.addScene(costUsd), assertRoom });
  const store = createSceneStore(getSceneStoreRoot());
  const warn = (line: string) => hooks.trace('sceneWarning', { problem: line });
  const runs = createTopicRuns({ planner: models.planner, nameReader: models.nameReader, writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker: createContainerWorker(process.env.ASTRA_SCENE_CONTAINERS ? { mostAtOnce: Number(process.env.ASTRA_SCENE_CONTAINERS) } : {}), store, warn });
  const kitRuns = hasKitLive() ? createTopicRuns({ engine: 'kit', themes: ['dark'], checkCode: getKitCodeProblems, getLinesToReview: getKitSpokenLines, planner: models.planner, nameReader: models.nameReader, writers: [models.kitWriter, models.kitFallbackWriter], repairWriter: models.kitFallbackWriter, reviewer: models.kitReviewer, worker: createKitWorker(), store, warn }) : undefined;
  let queue: SceneQueue | null = null;
  let freshDrawings = 0;
  const claimDrawing = () => {
    if (freshDrawings >= MOST_FRESH_DRAWINGS) return false;
    freshDrawings += 1;
    return true;
  };
  const freshTools = hasFreshDraw() ? { writer: models.freshWriter, reviewer: models.freshReviewer, claimDrawing } : null;
  const fast: FastSceneHooks | null = hasFastScenes() && canCutIn && cutIn && isInBreath
    ? {
        canCutIn,
        isInBreath,
        ...(isBeforeFirstWord ? { isBeforeFirstWord } : {}),
        cutIn,
        mostAsks: FAST_MOST_ASKS,
        askLimitMs: freshTools ? FRESH_ASK_LIMIT_MS : FAST_ASK_LIMIT_MS,
        makeWork: (input) =>
          createRecipeWork({
            ...input,
            router: models.router,
            writer: models.recipeWriter,
            reviewer: models.recipeReviewer,
            nameReader: models.nameReader,
            matcher: models.sceneMatcher,
            ...(kitRuns ? { liveRuns: kitRuns } : {}),
            store,
            storeRoot: getSceneStoreRoot(),
            getParts: getUsableParts,
            getCore: getCoreSource,
            getLevel: () => getLevel?.() ?? null,
            trace: hooks.trace,
            fresh: freshTools,
          }),
      }
    : null;
  const scenes = createTutorScenes({
    ...hooks,
    ...(fast ? { fast } : {}),
    ...(kitRuns ? { kitRuns, fitReader: models.fitReader } : {}),
    isClosed,
    canPlayShared: (studentId) => caps.getSharedPlaysToday(studentId) < sharedPlaysADay,
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
    const reader = isFake ? null : makeAnthropicJsonReader({ apiKey: readKey('ANTHROPIC_API_KEY') });
    queue = createSceneQueue({
      scenes,
      async readLibrary(plan, taken) {
        if (caps.getSpendLimit()) return [];
        const shelf = await store.listShared();
        const pictures = getCardPictures(plan, shelf.map(({ topic }) => topic));
        if (pictures) return pictures;
        if (!reader) return [];
        const { matches, costUsd } = await matchLibrary(reader, plan, shelf.filter(({ topic }) => !taken.includes(topic)).map(toShelfScene));
        caps.addTurn({ usd: costUsd, voiceCharacters: 0 });
        hooks.trace('sceneLibraryRead', { costUsd, matches: matches.filter(Boolean).length, steps: plan.steps.length });
        return matches;
      },
      getFacts: () => ({ writesStarted: 0, sceneUsd: caps.getSceneUsd(), sceneLimitUsd: limitUsd, leftTodayUsd: caps.getLeftTodayUsd(), isOverLimit: isClosed(), loadPerCore: getLoadPerCore(), lastFirstTextMs: getLastFirstTextMs() }),
      canPlay: scenes.canPlay,
      moveToNextStep,
      trace: hooks.trace,
      asksAlwaysGo: fast !== null,
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
