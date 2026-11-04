import { makeScene, type SceneMaker } from '../make-scene.ts';
import { createSceneDesk, type SceneDesk, type SceneState } from '../scene-desk.ts';
import { getSceneId } from '../scene-store.ts';
import type { LessonPlan, LessonPlanner, SceneRoute, SceneRouter, StoredScene } from '../scene-types.ts';

const ROUTER_LIMIT_MS = 10_000;
const PLANNER_LIMIT_MS = 30_000;
const SAVED_ROUTE = { engine: 'manimgx', kind: 'saved', model: 'none', ms: 0, costUsd: 0 } as const;

export interface LessonWork {
  request: string;
  desk: SceneDesk;
  /** The stand-in tutor's words. Null when the request needs no lesson. */
  plan: Promise<LessonPlan | null>;
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
    settlePlan(savedByTopic?.plan ?? (await planner.plan(topic, AbortSignal.timeout(PLANNER_LIMIT_MS))));
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
    planWithoutScene: () => void getRoute().catch(() => settlePlan(null)),
  };
}
