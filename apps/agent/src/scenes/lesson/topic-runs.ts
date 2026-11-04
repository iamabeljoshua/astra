import { getLineProblems, getPlanProblems } from '../content-check.ts';
import { type MadeScene, makeScene, type SceneMaker } from '../make-scene.ts';
import type { LessonPlan, LessonPlanner, OpeningLine, SceneKey } from '../scene-types.ts';

const PLANNER_LIMIT_MS = 30_000;
const NO_PLAN: MadeScene = { isOk: false, reasons: ['no plan'] };

export interface TopicRun {
  plan: Promise<LessonPlan | null>;
  firstLine: Promise<OpeningLine | null>;
  getScene(): Promise<MadeScene>;
}

export interface TopicRuns {
  join(key: SceneKey): TopicRun;
}

// Words and pictures of a scene come from one plan, so students on the same new topic share one run from the plan to the saved scene.
export function createTopicRuns({ planner, ...maker }: SceneMaker & { planner: LessonPlanner }): TopicRuns {
  const running = new Map<string, TopicRun>();
  const warn = maker.warn ?? console.warn;

  const getFitPlan = async (key: SceneKey, onFirstLine: (line: OpeningLine) => void): Promise<LessonPlan | null> => {
    const written = await planner.plan(key.topic, AbortSignal.timeout(PLANNER_LIMIT_MS), onFirstLine);
    const problems = getPlanProblems(key.topic, written);
    if (problems.length === 0) return written;
    warn(`::warning title=Lesson plan::a plan was refused before it was spoken: ${problems.join('; ')}`);
    return null;
  };

  const start = (key: SceneKey): TopicRun => {
    let settleFirstLine: (line: OpeningLine | null) => void = () => {};
    const firstLine = new Promise<OpeningLine | null>((resolve) => {
      settleFirstLine = resolve;
    });
    const plan = getFitPlan(key, (line) => {
      if (getLineProblems(line).length === 0) settleFirstLine(line);
    }).catch((error: unknown) => {
      warn(`::warning title=Lesson plan::the planner failed: ${String(error)}`);
      return null;
    });
    let scene: Promise<MadeScene> | null = null;
    const leave = () => {
      if (running.get(key.id) === run) running.delete(key.id);
    };
    const run: TopicRun = {
      plan,
      firstLine,
      getScene() {
        scene ??= plan.then((settled) => (settled ? makeScene(maker, { topic: key.topic, ownerId: key.ownerId, plan: settled }) : NO_PLAN)).finally(leave);
        return scene;
      },
    };
    void plan.then((settled) => {
      settleFirstLine(settled?.opening[0] ?? null);
      if (settled === null || scene === null) leave();
    });
    return run;
  };

  return {
    join(key) {
      const found = running.get(key.id);
      if (found) return found;
      const run = start(key);
      running.set(key.id, run);
      return run;
    },
  };
}
