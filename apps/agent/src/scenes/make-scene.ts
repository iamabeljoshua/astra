import { type RichScene, SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { getCodeProblems, getPlanProblems } from './content-check.ts';
import { getPlanBeatProblems, getSceneBeatProblems, getSpokenLines } from './lesson/lesson-beats.ts';
import { getNominalTiming } from './narration.ts';
import type { RenderResult, RenderWorker } from './render-worker.ts';
import { getSceneCommand } from './scene-desk.ts';
import { getSceneKey, type SceneStore } from './scene-store.ts';
import { type LessonPlan, SCENE_THEMES, type SceneBrief, type SceneKey, type SceneOwner, type SceneRepair, type SceneReviewer, type SceneTrace, type SceneTrouble, type SceneVerdict, type SceneWords, type SceneWriter, type StoredScene, type WrittenScene } from './scene-types.ts';
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
  writers: readonly SceneWriter[];
  reviewer: SceneReviewer;
  worker: RenderWorker;
  store: SceneStore;
  now?(): number;
  getWallMs?(): number;
  warn?(line: string): void;
}

export interface SceneRequest {
  topic: string;
  ownerId?: SceneOwner;
  plan: LessonPlan;
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

function getUnseenThemes(render: GoodRender): readonly string[] {
  return SCENE_THEMES.filter((theme) => !render.sheets.some((sheet) => sheet.theme === theme));
}

function getRenderProblems(render: RenderResult, plan: LessonPlan, brief: SceneBrief, warn: (line: string) => void, canKeepLinesThroughText: boolean): readonly string[] {
  if (!render.isOk) return render.reasons;
  if (render.sheets.length === 0) return ['the worker made no pictures, so nobody can review this scene'];
  const unseen = getUnseenThemes(render);
  if (unseen.length > 0) warn(`::warning title=Scene review::the review would see no ${unseen.join(' or ')} pictures, so the scene stops here`);
  const partProblems = render.takes.flatMap(({ parts }) => getSceneBeatProblems({ setup: plan.setup, narration: plan.narration, scene: getSceneCommand({ engine: 'manimgx', id: 'scene-check', moments: brief.moments, parts, durationSeconds: brief.durationSeconds }, CHECK_SCENE_ELEMENT) }));
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
}

async function writeUntilClean(maker: SceneMaker, { brief, plan, values, tally, warn, signal, earlyWrite, isTyped }: WriteRun): Promise<Attempt | null> {
  let repair: SceneRepair | null = null;
  for (const [index, writer] of maker.writers.entries()) {
    if (signal.aborted) return null;
    tally.attempts += 1;
    tally.writer = writer.name;
    const code = await takeWritten(writer, tally, index === 0 && earlyWrite ? earlyWrite : writer.write(brief, repair, AbortSignal.any([AbortSignal.timeout(WRITER_LIMIT_MS), signal])));
    if (code === null) continue;
    const contentProblems = getCodeProblems(code);
    const render = contentProblems.length > 0 || signal.aborted ? null : await maker.worker({ code, moments: brief.moments, durationSeconds: brief.durationSeconds, themes: SCENE_THEMES, values, inspectSeconds: getInspectSeconds(brief) }, AbortSignal.any([AbortSignal.timeout(2 * WRITER_LIMIT_MS), signal]));
    tally.renderMs += render?.ms ?? 0;
    const problems = render ? getRenderProblems(render, plan, brief, warn, isTyped || index === maker.writers.length - 1) : contentProblems;
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

export const canTryNow = ({ store, getWallMs = () => Date.now() }: SceneMaker, key: SceneKey): boolean => getCanTry(store.getTrouble(key), getWallMs());

/** A review can refuse a true scene, and on a card that would leave it with no scene for anyone, so a refusal may be written again after a wait, a few times a day. */
export function canTryAfterRefusal(store: SceneStore, key: SceneKey, nowMs: number): boolean {
  const refusal = store.findRefusal(key);
  if (!refusal) return true;
  const trouble = store.getTrouble(key);
  return getCanTry(trouble.tries === 0 ? { tries: 1, lastAtMs: Date.parse(refusal.savedAt), wasRefused: true } : trouble, nowMs);
}

function toStoredScene({ key, plan, brief, attempt, verdict, trace, values }: { key: SceneKey; plan: LessonPlan; brief: SceneBrief; attempt: Attempt; verdict: SceneVerdict; trace: SceneTrace; values: Readonly<Record<string, number>> }): StoredScene {
  return {
    id: key.id,
    topic: key.topic,
    ownerId: key.ownerId,
    status: 'checked',
    engine: 'manimgx',
    engineVersion: SCENE_ENGINE_VERSIONS.manimgx,
    code: attempt.code,
    narration: plan.narration,
    plan,
    moments: brief.moments,
    parts: attempt.render.takes[0]?.parts ?? [],
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

const NO_LONGER_WANTED: MadeScene = { isOk: false, reasons: ['no longer wanted'] };

export async function makeScene(maker: SceneMaker, { topic, ownerId = null, plan, values = {}, signal = new AbortController().signal, earlyWrite = null }: SceneRequest): Promise<MadeScene> {
  const { store, reviewer, now = () => performance.now(), getWallMs = () => Date.now(), warn = console.warn } = maker;
  const startedAt = now();
  const key = getSceneKey(topic, { ownerId, values });
  const planProblems = [...getPlanBeatProblems(plan), ...getPlanProblems(topic, plan)];
  if (planProblems.length > 0) return { isOk: false, reasons: planProblems };
  if (!getCanTry(store.getTrouble(key), getWallMs())) return { isOk: false, reasons: ['this scene hit errors recently, so it waits before trying again'] };
  const brief = getBrief(topic, plan);
  const tally: Tally = { writer: '', attempts: 0, writeMs: 0, renderMs: 0, costUsd: 0, problems: [] };
  const attempt = await writeUntilClean(maker, { brief, plan, values, tally, warn, signal, earlyWrite, isTyped: ownerId !== null });
  if (signal.aborted) return NO_LONGER_WANTED;
  if (!attempt) {
    noteTrouble(store, key, getWallMs());
    return { isOk: false, reasons: tally.problems };
  }
  // An error is never a verdict, so it saves nothing that could block this topic.
  const verdict = await reviewer.review({ brief, code: attempt.code, sheets: attempt.render.sheets, spokenLines: getSpokenLines(plan) }, AbortSignal.any([AbortSignal.timeout(REVIEWER_LIMIT_MS), signal])).catch((error: unknown) => {
    if (!signal.aborted) noteTrouble(store, key, getWallMs());
    return String(error);
  });
  if (signal.aborted) return NO_LONGER_WANTED;
  if (typeof verdict === 'string') return { isOk: false, reasons: [`the review could not finish: ${verdict}`] };
  if (!verdict.isPass) {
    store.saveRefusal({ key, code: attempt.code, plan, review: verdict.errors, savedAt: new Date(getWallMs()).toISOString() });
    noteTrouble(store, key, getWallMs(), true);
    return { isOk: false, reasons: verdict.errors.map(({ what }) => what) };
  }
  const trace: SceneTrace = { writer: tally.writer, attempts: tally.attempts, writeMs: tally.writeMs, renderMs: tally.renderMs, reviewMs: verdict.ms, totalMs: now() - startedAt, costUsd: tally.costUsd + verdict.costUsd, problems: tally.problems };
  const scene = await store.saveChecked(toStoredScene({ key, plan, brief, attempt, verdict, trace, values }), attempt.render.takes, attempt.render.sheets);
  return { isOk: true, scene };
}
