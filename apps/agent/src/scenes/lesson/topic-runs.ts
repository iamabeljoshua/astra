import { type ClearedNames, getLineNames, getLineProblems, getPlanNames, getPlanProblems, getRefusedNames, getSceneWordNames, getSceneWordProblems, IS_DANGEROUS, IS_OFF_TOPIC, isListedName } from '../content-check.ts';
import { canTryNow, getBrief, type MadeScene, makeScene, type SceneMaker, WRITER_LIMIT_MS } from '../make-scene.ts';
import { type LessonPlan, type LessonPlanner, type NameReader, type NoLesson, type OpeningLine, PlanRefused, type SceneKey, type SceneWords, type WrittenScene } from '../scene-types.ts';

const PLANNER_LIMIT_MS = 15_000;
const NAME_READER_LIMIT_MS = 3000;
const TRIES = 2;
const NO_PLAN: MadeScene = { isOk: false, reasons: ['no plan'] };
const NOTES_NOT_LOADING = "My notes for this lesson aren't loading right now, so open it again in a minute and we'll go further.";
const DEFAULT_PLAIN_LINE: OpeningLine = { say: 'What do you already know about this one?' };
const NO_LESSON_FOR: Record<PlanRefused['refusedFor'], NoLesson> = { help: 'unsafe', dangerous: 'declined', person: 'nothing' };

export interface TopicRun {
  /** What this lesson says. A plan refused for its words teaches from its clean lines at once, so this can settle before the retry that the scene waits for. */
  plan: Promise<LessonPlan | NoLesson>;
  firstLine: Promise<OpeningLine | null>;
  getScene(): Promise<MadeScene>;
  /** A lesson calls this as it ends. A typed scene stops once no lesson is left on it. A card keeps going, because the next student gets it free. */
  leave(): void;
}

export interface TopicRuns {
  join(key: SceneKey, options?: { plainLine?: OpeningLine }): TopicRun;
}

interface EarlyWrite {
  words: SceneWords;
  written: Promise<WrittenScene>;
  stop(): void;
}

interface RefusedPlan {
  plan: LessonPlan;
  problems: readonly string[];
}

const isSameWords = (first: SceneWords, second: SceneWords) => first.narration === second.narration && first.plan === second.plan;

const canTeachCleanLines = ({ problems }: RefusedPlan) => !problems.includes(IS_OFF_TOPIC) && !problems.includes(IS_DANGEROUS);

const toPlainPlan = (opening: readonly OpeningLine[], more: readonly OpeningLine[], close: string): LessonPlan => ({ opening: [...opening], more: [...more], setup: '', narration: '', plan: '', close });

// A plan refused for some of its words still has lines fit to say, and no scene comes from them.
function getCleanLinesPlan(topic: string, plainLine: OpeningLine, { plan }: RefusedPlan, cleared: ClearedNames): LessonPlan | null {
  const isClean = (line: OpeningLine) => getLineProblems(topic, line, cleared).length === 0;
  const opening = plan.opening.filter(isClean);
  return opening.length > 0 ? toPlainPlan(opening, plan.more?.filter(isClean) ?? [], isClean({ say: plan.close }) ? plan.close : plainLine.say) : null;
}

// A typed topic is a student's words shaped by a model, so it gets the same check before it is said, and with no words fit to say there is no lesson.
function getTopicOnlyPlan(topic: string, plainLine: OpeningLine): LessonPlan | 'nothing' {
  const topicLine = { say: `Let's think about this one: ${topic}.` };
  return getLineProblems(topic, topicLine).length === 0 ? { ...toPlainPlan([topicLine, plainLine], [], NOTES_NOT_LOADING), hasNoModel: true } : 'nothing';
}

const getRefusalNote = (topic: string, problems: readonly string[], names: readonly string[]) => `A check refused it because ${problems.join('; ')}.${names.length > 0 ? ` Do not use these words at all: ${names.join(', ')}.` : ''}${problems.includes(IS_OFF_TOPIC) ? ` Say these words in the first or second line: ${topic}.` : ''}`;

// A place comes up on most lessons and in many lines, and only a real answer is kept, so a reader that failed asks again next time.
function createNameClearance(reader: NameReader | undefined, warn: (line: string) => void) {
  const known = new Map<string, boolean>();
  return async (names: readonly string[], signal: AbortSignal): Promise<ClearedNames> => {
    const unread = [...new Set(names)].filter((name) => !known.has(name) && !isListedName(name));
    if (unread.length > 0 && reader) {
      try {
        const cleared = await reader.clear(unread, AbortSignal.any([AbortSignal.timeout(NAME_READER_LIMIT_MS), signal]));
        for (const name of unread) known.set(name, cleared.has(name));
      } catch (error) {
        warn(`::warning title=Lesson plan::the name reader failed: ${String(error)}`);
      }
    }
    return new Set(names.filter((name) => known.get(name)));
  };
}

export function createTopicRuns({ planner, nameReader, ...maker }: SceneMaker & { planner: LessonPlanner; nameReader?: NameReader }): TopicRuns {
  const running = new Map<string, { run: TopicRun; lessons: { count: number } }>();
  const warn = maker.warn ?? console.warn;
  const readNames = createNameClearance(nameReader, warn);

  const start = (key: SceneKey, plainLine: OpeningLine, lessons: { count: number }): TopicRun => {
    const stopper = new AbortController();
    const forget = () => {
      if (running.get(key.id)?.lessons === lessons) running.delete(key.id);
    };
    let settleFirstLine: (line: OpeningLine | null) => void = () => {};
    const firstLine = new Promise<OpeningLine | null>((resolve) => {
      settleFirstLine = resolve;
    });
    let settleWords: (words: LessonPlan | NoLesson) => void = () => {};
    const words = new Promise<LessonPlan | NoLesson>((resolve) => {
      settleWords = resolve;
    });
    const cleared = new Set<string>();
    const clearNames = async (names: readonly string[]) => {
      for (const name of await readNames(names, stopper.signal)) cleared.add(name);
    };
    let spokenFirstLine: OpeningLine | null = null;
    let isSceneWanted = false;
    let sceneWords: SceneWords | null = null;
    let earlyWrite: EarlyWrite | null = null;
    let tryNumber = 0;

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

    // A line with no capitalised name must go on at once, because it is what ends the silence after the student asks. One with a name waits for its reader.
    const afterNamesCleared = (names: readonly string[], use: () => void) => {
      if (names.every((name) => cleared.has(name))) use();
      else void clearNames(names).then(use);
    };

    const hooks = {
      onFirstLine(line: OpeningLine) {
        afterNamesCleared(getLineNames(key.topic, line), () => {
          if (spokenFirstLine || getLineProblems(key.topic, line, cleared).length > 0) return;
          spokenFirstLine = line;
          settleFirstLine(line);
        });
      },
      onSceneWords(streamed: SceneWords) {
        const streamedOnTry = tryNumber;
        afterNamesCleared(getSceneWordNames(key.topic, streamed), () => {
          if (streamedOnTry !== tryNumber || getSceneWordProblems(key.topic, streamed, cleared).length > 0) return;
          sceneWords = streamed;
          startEarlyWrite();
        });
      },
    };

    const getNote = (problem: string) => `${problem}${spokenFirstLine ? `\nThe student has already heard this first line, so keep it word for word: ${spokenFirstLine.say}` : ''}`;

    const keepFirstLine = (plan: LessonPlan): LessonPlan => (spokenFirstLine ? { ...plan, opening: [spokenFirstLine, ...plan.opening.filter((line) => line.say !== spokenFirstLine?.say)] } : plan);

    let refused: RefusedPlan | null = null;

    // Null means no plan fit to draw from.
    const getFitPlan = async (): Promise<LessonPlan | null> => {
      let note: string | undefined;
      for (tryNumber = 0; tryNumber < TRIES && !stopper.signal.aborted; tryNumber += 1) {
        try {
          const written = await planner.plan(key.topic, AbortSignal.any([AbortSignal.timeout(PLANNER_LIMIT_MS), stopper.signal]), { ...hooks, ...(note ? { note } : {}) });
          await clearNames(getPlanNames(key.topic, written));
          const problems = getPlanProblems(key.topic, written, cleared);
          if (problems.length === 0) return spokenFirstLine ? { ...written, opening: [spokenFirstLine, ...written.opening.slice(1)] } : written;
          refused = { plan: written, problems };
          note = getNote(getRefusalNote(key.topic, problems, getRefusedNames(key.topic, written, cleared)));
          warn(`::warning title=Lesson plan::a plan was refused before it was spoken: ${problems.join('; ')}`);
          const cleanLines = canTeachCleanLines(refused) ? getCleanLinesPlan(key.topic, plainLine, refused, cleared) : null;
          if (cleanLines) settleWords(keepFirstLine(cleanLines));
        } catch (error) {
          if (error instanceof PlanRefused) {
            settleWords(NO_LESSON_FOR[error.refusedFor]);
            return null;
          }
          note = getNote(error instanceof Error ? error.message : String(error));
          warn(`::warning title=Lesson plan::the planner failed: ${String(error)}`);
        }
        dropEarlyWrite();
      }
      return null;
    };

    const fitPlan = getFitPlan();
    let scene: Promise<MadeScene> | null = null;
    void words.then((settled) => settleFirstLine(typeof settled === 'string' ? null : (spokenFirstLine ?? settled.opening[0] ?? null)));
    void fitPlan.then((fit) => {
      if (fit) settleWords(fit);
      else if (refused?.problems.includes(IS_DANGEROUS)) settleWords('declined');
      else {
        const plain = (refused && canTeachCleanLines(refused) ? getCleanLinesPlan(key.topic, plainLine, refused, cleared) : null) ?? getTopicOnlyPlan(key.topic, plainLine);
        settleWords(typeof plain === 'string' ? plain : keepFirstLine(plain));
      }
      if (!fit || scene === null) forget();
    });
    const makeFromPlan = (fit: LessonPlan | null) => {
      if (!fit) return NO_PLAN;
      const early: EarlyWrite | null = earlyWrite;
      const isEarlyUsable = early !== null && isSameWords(early.words, fit);
      if (!isEarlyUsable) early?.stop();
      return makeScene(maker, { topic: key.topic, ownerId: key.ownerId, plan: fit, clearedNames: cleared, signal: stopper.signal, earlyWrite: isEarlyUsable ? early.written : null });
    };
    return {
      plan: words,
      firstLine,
      getScene() {
        isSceneWanted = true;
        startEarlyWrite();
        scene ??= fitPlan.then(makeFromPlan).finally(forget);
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
    join(key, { plainLine = DEFAULT_PLAIN_LINE } = {}) {
      const found = running.get(key.id);
      if (found) {
        found.lessons.count += 1;
        return found.run;
      }
      const lessons = { count: 1 };
      const entry = { run: undefined as unknown as TopicRun, lessons };
      running.set(key.id, entry);
      entry.run = start(key, plainLine, lessons);
      return entry.run;
    },
  };
}
