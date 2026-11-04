import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { getNominalTiming } from './narration.ts';
import type { MadeTake, RenderResult, RenderWorker } from './render-worker.ts';
import { getSceneId, type SceneStore } from './scene-store.ts';
import { type LessonPlan, SCENE_THEMES, type SceneBrief, type SceneRepair, type SceneReviewer, type SceneTrace, type SceneWriter, type StoredScene } from './scene-types.ts';

/** Past this, the fallback writer gets the job, rather than racing two at double the cost. */
export const WRITER_LIMIT_MS = 45_000;
const REVIEWER_LIMIT_MS = 60_000;
const SECONDS_AFTER_MOMENT = 1.3;
const FIRST_FRAME_SECONDS = 1.2;

export interface SceneMaker {
  writers: readonly SceneWriter[];
  reviewer: SceneReviewer;
  worker: RenderWorker;
  store: SceneStore;
  now?(): number;
}

export interface SceneRequest {
  topic: string;
  plan: LessonPlan;
  values?: Readonly<Record<string, number>>;
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

function getRenderProblems(render: RenderResult): readonly string[] {
  if (!render.isOk) return render.reasons;
  if (render.sheets.length === 0) return ['the worker made no pictures, so nobody can review this scene'];
  return render.layoutProblems.map((problem) => `layout: ${problem}`);
}

// Writes, then runs the code in the locked worker. One writer that stalls or fails its gate hands over to the next, which sees why.
async function writeUntilClean(maker: SceneMaker, brief: SceneBrief, values: Readonly<Record<string, number>>, tally: Tally): Promise<Attempt | null> {
  let repair: SceneRepair | null = null;
  for (const writer of maker.writers) {
    tally.attempts += 1;
    tally.writer = writer.name;
    const code = await writeWithLimit(writer, brief, repair, tally);
    if (code === null) continue;
    const render = await maker.worker({ code, moments: brief.moments, durationSeconds: brief.durationSeconds, themes: SCENE_THEMES, values, inspectSeconds: getInspectSeconds(brief) }, AbortSignal.timeout(2 * WRITER_LIMIT_MS));
    tally.renderMs += render.ms;
    const problems = getRenderProblems(render);
    if (render.isOk && problems.length === 0) return { code, render };
    tally.problems.push(...problems);
    repair = { problems, code };
  }
  return null;
}

async function writeWithLimit(writer: SceneWriter, brief: SceneBrief, repair: SceneRepair | null, tally: Tally): Promise<string | null> {
  try {
    const written = await writer.write(brief, repair, AbortSignal.timeout(WRITER_LIMIT_MS));
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

export function getBrief(topic: string, plan: LessonPlan): SceneBrief {
  return { topic, narration: plan.narration, plan: plan.plan, ...getNominalTiming(plan.narration) };
}

// Everything that makes it this far is saved, so the next student gets a checked scene free. A scene the review failed is saved too, marked, so nobody pays to write it again and a person can read why.
export async function makeScene(maker: SceneMaker, { topic, plan, values = {} }: SceneRequest): Promise<MadeScene> {
  const now = maker.now ?? (() => performance.now());
  const startedAt = now();
  const brief = getBrief(topic, plan);
  const tally: Tally = { writer: '', attempts: 0, writeMs: 0, renderMs: 0, costUsd: 0, problems: [] };
  const attempt = await writeUntilClean(maker, brief, values, tally);
  if (!attempt) return { isOk: false, reasons: tally.problems };
  const verdict = await maker.reviewer.review({ brief, code: attempt.code, sheets: attempt.render.sheets }, AbortSignal.timeout(REVIEWER_LIMIT_MS)).catch((error: unknown) => ({ isPass: false, errors: [{ moment: 'review', what: String(error), truth: '', confidence: 'high' }], ms: 0, costUsd: 0, model: '' }));
  const trace: SceneTrace = { writer: tally.writer, attempts: tally.attempts, writeMs: tally.writeMs, renderMs: tally.renderMs, reviewMs: verdict.ms, totalMs: now() - startedAt, costUsd: tally.costUsd + verdict.costUsd, problems: tally.problems };
  const scene: StoredScene = {
    id: getSceneId(topic, values),
    topic,
    status: verdict.isPass ? 'checked' : 'rejected',
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
    layoutNotes: attempt.render.layoutNotes,
    isCheckedByPerson: false,
    takeBytes: getTakeBytes(attempt.render.takes),
    trace,
    savedAt: new Date().toISOString(),
  };
  maker.store.save(scene, attempt.render.takes, attempt.render.sheets);
  return verdict.isPass ? { isOk: true, scene } : { isOk: false, reasons: verdict.errors.map(({ what }) => what) };
}
