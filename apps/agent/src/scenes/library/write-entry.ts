import { getSpokenWords } from '@astra/contracts';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneModels } from '../../providers/anthropic.scenes.ts';
import { getPlanNames, getPlanProblems } from '../content-check.ts';
import { getSpokenLines } from '../lesson/lesson-beats.ts';
import { makeScene } from '../make-scene.ts';
import type { RenderWorker } from '../render-worker.ts';
import { getSceneKey, type SceneStore } from '../scene-store.ts';
import type { LessonPlan, SceneRefusal } from '../scene-types.ts';
import type { LibraryLedger } from './library-ledger.ts';
import type { LibraryEntry } from './library-list.ts';

const PLANNER_LIMIT_MS = 90_000;
const NAME_READER_LIMIT_MS = 15_000;
const WRITER_LIMIT_MS = 150_000;
const REVIEWER_LIMIT_MS = 180_000;
const MOST_SENTENCE_WORDS = 25;
const LONG_DASH = /[–—]/;
const SENTENCE_END = /(?<=[.!?])\s+/;
const NO_TROUBLE = { tries: 0, lastAtMs: 0 };

export interface LibraryRun {
  makeModels(entry: LibraryEntry): SceneModels;
  worker: RenderWorker;
  store: SceneStore;
  /** Holds what the run refused, so a person can read why, and a student's lesson never sees it. */
  runStore: SceneStore;
  ledger: LibraryLedger;
  runFolder: string;
  warn?(line: string): void;
}

/** A line shown to every student is held to the spoken rules outright, where a lesson would split or tolerate it. */
export function getLibraryLineProblems(plan: LessonPlan): string[] {
  const lines = getSpokenLines(plan);
  const dashed = lines.filter((line) => LONG_DASH.test(line));
  const long = lines.flatMap((line) => line.split(SENTENCE_END)).filter((sentence) => getSpokenWords(sentence).length > MOST_SENTENCE_WORDS);
  return [...dashed.map((line) => `a line holds a long dash, which we never use: ${line}`), ...long.map((sentence) => `a sentence runs past ${MOST_SENTENCE_WORDS} words: ${sentence}`)];
}

const getPlanPath = ({ runFolder }: LibraryRun, entry: LibraryEntry) => join(runFolder, 'plans', `${entry.id}.json`);

function savePlan(path: string, plan: LessonPlan): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(`${path}.part`, JSON.stringify(plan, null, 1));
  renameSync(`${path}.part`, path);
}

// A plan is paid for, so a crash or a failed drawing reuses it. Only words something refused get written again, and the new try hears why.
async function getPlan(run: LibraryRun, entry: LibraryEntry, models: SceneModels): Promise<LessonPlan> {
  const path = getPlanPath(run, entry);
  const last = run.ledger.getLastTry(entry.id);
  const isRefused = last?.stage === 'plan' || last?.stage === 'review';
  if (isRefused) rmSync(path, { force: true });
  else if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as LessonPlan;
  const note = isRefused ? `A check refused it because: ${last.reasons.join('; ')}` : undefined;
  const plan: LessonPlan = await models.planner.plan(entry.title, AbortSignal.timeout(PLANNER_LIMIT_MS), note ? { note } : {});
  savePlan(path, plan);
  return plan;
}

const getRefusalReasons = ({ review }: SceneRefusal) => review.map(({ what, truth }) => `${what} What is true: ${truth}`);

/** One try at one scene, ending in a ledger line. Returns whether the scene joined the library. */
export async function writeEntry(run: LibraryRun, entry: LibraryEntry): Promise<boolean> {
  const { ledger, store, worker } = run;
  if (store.find(getSceneKey(entry.title))) return true;
  try {
    const models = run.makeModels(entry);
    const plan = await getPlan(run, entry, models);
    const clearedNames = await models.nameReader.clear(getPlanNames(entry.title, plan), AbortSignal.timeout(NAME_READER_LIMIT_MS));
    const planProblems = [...getPlanProblems(entry.title, plan, clearedNames), ...getLibraryLineProblems(plan)];
    if (planProblems.length > 0) {
      ledger.noteTry(entry.id, 'plan', planProblems);
      return false;
    }
    const refusals: SceneRefusal[] = [];
    // A live lesson waits on these records, so a failed library try leaves none, and a missing scene is simply written live.
    const tryStore: SceneStore = { ...store, getTrouble: () => NO_TROUBLE, saveTrouble: () => {}, saveRefusal: (refusal) => { refusals.push(refusal); run.runStore.saveRefusal(refusal); } };
    const made = await makeScene({ writers: [models.writer, models.fallbackWriter], reviewer: models.reviewer, worker, store: tryStore, writerLimitMs: WRITER_LIMIT_MS, reviewerLimitMs: REVIEWER_LIMIT_MS, ...(run.warn ? { warn: run.warn } : {}) }, { topic: entry.title, plan, clearedNames });
    const [refusal] = refusals;
    if (made.isOk) ledger.noteTry(entry.id, 'saved');
    else if (refusal) ledger.noteTry(entry.id, 'review', getRefusalReasons(refusal));
    else ledger.noteTry(entry.id, 'draw', made.reasons);
    return made.isOk;
  } catch (error) {
    ledger.noteTry(entry.id, 'error', [error instanceof Error ? error.message : String(error)]);
    return false;
  }
}
