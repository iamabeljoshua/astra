import { isAboutBeingUnsafe, showsDanger } from '../content-check.ts';
import { canTryAfterRefusal, canTryNow } from '../make-scene.ts';
import { DANGEROUS_KIND, SAFETY_KIND } from '../model-replies.ts';
import { createSceneDesk, type SceneDesk, type SceneState } from '../scene-desk.ts';
import { getSceneKey, type SceneStore } from '../scene-store.ts';
import type { LessonPlan, NoLesson, OpeningLine, SceneFitReader, SceneRoute, SceneRouter, StoredScene } from '../scene-types.ts';
import type { TopicRun, TopicRuns } from './topic-runs.ts';
import type { VoiceShelf } from './voice-takes.ts';

const ROUTER_LIMIT_MS = 10_000;
const FIT_LIMIT_MS = 4000;
const SAVED_ROUTE = { engine: 'manimgx', kind: 'saved', model: 'none', ms: 0, costUsd: 0 } as const;
const NO_ROUTE = { engine: 'none', kind: 'none', topic: '', model: 'none', ms: 0, costUsd: 0 } as const;

export interface LessonWork {
  request: string;
  desk: SceneDesk;
  plan: Promise<LessonPlan | NoLesson>;
  firstLine: Promise<OpeningLine | null>;
  planWithoutScene(): void;
  /** Where this lesson's spoken lines are kept. Only a card's lines are ever shared. */
  getVoiceShelf(): VoiceShelf;
  /** Called as the lesson ends, so a typed scene nobody is left to see stops spending. */
  leave(): void;
}

export interface LessonWorkOptions {
  router: SceneRouter;
  runs: TopicRuns;
  /** Writes 3D scenes live. Left out, a request the router sends to the kit gets no scene. */
  kitRuns?: TopicRuns;
  /** Finds a saved scene that already answers a typed question, which lands in seconds and has a person's check behind it. */
  fitReader?: SceneFitReader;
  store: SceneStore;
  request: string;
  isCard: boolean;
  studentId: string;
  /** The library's own question for a card, which it can always ask with no model. */
  cardLine?: string;
  getNowMs(): number;
  getWallMs?(): number;
  onChange?(state: SceneState, atMs: number): void;
  /** A tutor in a live session has its own words, so nothing is paid for a plan unless a scene can come of it. */
  isOnlyForScene?: boolean;
}

export function createLessonWork({ router, runs, kitRuns, fitReader, store, request, isCard, studentId, cardLine, getNowMs, getWallMs = () => Date.now(), onChange, isOnlyForScene = false }: LessonWorkOptions): LessonWork {
  // A card's title comes from the server's own list, so its scene is shared. A typed question stays with its student, because router-cleaned words are still a student's words shaped by a model.
  const ownerId = isCard ? null : studentId;
  // A card's scene reaches every student, so only the reviewed library may give one a 3D scene.
  const writesKit = kitRuns !== undefined && !isCard;
  let settlePlan: (plan: LessonPlan | NoLesson) => void = () => {};
  const plan = new Promise<LessonPlan | NoLesson>((resolve) => {
    settlePlan = resolve;
  });
  let settleFirstLine: (line: OpeningLine | null) => void = () => {};
  const firstLine = new Promise<OpeningLine | null>((resolve) => {
    settleFirstLine = resolve;
  });
  void plan.then((settled) => settleFirstLine(typeof settled === 'string' ? null : (settled.opening[0] ?? null)));
  let run: TopicRun | null = null;
  let voiceShelf: VoiceShelf = isCard ? { kind: 'shared' } : { kind: 'nowhere' };

  const getOwnKey = (topic: string) => getSceneKey(topic, { ownerId });
  const findSaved = (topic: string): StoredScene | null => store.find(getSceneKey(topic)) ?? (ownerId === null ? null : store.find(getOwnKey(topic)));

  const keepVoiceWith = (topic: string, saved: StoredScene | null) => {
    if (!isCard && saved?.ownerId !== null) voiceShelf = { kind: 'student', sceneId: getOwnKey(topic).id };
    if (saved?.ownerId === null) voiceShelf = { kind: 'shared' };
  };

  const useSaved = (topic: string, saved: StoredScene) => {
    keepVoiceWith(topic, saved);
    settlePlan(saved.plan);
  };

  const isScenePaused = (topic: string) => !canTryNow({ store, getWallMs }, getOwnKey(topic)) || !canTryAfterRefusal(store, getOwnKey(topic), getWallMs());

  // A topic whose next try is not due can draw nothing today, so it says one plan's words on every open. Lines a model wrote are kept, even a plan's clean lines, and a fallback with no model behind it is not.
  const joinRun = (topic: string, engine: SceneRoute['engine']) => {
    keepVoiceWith(topic, null);
    const key = getOwnKey(topic);
    const isPaused = isScenePaused(topic);
    if (isOnlyForScene && isPaused) return;
    const waiting = isPaused ? store.findWaitingPlan(key) : null;
    if (waiting) {
      settlePlan(waiting);
      return;
    }
    run = (engine === 'kit' && writesKit ? kitRuns : runs).join(key, cardLine ? { plainLine: { say: cardLine } } : {});
    void run.firstLine.then(settleFirstLine);
    void run.plan.then((planned) => {
      settlePlan(planned);
      if (isPaused && typeof planned !== 'string' && !planned.hasNoModel) store.saveWaitingPlan(key, planned);
    });
  };

  // A card has its title, so it can teach whatever the router does. A typed question has only what the router says about it.
  const askRouter = (): Promise<SceneRoute> => {
    const asked = router.route(request, AbortSignal.timeout(ROUTER_LIMIT_MS));
    return isCard ? asked.catch(() => NO_ROUTE) : asked;
  };

  // Null on any doubt or failure, because a reader that is down must cost a fresh scene and nothing else.
  const findFit = async (topic: string): Promise<StoredScene | null> => {
    if (!fitReader || isCard || !writesKit) return null;
    const titles = store.list().filter((scene) => scene.ownerId === null).map((scene) => scene.topic);
    if (titles.length === 0) return null;
    const title = await fitReader.find(topic, titles, AbortSignal.timeout(FIT_LIMIT_MS)).catch(() => null);
    return title ? findSaved(title) : null;
  };

  const getRoute = async (): Promise<SceneRoute> => {
    if (!isCard && isAboutBeingUnsafe(request)) {
      settlePlan('unsafe');
      return { ...NO_ROUTE, kind: SAFETY_KIND };
    }
    const saved = findSaved(request);
    if (saved) {
      useSaved(request, saved);
      return { ...SAVED_ROUTE, topic: request };
    }
    const route = await askRouter();
    if (!isCard && (route.kind === SAFETY_KIND || isAboutBeingUnsafe(route.topic))) {
      settlePlan('unsafe');
      return { ...route, engine: 'none', topic: '' };
    }
    if (!isCard && route.kind === DANGEROUS_KIND) {
      settlePlan('declined');
      return route;
    }
    const topic = isCard ? request : route.topic;
    if (topic === '') {
      settlePlan('nothing');
      return { ...route, engine: 'none', topic: '' };
    }
    const savedByTopic = findSaved(topic);
    const fit = savedByTopic || route.engine === 'none' ? null : await findFit(topic);
    if (fit) {
      useSaved(fit.topic, fit);
      return { ...SAVED_ROUTE, topic: fit.topic };
    }
    if (savedByTopic) useSaved(topic, savedByTopic);
    else if (!isOnlyForScene || route.engine === 'manimgx' || (route.engine === 'kit' && writesKit)) joinRun(topic, route.engine);
    return { ...route, topic };
  };

  // No router means no reading of the words but ours, and a child must not fall to the no-lesson line.
  const settleWithNoRoute = () => settlePlan(!isCard && showsDanger(request) ? 'unsafe' : 'nothing');

  const desk = createSceneDesk({
    getNowMs,
    onChange,
    engines: writesKit ? ['manimgx', 'kit'] : ['manimgx'],
    route: () =>
      getRoute().catch((error: unknown) => {
        settleWithNoRoute();
        throw error;
      }),
    async make({ topic }) {
      const saved = findSaved(topic);
      if (saved) return { isOk: true, scene: saved };
      const key = getOwnKey(topic);
      const refusal = store.findRefusal(key);
      if (refusal && !canTryAfterRefusal(store, key, getWallMs())) return { isOk: false, reasons: refusal.review.map(({ what }) => what) };
      return run ? run.getScene() : { isOk: false, reasons: ['no plan'] };
    },
  });

  return {
    request,
    desk,
    plan,
    firstLine,
    planWithoutScene: () => void getRoute().catch(settleWithNoRoute),
    getVoiceShelf: () => voiceShelf,
    leave: () => run?.leave(),
  };
}
