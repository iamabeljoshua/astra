import { getLineProblems, getPlanProblems, getSceneWordProblems, IS_DANGEROUS, IS_OFF_TOPIC } from '../content-check.ts';
import { canTryNow, getBrief, type MadeScene, makeScene, type SceneMaker, WRITER_LIMIT_MS } from '../make-scene.ts';
import { type LessonPlan, type LessonPlanner, type NoLesson, type OpeningLine, PlanRefused, type SceneKey, type SceneWords, type WrittenScene } from '../scene-types.ts';

const PLANNER_LIMIT_MS = 15_000;
const TRIES = 2;
const NO_PLAN: MadeScene = { isOk: false, reasons: ['no plan'] };
const NOTES_NOT_LOADING = "My notes for this lesson aren't loading right now, so open it again in a minute and we'll go further.";

export interface TopicRun {
  plan: Promise<LessonPlan | NoLesson>;
  firstLine: Promise<OpeningLine | null>;
  getScene(): Promise<MadeScene>;
  /** A lesson calls this as it ends. A typed scene stops once no lesson is left on it. A card keeps going, because the next student gets it free. */
  leave(): void;
}

export interface TopicRuns {
  join(key: SceneKey, options?: { cardFallback?: OpeningLine }): TopicRun;
}

interface EarlyWrite {
  words: SceneWords;
  written: Promise<WrittenScene>;
  stop(): void;
}

const isSameWords = (first: SceneWords, second: SceneWords) => first.narration === second.narration && first.plan === second.plan;

// A card must teach on the plain board whatever went wrong, from the plan's clean lines if it stayed on the topic, or else from the library's own question.
function getPlainBoardPlan(topic: string, cardFallback: OpeningLine, refused: { plan: LessonPlan; problems: readonly string[] } | null): LessonPlan {
  const usable = refused && !refused.problems.includes(IS_OFF_TOPIC) && !refused.problems.includes(IS_DANGEROUS) ? refused.plan : null;
  const isClean = (line: OpeningLine) => getLineProblems(topic, line).length === 0;
  const opening = usable?.opening.filter(isClean) ?? [];
  if (usable && opening.length > 0) return { opening, more: usable.more?.filter(isClean) ?? [], setup: '', narration: '', plan: '', close: isClean({ say: usable.close }) ? usable.close : NOTES_NOT_LOADING };
  return { opening: [{ say: `Let's think about this one: ${topic}.` }, cardFallback], more: [], setup: '', narration: '', plan: '', close: NOTES_NOT_LOADING };
}

// Words and pictures of a scene come from one plan, so students on the same new topic share one run from the plan to the saved scene.
export function createTopicRuns({ planner, ...maker }: SceneMaker & { planner: LessonPlanner }): TopicRuns {
  const running = new Map<string, { run: TopicRun; lessons: { count: number } }>();
  const warn = maker.warn ?? console.warn;

  const start = (key: SceneKey, cardFallback: OpeningLine | undefined, lessons: { count: number }): TopicRun => {
    const stopper = new AbortController();
    const forget = () => {
      if (running.get(key.id)?.lessons === lessons) running.delete(key.id);
    };
    let settleFirstLine: (line: OpeningLine | null) => void = () => {};
    const firstLine = new Promise<OpeningLine | null>((resolve) => {
      settleFirstLine = resolve;
    });
    let spokenFirstLine: OpeningLine | null = null;
    let isSceneWanted = false;
    let canDraw = true;
    let sceneWords: SceneWords | null = null;
    let earlyWrite: EarlyWrite | null = null;

    const startEarlyWrite = () => {
      const writer = maker.writers[0];
      if (earlyWrite || !sceneWords || !writer || !isSceneWanted || !canTryNow(maker, key)) return;
      const stopEarly = new AbortController();
      const written = writer.write(getBrief(key.topic, sceneWords), null, AbortSignal.any([AbortSignal.timeout(WRITER_LIMIT_MS), stopper.signal, stopEarly.signal]));
      written.catch(() => {});
      earlyWrite = { words: sceneWords, written, stop: () => stopEarly.abort() };
    };
    const dropEarlyWrite = () => {
      earlyWrite?.stop();
      earlyWrite = null;
      sceneWords = null;
    };

    const hooks = {
      onFirstLine(line: OpeningLine) {
        if (spokenFirstLine || getLineProblems(key.topic, line).length > 0) return;
        spokenFirstLine = line;
        settleFirstLine(line);
      },
      onSceneWords(words: SceneWords) {
        if (getSceneWordProblems(key.topic, words).length > 0) return;
        sceneWords = words;
        startEarlyWrite();
      },
    };

    const getNote = (problem: string) => `${problem}${spokenFirstLine ? `\nThe student has already heard this first line, so keep it word for word: ${spokenFirstLine.say}` : ''}`;

    const getFitPlan = async (): Promise<LessonPlan | NoLesson> => {
      let note: string | undefined;
      let refused: { plan: LessonPlan; problems: readonly string[] } | null = null;
      for (let tryIndex = 0; tryIndex < TRIES && !stopper.signal.aborted; tryIndex += 1) {
        try {
          const written = await planner.plan(key.topic, AbortSignal.any([AbortSignal.timeout(PLANNER_LIMIT_MS), stopper.signal]), { ...hooks, ...(note ? { note } : {}) });
          const problems = getPlanProblems(key.topic, written);
          if (problems.length === 0) return spokenFirstLine ? { ...written, opening: [spokenFirstLine, ...written.opening.slice(1)] } : written;
          refused = { plan: written, problems };
          note = getNote(`A check refused it because ${problems.join('; ')}.`);
          warn(`::warning title=Lesson plan::a plan was refused before it was spoken: ${problems.join('; ')}`);
        } catch (error) {
          if (error instanceof PlanRefused) return 'unsafe';
          note = getNote(error instanceof Error ? error.message : String(error));
          warn(`::warning title=Lesson plan::the planner failed: ${String(error)}`);
        }
        dropEarlyWrite();
      }
      canDraw = false;
      if (cardFallback) return getPlainBoardPlan(key.topic, cardFallback, refused);
      return refused?.problems.includes(IS_DANGEROUS) ? 'unsafe' : 'nothing';
    };

    const plan = getFitPlan();
    let scene: Promise<MadeScene> | null = null;
    void plan.then((settled) => {
      settleFirstLine(typeof settled === 'string' ? null : (spokenFirstLine ?? settled.opening[0] ?? null));
      if (typeof settled === 'string' || scene === null) forget();
    });
    const makeFromPlan = (settled: LessonPlan | NoLesson) => {
      if (typeof settled === 'string' || !canDraw) return NO_PLAN;
      const early: EarlyWrite | null = earlyWrite;
      const isEarlyUsable = early !== null && isSameWords(early.words, settled);
      if (!isEarlyUsable) early?.stop();
      return makeScene(maker, { topic: key.topic, ownerId: key.ownerId, plan: settled, signal: stopper.signal, earlyWrite: isEarlyUsable ? early.written : null });
    };
    return {
      plan,
      firstLine,
      getScene() {
        isSceneWanted = true;
        startEarlyWrite();
        scene ??= plan.then(makeFromPlan).finally(forget);
        return scene;
      },
      leave() {
        lessons.count -= 1;
        if (key.ownerId === null || lessons.count > 0) return;
        forget();
        stopper.abort();
      },
    };
  };

  return {
    join(key, { cardFallback } = {}) {
      const found = running.get(key.id);
      if (found) {
        found.lessons.count += 1;
        return found.run;
      }
      const lessons = { count: 1 };
      const entry = { run: undefined as unknown as TopicRun, lessons };
      running.set(key.id, entry);
      entry.run = start(key, cardFallback, lessons);
      return entry.run;
    },
  };
}
