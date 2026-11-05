import { type RichScene, SCENE_ENGINE_VERSIONS, type SceneEngine } from '@astra/contracts';
import { type ClearedNames, getCodeProblems, getPlanProblems } from './content-check.ts';
import { getPlanBeatProblems, getSceneBeatProblems, getSpokenLines } from './lesson/lesson-beats.ts';
import { getNominalTiming, readMarks } from './narration.ts';
import type { RenderResult, RenderWorker } from './render-worker.ts';
import { getSceneCommand } from './scene-desk.ts';
import { getSceneKey, type SceneStore } from './scene-store.ts';
import { type FixedWords, type LessonPlan, SCENE_THEMES, type SceneBrief, type SceneKey, type SceneOwner, type SceneRepair, type SceneReviewer, type SceneTheme, type SceneTrace, type SceneTrouble, type SceneVerdict, type SceneWords, type SceneWriter, type StoredScene, type WrittenScene } from './scene-types.ts';
import type { MadeTake } from './worker-records.ts';

export const WRITER_LIMIT_MS = 45_000;
const REVIEWER_LIMIT_MS = 60_000;
const SECONDS_AFTER_MOMENT = 1.3;
const FIRST_FRAME_SECONDS = 1.2;
const MOST_TROUBLED_TRIES = 3;
const WAIT_AFTER_TROUBLE_MS = 5 * 60_000;
const WAIT_AFTER_REFUSAL_MS = 60 * 60_000;
const FORGET_TROUBLE_MS = 24 * 60 * 60_000;
const CHECK_SCENE_ELEMENT = 'scene' as RichScene['id'];
const THEMED_SOURCE = /scene-(light|dark)\.py/g;
const MOST_NOTICE_CHARACTERS = 300;
const LINE_THROUGH_TEXT = /(runs|edge) through the text/;

export interface SceneMaker {
  engine?: SceneEngine;
  themes?: readonly SceneTheme[];
  checkCode?(scene: { code: string; topic: string; moments: Readonly<Record<string, number>> }): readonly string[];
  writers: readonly SceneWriter[];
  getLinesToReview?(plan: LessonPlan): readonly string[];
  repairWriter?: SceneWriter;
  reviewer: SceneReviewer;
  worker: RenderWorker;
  store: SceneStore;
  now?(): number;
  getWallMs?(): number;
  warn?(line: string): void;
  /** A run with no student waiting can give a plain writer and a careful review longer. */
  writerLimitMs?: number;
  reviewerLimitMs?: number;
}

export interface SceneRequest {
  topic: string;
  ownerId?: SceneOwner;
  plan: LessonPlan;
  /** Names a reader has cleared for this plan, which a topic run has asked about already. */
  clearedNames?: ClearedNames;
  values?: Readonly<Record<string, number>>;
  signal?: AbortSignal;
  /** The first writer started from the streamed plan, on these same words. */
  earlyWrite?: Promise<WrittenScene> | null;
}

export type MadeScene = { isOk: true; scene: StoredScene } | { isOk: false; reasons: readonly string[] };

type GoodRender = Extract<RenderResult, { isOk: true }>;

interface Attempt {
  code: string;
  render: GoodRender;
}

interface Tally {
  writer: string;
  attempts: number;
  writeMs: number;
  renderMs: number;
  costUsd: number;
  problems: string[];
}

function getInspectSeconds({ moments, durationSeconds }: Pick<SceneBrief, 'moments' | 'durationSeconds'>): number[] {
  const afterMoments = Object.values(moments).map((seconds) => Math.min(seconds + SECONDS_AFTER_MOMENT, durationSeconds));
  return [...new Set([Math.min(FIRST_FRAME_SECONDS, durationSeconds), ...afterMoments])].sort((first, second) => first - second);
}

function getUnseenThemes(render: GoodRender, themes: readonly SceneTheme[]): readonly string[] {
  return themes.filter((theme) => !render.sheets.some((sheet) => sheet.theme === theme));
}

function getRenderProblems(render: RenderResult, plan: LessonPlan, brief: SceneBrief, warn: (line: string) => void, canKeepLinesThroughText: boolean, engine: SceneEngine, themes: readonly SceneTheme[]): readonly string[] {
  if (!render.isOk) return render.reasons;
  if (render.sheets.length === 0) return ['the worker made no pictures, so nobody can review this scene'];
  const unseen = getUnseenThemes(render, themes);
  if (unseen.length > 0) warn(`::warning title=Scene review::the review would see no ${unseen.join(' or ')} pictures, so the scene stops here`);
  const partProblems = (render.parts ? [render.parts] : render.takes.map(({ parts }) => parts)).flatMap((parts) => getSceneBeatProblems({ setup: plan.setup, narration: plan.narration, scene: getSceneCommand({ engine, id: 'scene-check', moments: brief.moments, parts, durationSeconds: brief.durationSeconds }, CHECK_SCENE_ELEMENT) }));
  // A rewrite costs a typed scene its moment and has often failed the same way, so a line through a label stays as a note there and on a last try. A card, which many students see, gets one rewrite first.
  const layoutProblems = new Set(render.layoutProblems.filter((problem) => !canKeepLinesThroughText || !LINE_THROUGH_TEXT.test(problem)).map((problem) => `layout: ${problem.replace(THEMED_SOURCE, 'scene.py')}`));
  return [...unseen.map((theme) => `the worker made no ${theme} pictures, so nobody can review that take`), ...new Set(partProblems), ...layoutProblems];
}

interface WriteRun {
  brief: SceneBrief;
  plan: LessonPlan;
  values: Readonly<Record<string, number>>;
  tally: Tally;
  warn: (line: string) => void;
  signal: AbortSignal;
  earlyWrite: Promise<WrittenScene> | null;
  isTyped: boolean;
  repair?: SceneRepair;
  writers?: readonly SceneWriter[];
}

async function writeUntilClean(maker: SceneMaker, { brief, plan, values, tally, warn, signal, earlyWrite, isTyped, repair: firstRepair, writers = maker.writers }: WriteRun): Promise<Attempt | null> {
  let repair: SceneRepair | null = firstRepair ?? null;
  for (const [index, writer] of writers.entries()) {
    if (signal.aborted) return null;
    tally.attempts += 1;
    tally.writer = writer.name;
    const code = await takeWritten(writer, tally, index === 0 && earlyWrite ? earlyWrite : writer.write(brief, repair, AbortSignal.any([AbortSignal.timeout(maker.writerLimitMs ?? WRITER_LIMIT_MS), signal])));
    if (code === null) continue;
    const contentProblems = [...new Set([...getCodeProblems(code), ...(maker.checkCode?.({ code, topic: brief.topic, moments: brief.moments }) ?? [])])];
    const themes = maker.themes ?? SCENE_THEMES;
    const render = contentProblems.length > 0 || signal.aborted ? null : await maker.worker({ code, moments: brief.moments, durationSeconds: brief.durationSeconds, themes, values, inspectSeconds: getInspectSeconds(brief) }, AbortSignal.any([AbortSignal.timeout(2 * (maker.writerLimitMs ?? WRITER_LIMIT_MS)), signal]));
    tally.renderMs += render?.ms ?? 0;
    const problems = render ? getRenderProblems(render, plan, brief, warn, isTyped || index === writers.length - 1, maker.engine ?? 'manimgx', themes) : contentProblems;
    if (render?.isOk && problems.length === 0) return { code, render };
    tally.problems.push(...problems);
    if (!signal.aborted) warn(`::notice title=Scene try::${writer.name} did not pass: ${problems.join('; ').slice(0, MOST_NOTICE_CHARACTERS)}`);
    repair = { problems, code };
  }
  return null;
}

async function takeWritten(writer: SceneWriter, tally: Tally, writing: Promise<WrittenScene>): Promise<string | null> {
  try {
    const written = await writing;
    tally.writeMs += written.ms;
    tally.costUsd += written.costUsd;
    return written.code;
  } catch (error) {
    tally.writeMs += WRITER_LIMIT_MS;
    tally.problems.push(`writer ${writer.name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const getTakeBytes = (takes: readonly MadeTake[]) => Object.fromEntries(takes.map(({ theme, bytes }) => [theme, bytes.length])) as StoredScene['takeBytes'];

export function getBrief(topic: string, plan: SceneWords): SceneBrief {
  return { topic, narration: plan.narration, plan: plan.plan, ...getNominalTiming(plan.narration) };
}

const isTroubleForgotten = ({ lastAtMs }: SceneTrouble, nowMs: number) => nowMs - lastAtMs >= FORGET_TROUBLE_MS;

function getCanTry(trouble: SceneTrouble, nowMs: number): boolean {
  if (trouble.tries === 0 || isTroubleForgotten(trouble, nowMs)) return true;
  return trouble.tries < MOST_TROUBLED_TRIES && nowMs - trouble.lastAtMs >= (trouble.wasRefused ? WAIT_AFTER_REFUSAL_MS : WAIT_AFTER_TROUBLE_MS);
}

function noteTrouble(store: SceneStore, key: SceneKey, nowMs: number, wasRefused = false): void {
  const trouble = store.getTrouble(key);
  store.saveTrouble(key, { tries: isTroubleForgotten(trouble, nowMs) ? 1 : trouble.tries + 1, lastAtMs: nowMs, wasRefused });
}

export const canTryNow = ({ store, getWallMs = () => Date.now() }: Pick<SceneMaker, 'store' | 'getWallMs'>, key: SceneKey): boolean => !store.isFlagged(key) && getCanTry(store.getTrouble(key), getWallMs());

/** A review can refuse a true scene, and on a card that would leave it with no scene for anyone, so a refusal may be written again after a wait, a few times a day. */
export function canTryAfterRefusal(store: SceneStore, key: SceneKey, nowMs: number): boolean {
  const refusal = store.findRefusal(key);
  if (!refusal) return true;
  const trouble = store.getTrouble(key);
  return getCanTry(trouble.tries === 0 ? { tries: 1, lastAtMs: Date.parse(refusal.savedAt), wasRefused: true } : trouble, nowMs);
}

function toStoredScene({ engine, key, plan, brief, attempt, verdict, trace, values }: { engine: SceneEngine; key: SceneKey; plan: LessonPlan; brief: SceneBrief; attempt: Attempt; verdict: SceneVerdict; trace: SceneTrace; values: Readonly<Record<string, number>> }): StoredScene {
  return {
    id: key.id,
    topic: key.topic,
    ownerId: key.ownerId,
    status: 'checked',
    engine,
    engineVersion: SCENE_ENGINE_VERSIONS[engine],
    code: attempt.code,
    ...(engine === 'kit' ? { reviewed: true } : {}),
    narration: plan.narration,
    plan,
    moments: brief.moments,
    parts: attempt.render.parts ?? attempt.render.takes[0]?.parts ?? [],
    durationSeconds: brief.durationSeconds,
    declared: attempt.render.declared,
    values,
    review: verdict.errors,
    layoutNotes: [...attempt.render.layoutNotes, ...attempt.render.layoutProblems],
    isCheckedByPerson: false,
    takeBytes: getTakeBytes(attempt.render.takes),
    trace,
    savedAt: new Date().toISOString(),
  };
}

const getMarkIds = (narration: string) => readMarks(narration).marks.map(({ id }) => id).join(' ');

// The code keeps its moments by name, so words that move a mark or fail a check stay out, and the review still has the old words to refuse.
function getPlanWithWords(topic: string, plan: LessonPlan, words: FixedWords | undefined, cleared: ClearedNames | undefined): LessonPlan {
  if (!words) return plan;
  const changed = { ...plan, ...words };
  const isSound = getMarkIds(changed.narration) === getMarkIds(plan.narration) && getPlanBeatProblems(changed).length === 0 && getPlanProblems(topic, changed, cleared).length === 0;
  return isSound ? changed : plan;
}

const NO_LONGER_WANTED: MadeScene = { isOk: false, reasons: ['no longer wanted'] };

interface Reviewed {
  attempt: Attempt;
  plan: LessonPlan;
  brief: SceneBrief;
}

interface RewriteRequest {
  run: Pick<WriteRun, 'values' | 'tally' | 'warn' | 'signal' | 'isTyped'>;
  topic: string;
  reviewed: Reviewed;
  refused: SceneVerdict;
  clearedNames: ClearedNames | undefined;
}

async function rewriteAfterReview(maker: SceneMaker, writer: SceneWriter, { run, topic, reviewed, refused, clearedNames }: RewriteRequest): Promise<Reviewed | null> {
  const repair = { problems: refused.errors.map(({ what, truth }) => `${what} What is true: ${truth}`), code: reviewed.attempt.code, canChangeWords: true };
  const writing = writer.write(reviewed.brief, repair, AbortSignal.any([AbortSignal.timeout(maker.writerLimitMs ?? WRITER_LIMIT_MS), run.signal]));
  const words = await writing.then(({ words: fixed }) => fixed, () => undefined);
  const plan = getPlanWithWords(topic, reviewed.plan, words, clearedNames);
  const brief = getBrief(topic, plan);
  const attempt = await writeUntilClean(maker, { ...run, brief, plan, earlyWrite: writing, repair, writers: [writer] });
  return attempt ? { attempt, plan, brief } : null;
}

export async function makeScene(maker: SceneMaker, { topic, ownerId = null, plan, clearedNames, values = {}, signal = new AbortController().signal, earlyWrite = null }: SceneRequest): Promise<MadeScene> {
  const { store, reviewer, now = () => performance.now(), getWallMs = () => Date.now(), warn = console.warn } = maker;
  const startedAt = now();
  const key = getSceneKey(topic, { ownerId, values });
  const planProblems = [...getPlanBeatProblems(plan), ...getPlanProblems(topic, plan, clearedNames)];
  if (planProblems.length > 0) return { isOk: false, reasons: planProblems };
  if (store.isFlagged(key)) return { isOk: false, reasons: ['a person flagged this scene, so it waits until someone has looked at it'] };
  if (!getCanTry(store.getTrouble(key), getWallMs())) return { isOk: false, reasons: ['this scene hit errors recently, so it waits before trying again'] };
  const firstBrief = getBrief(topic, plan);
  const tally: Tally = { writer: '', attempts: 0, writeMs: 0, renderMs: 0, costUsd: 0, problems: [] };
  const run = { values, tally, warn, signal, isTyped: ownerId !== null };
  const firstAttempt = await writeUntilClean(maker, { ...run, brief: firstBrief, plan, earlyWrite });
  if (signal.aborted) return NO_LONGER_WANTED;
  if (!firstAttempt) {
    noteTrouble(store, key, getWallMs());
    return { isOk: false, reasons: tally.problems };
  }
  // An error is never a verdict, so it saves nothing that could block this topic.
  const review = (reviewed: Reviewed) =>
    reviewer.review({ brief: reviewed.brief, code: reviewed.attempt.code, sheets: reviewed.attempt.render.sheets, spokenLines: maker.getLinesToReview?.(reviewed.plan) ?? getSpokenLines(reviewed.plan) }, AbortSignal.any([AbortSignal.timeout(maker.reviewerLimitMs ?? REVIEWER_LIMIT_MS), signal])).catch((error: unknown) => {
      if (!signal.aborted) noteTrouble(store, key, getWallMs());
      return String(error);
    });
  let reviewed: Reviewed = { attempt: firstAttempt, plan, brief: firstBrief };
  let verdict = await review(reviewed);
  if (typeof verdict !== 'string' && !verdict.isPass && maker.repairWriter && !signal.aborted) {
    tally.problems.push(...verdict.errors.map(({ what }) => `review: ${what}`));
    const rewritten = await rewriteAfterReview(maker, maker.repairWriter, { run, topic, reviewed, refused: verdict, clearedNames });
    if (rewritten) {
      reviewed = rewritten;
      verdict = await review(reviewed);
    }
  }
  if (signal.aborted) return NO_LONGER_WANTED;
  if (typeof verdict === 'string') return { isOk: false, reasons: [`the review could not finish: ${verdict}`] };
  if (!verdict.isPass) {
    store.saveRefusal({ key, code: reviewed.attempt.code, plan: reviewed.plan, review: verdict.errors, savedAt: new Date(getWallMs()).toISOString() });
    noteTrouble(store, key, getWallMs(), true);
    return { isOk: false, reasons: verdict.errors.map(({ what }) => what) };
  }
  const trace: SceneTrace = { writer: tally.writer, attempts: tally.attempts, writeMs: tally.writeMs, renderMs: tally.renderMs, reviewMs: verdict.ms, totalMs: now() - startedAt, costUsd: tally.costUsd + verdict.costUsd, problems: tally.problems };
  const scene = await store.saveChecked(toStoredScene({ engine: maker.engine ?? 'manimgx', key, plan: reviewed.plan, brief: reviewed.brief, attempt: reviewed.attempt, verdict, trace, values }), reviewed.attempt.render.takes, reviewed.attempt.render.sheets);
  return { isOk: true, scene };
}
