import { createSceneDesk, type SceneDesk, type SceneState } from '../scene-desk.ts';
import { getSceneKey, type SceneStore } from '../scene-store.ts';
import type { LessonPlan, OpeningLine, SceneRoute, SceneRouter, StoredScene } from '../scene-types.ts';
import type { TopicRun, TopicRuns } from './topic-runs.ts';

const ROUTER_LIMIT_MS = 10_000;
const SAVED_ROUTE = { engine: 'manimgx', kind: 'saved', model: 'none', ms: 0, costUsd: 0 } as const;

export interface LessonWork {
  request: string;
  desk: SceneDesk;
  plan: Promise<LessonPlan | null>;
  firstLine: Promise<OpeningLine | null>;
  planWithoutScene(): void;
}

export interface LessonWorkOptions {
  router: SceneRouter;
  runs: TopicRuns;
  store: SceneStore;
  request: string;
  isCard: boolean;
  studentId: string;
  getNowMs(): number;
  onChange?(state: SceneState, atMs: number): void;
}

export function createLessonWork({ router, runs, store, request, isCard, studentId, getNowMs, onChange }: LessonWorkOptions): LessonWork {
  // A card's title comes from the server's own list, so its scene is shared. A typed question stays with its student, because router-cleaned words are still a student's words shaped by a model.
  const ownerId = isCard ? null : studentId;
  let settlePlan: (plan: LessonPlan | null) => void = () => {};
  const plan = new Promise<LessonPlan | null>((resolve) => {
    settlePlan = resolve;
  });
  let settleFirstLine: (line: OpeningLine | null) => void = () => {};
  const firstLine = new Promise<OpeningLine | null>((resolve) => {
    settleFirstLine = resolve;
  });
  void plan.then((settled) => settleFirstLine(settled?.opening[0] ?? null));
  let run: TopicRun | null = null;

  const getOwnKey = (topic: string) => getSceneKey(topic, { ownerId });
  const findSaved = (topic: string): StoredScene | null => store.find(getSceneKey(topic)) ?? (ownerId === null ? null : store.find(getOwnKey(topic)));

  const joinRun = (topic: string) => {
    run = runs.join(getOwnKey(topic));
    void run.firstLine.then(settleFirstLine);
    void run.plan.then(settlePlan);
  };

  const getRoute = async (): Promise<SceneRoute> => {
    const saved = findSaved(request);
    if (saved) {
      settlePlan(saved.plan);
      return { ...SAVED_ROUTE, topic: request };
    }
    const route = await router.route(request, AbortSignal.timeout(ROUTER_LIMIT_MS));
    const topic = isCard ? request : route.topic;
    if ((route.engine === 'none' && !isCard) || topic === '') {
      settlePlan(null);
      return { ...route, engine: 'none', topic: '' };
    }
    const savedByTopic = findSaved(topic);
    if (savedByTopic) settlePlan(savedByTopic.plan);
    else joinRun(topic);
    return { ...route, topic };
  };

  const desk = createSceneDesk({
    getNowMs,
    onChange,
    route: () =>
      getRoute().catch((error: unknown) => {
        settlePlan(null);
        throw error;
      }),
    async make({ topic }) {
      const saved = findSaved(topic);
      if (saved) return { isOk: true, scene: saved };
      const refusal = store.findRefusal(getOwnKey(topic));
      if (refusal) return { isOk: false, reasons: refusal.review.map(({ what }) => what) };
      return run ? run.getScene() : { isOk: false, reasons: ['no plan'] };
    },
  });

  return {
    request,
    desk,
    plan,
    firstLine,
    planWithoutScene: () => void getRoute().catch(() => settlePlan(null)),
  };
}
