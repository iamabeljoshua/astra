import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SceneModels } from '../src/providers/anthropic.scenes.ts';
import { canTryNow, makeScene } from '../src/scenes/make-scene.ts';
import { createLibraryLedger } from '../src/scenes/library/library-ledger.ts';
import { getLibraryList, type LibraryEntry } from '../src/scenes/library/library-list.ts';
import { getLibraryLineProblems, type LibraryRun, writeEntry } from '../src/scenes/library/write-entry.ts';
import type { RenderResult, RenderWorker } from '../src/scenes/render-worker.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneReviewer } from '../src/scenes/scene-types.ts';

const ENTRY: LibraryEntry = { id: 'seasons', kind: 'opening', topicId: 'seasons', title: 'What really causes the seasons', subject: 'Astronomy' };
const PLAN: LessonPlan = { opening: [{ say: 'The seasons come from a tilt.' }, { say: 'What really causes the seasons is that tilt.' }], more: [], setup: 'Watch the axis.', narration: '[[axis]] Earth leans on its axis. [[orbit]] It keeps that lean all year round.', plan: 'axis: a tilted line through Earth\norbit: Earth moves around the Sun', close: 'Which half leans toward the Sun in June?' };
const USAGE = { model: 'fake', ms: 1, costUsd: 0.05 };
const GOOD_RENDER: RenderResult = { isOk: true, takes: [{ theme: 'light', bytes: Buffer.from('light'), makeMs: 1, seconds: 8, parts: ['axis'] }, { theme: 'dark', bytes: Buffer.from('dark'), makeMs: 1, seconds: 8, parts: ['axis'] }], sheets: [{ theme: 'light', bytes: Buffer.from('png') }, { theme: 'dark', bytes: Buffer.from('png') }], layoutProblems: [], layoutNotes: [], declared: {}, ms: 5 };
const PASSING: SceneReviewer = { review: async () => ({ isPass: true, errors: [], ...USAGE }) };
const REFUSING: SceneReviewer = { review: async () => ({ isPass: false, errors: [{ moment: 'axis', what: 'the tilt is drawn at ten degrees', truth: 'the tilt is about twenty three degrees', confidence: 'high' }], ...USAGE }) };

function setUp({ reviewer = PASSING, render = GOOD_RENDER }: { reviewer?: SceneReviewer; render?: RenderResult } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scene-library-'));
  const runFolder = join(root, 'library-run');
  const notes: (string | undefined)[] = [];
  const calls = { plans: 0, writes: 0 };
  const models: SceneModels = {
    planner: { plan: async (_topic, _signal, hooks) => { calls.plans += 1; notes.push(hooks?.note); return { ...PLAN, ...USAGE }; } },
    writer: { name: 'first', write: async () => { calls.writes += 1; return { code: 'class Lesson(Lesson2D): pass', ...USAGE }; } },
    fallbackWriter: { name: 'second', write: async () => { calls.writes += 1; return { code: 'class Lesson(Lesson2D): pass', ...USAGE }; } },
    reviewer,
    nameReader: { clear: async (names) => new Set(names) },
    kitWriter: { name: 'unused', write: async () => { throw new Error('the library writes no live kit scene'); } },
    kitFallbackWriter: { name: 'unused', write: async () => { throw new Error('the library writes no live kit scene'); } },
    kitReviewer: reviewer,
    router: { route: async () => { throw new Error('the library does not route'); } },
  };
  const worker: RenderWorker = async () => render;
  const run: LibraryRun = { makeModels: () => models, worker, store: createSceneStore(root), runStore: createSceneStore(runFolder), ledger: createLibraryLedger(join(runFolder, 'ledger.jsonl')), runFolder, warn: () => {} };
  return { root, run, calls, notes };
}

describe('the library list', () => {
  const list = getLibraryList();

  it('holds 133 scenes, 48 openings and 5 more for each of 17 topics', () => {
    const deeper = list.filter(({ kind }) => kind === 'deeper');
    const deeperTopics = new Set(deeper.map(({ topicId }) => topicId));
    expect(list).toHaveLength(133);
    expect(list.filter(({ kind }) => kind === 'opening')).toHaveLength(48);
    expect(deeperTopics.size).toBe(17);
    for (const topicId of deeperTopics) expect(deeper.filter((entry) => entry.topicId === topicId)).toHaveLength(5);
  });

  it('gives every entry its own title and a Home topic to belong to', () => {
    const openingTopics = new Set(list.filter(({ kind }) => kind === 'opening').map(({ topicId }) => topicId));
    expect(new Set(list.map(({ title }) => title.toLowerCase())).size).toBe(133);
    expect(new Set(list.map(({ id }) => id)).size).toBe(133);
    expect(list.every(({ topicId, subject }) => openingTopics.has(topicId) && subject !== '')).toBe(true);
  });
});

describe('writing one library scene', () => {
  it('saves a scene that passes review as one every student may see', async () => {
    const { run } = setUp();
    expect(await writeEntry(run, ENTRY)).toBe(true);
    expect(run.store.find(getSceneKey(ENTRY.title))?.ownerId).toBeNull();
    expect(run.ledger.getLastTry(ENTRY.id)?.stage).toBe('saved');
  });

  it('keeps a scene a review refused out of the library, and leaves a live lesson nothing to wait on', async () => {
    const { run, root } = setUp({ reviewer: REFUSING });
    expect(await writeEntry(run, ENTRY)).toBe(false);
    const key = getSceneKey(ENTRY.title);
    expect(run.store.find(key)).toBeNull();
    expect(run.store.findRefusal(key)).toBeNull();
    expect(run.store.getTrouble(key).tries).toBe(0);
    expect(existsSync(join(root, 'trouble'))).toBe(false);
    expect(run.runStore.findRefusal(key)?.review[0]?.what).toContain('ten degrees');
    expect(run.ledger.getLastTry(ENTRY.id)?.stage).toBe('review');
  });

  it('pays nothing for a scene already saved, so a restart costs no second write', async () => {
    const { run, calls } = setUp();
    await writeEntry(run, ENTRY);
    const paidOnce = { ...calls };
    const spentOnce = run.ledger.getTotalUsd();
    expect(await writeEntry(run, ENTRY)).toBe(true);
    expect(calls).toEqual(paidOnce);
    expect(run.ledger.getTotalUsd()).toBe(spentOnce);
  });

  it('writes new words after a refusal, and tells the planner why', async () => {
    const { run, calls, notes } = setUp({ reviewer: REFUSING });
    await writeEntry(run, ENTRY);
    await writeEntry(run, ENTRY);
    expect(calls.plans).toBe(2);
    expect(notes[1]).toContain('about twenty three degrees');
  });

  it('keeps a paid plan when only the drawing failed', async () => {
    const { run, calls } = setUp({ render: { isOk: false, stage: 'gate', reasons: ['import os is not allowed'], ms: 1 } });
    await writeEntry(run, ENTRY);
    await writeEntry(run, ENTRY);
    expect(calls.plans).toBe(1);
    expect(calls.writes).toBe(4);
    expect(run.ledger.getLastTry(ENTRY.id)?.stage).toBe('draw');
  });

  it('asks the next try to fix what the last one wrote', async () => {
    const { run } = setUp({ render: { isOk: false, stage: 'gate', reasons: ['a label ran off the frame'], ms: 1 } });
    await writeEntry(run, ENTRY);
    const models = run.makeModels(ENTRY);
    const seen: (string | null)[] = [];
    const makeModels = () => ({ ...models, writer: { name: 'first', write: async (_brief: unknown, repair: { problems: readonly string[] } | null) => { seen.push(repair?.problems[0] ?? null); return { code: 'class Lesson(Lesson2D): pass', ...USAGE }; } } });
    await writeEntry({ ...run, makeModels }, ENTRY);
    expect(seen).toEqual(['a label ran off the frame']);
  });

  it('counts a crash inside a try as a try, and keeps nothing for it', async () => {
    const { run, root } = setUp();
    const worker: RenderWorker = async () => { throw new Error('docker went away'); };
    expect(await writeEntry({ ...run, worker }, ENTRY)).toBe(false);
    expect(run.ledger.getLastTry(ENTRY.id)?.stage).toBe('error');
    expect(readdirSync(root)).not.toContain('scenes');
  });

  it('refuses a long dash or a sentence that runs long in any spoken line', () => {
    const long = Array.from({ length: 26 }, () => 'word').join(' ');
    expect(getLibraryLineProblems(PLAN)).toEqual([]);
    expect(getLibraryLineProblems({ ...PLAN, close: 'Is it the tilt — or the distance?' })).toHaveLength(1);
    expect(getLibraryLineProblems({ ...PLAN, setup: `${long}.` })).toHaveLength(1);
  });
});

describe('a flagged library scene', () => {
  const flag = (root: string, sceneId: string) => {
    mkdirSync(join(root, 'flags'), { recursive: true });
    writeFileSync(join(root, 'flags', `${sceneId}.json`), '{}');
  };

  it('stops showing, and no lesson pays to write it again', async () => {
    const { run, root, calls } = setUp();
    await writeEntry(run, ENTRY);
    const key = getSceneKey(ENTRY.title);
    const writesBefore = calls.writes;
    flag(root, key.id);
    expect(run.store.find(key)).toBeNull();
    expect(run.store.list()).toEqual([]);
    expect(canTryNow({ store: run.store }, key)).toBe(false);
    const models = run.makeModels(ENTRY);
    const made = await makeScene({ writers: [models.writer], reviewer: models.reviewer, worker: run.worker, store: run.store, warn: () => {} }, { topic: ENTRY.title, plan: PLAN });
    expect(made.isOk).toBe(false);
    expect(calls.writes).toBe(writesBefore);
  });
});

describe('the library ledger after a sudden stop', () => {
  it('loses only the torn line, and the next line still counts', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'library-ledger-')), 'ledger.jsonl');
    createLibraryLedger(path).getUsageListener('seasons')({ role: 'writer', ...USAGE });
    appendFileSync(path, '{"kind":"charge","entryId":"rain');
    const restarted = createLibraryLedger(path);
    restarted.getUsageListener('rainbow')({ role: 'writer', ...USAGE });
    expect(createLibraryLedger(path).getTotalUsd()).toBeCloseTo(0.1);
  });
});

describe('the library ledger', () => {
  it('keeps counting past midnight and across a restart', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'library-ledger-')), 'ledger.jsonl');
    let nowMs = 0;
    const first = createLibraryLedger(path, { getNowMs: () => nowMs });
    first.getUsageListener('seasons')({ role: 'writer', ...USAGE });
    first.noteTry('seasons', 'draw', ['a label ran off the frame']);
    nowMs = 3 * 24 * 60 * 60_000;
    const restarted = createLibraryLedger(path, { getNowMs: () => nowMs });
    restarted.getUsageListener('rainbow')({ role: 'writer', ...USAGE });
    expect(restarted.getTotalUsd()).toBeCloseTo(0.1);
    expect(restarted.getEntryUsd('rainbow')).toBeCloseTo(0.05);
    expect(restarted.getEntryTries('seasons')).toBe(1);
  });
});
