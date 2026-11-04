import { makeScene, type SceneMaker } from '../make-scene.ts';
import { createSceneDesk, type SceneDesk, type SceneState } from '../scene-desk.ts';
import { getSceneId } from '../scene-store.ts';
import type { LessonPlan, LessonPlanner, OpeningLine, SceneRoute, SceneRouter, StoredScene } from '../scene-types.ts';

const ROUTER_LIMIT_MS = 10_000;
const PLANNER_LIMIT_MS = 30_000;
const SAVED_ROUTE = { engine: 'manimgx', kind: 'saved', model: 'none', ms: 0, costUsd: 0 } as const;

export interface LessonWork {
  request: string;
  desk: SceneDesk;
  /** The stand-in tutor's words. Null when the request needs no lesson. */
  plan: Promise<LessonPlan | null>;
  /** The first of those lines, as soon as it exists, so the tutor is not silent while the rest is written. */
  firstLine: Promise<OpeningLine | null>;
  /** Asks for words only, for a browser that cannot show a scene. */
  planWithoutScene(): void;
}

export interface LessonWorkOptions extends SceneMaker {
  router: SceneRouter;
  planner: LessonPlanner;
  request: string;
  /** A card's title is already a clean topic. A typed question goes through the router, which names the topic with nothing about the person. */
  isCard: boolean;
  getNowMs(): number;
  onChange?(state: SceneState, atMs: number): void;
}

export function createLessonWork({ router, planner, request, isCard, getNowMs, onChange, ...maker }: LessonWorkOptions): LessonWork {
  let settlePlan: (plan: LessonPlan | null) => void = () => {};
  const plan = new Promise<LessonPlan | null>((resolve) => {
    settlePlan = resolve;
  });
  let settleFirstLine: (line: OpeningLine | null) => void = () => {};
  const firstLine = new Promise<OpeningLine | null>((resolve) => {
    settleFirstLine = resolve;
  });
  void plan.then((settled) => settleFirstLine(settled?.opening[0] ?? null));
  const findSaved = (topic: string): StoredScene | null => maker.store.find(getSceneId(topic));

  const getRoute = async (): Promise<SceneRoute> => {
    const saved = isCard ? findSaved(request) : null;
    if (saved?.status === 'checked') {
      settlePlan(saved.plan);
      return { ...SAVED_ROUTE, topic: request };
    }
    const route = await router.route(request, AbortSignal.timeout(ROUTER_LIMIT_MS));
    const topic = isCard ? request : route.topic;
    if (route.engine === 'none' || topic === '') {
      settlePlan(null);
      return { ...route, engine: 'none', topic: '' };
    }
    const savedByTopic = findSaved(topic);
    settlePlan(savedByTopic?.plan ?? (await planner.plan(topic, AbortSignal.timeout(PLANNER_LIMIT_MS), settleFirstLine)));
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
      if (saved?.status === 'checked') return { isOk: true, scene: saved };
      if (saved?.status === 'rejected') return { isOk: false, reasons: saved.review.map(({ what }) => what) };
      const lessonPlan = await plan;
      if (!lessonPlan) return { isOk: false, reasons: ['no plan'] };
      return makeScene(maker, { topic, plan: lessonPlan });
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
