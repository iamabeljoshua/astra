import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeScene } from '../src/scenes/make-scene.ts';
import type { RenderResult, RenderWorker } from '../src/scenes/render-worker.ts';
import { createSceneStore, getSceneId } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneReviewer, SceneWriter } from '../src/scenes/scene-types.ts';

const PLAN: LessonPlan = { opening: [{ say: 'A derivative measures change.' }], setup: 'Watch the point.', narration: '[[curve]] Here is the curve. [[tangent]] And here is its slope at one point.', plan: 'curve: draw y equals x squared\ntangent: the tangent at x equals one', close: 'What is the slope there?' };

const makeWriter = (name: string, code = 'class Lesson(Lesson2D): pass', onWrite?: () => void): SceneWriter => ({ name, write: async () => { onWrite?.(); return { code, model: name, ms: 100, costUsd: 0.1 }; } });

const goodRender: RenderResult = { isOk: true, takes: [{ theme: 'light', bytes: Buffer.from('light'), makeMs: 1, seconds: 8, parts: ['curve'] }, { theme: 'dark', bytes: Buffer.from('dark'), makeMs: 1, seconds: 8, parts: ['curve'] }], sheets: [Buffer.from('png')], layoutProblems: [], layoutNotes: [], declared: {}, ms: 50 };
const passing: SceneReviewer = { review: async () => ({ isPass: true, errors: [], model: 'fake', ms: 10, costUsd: 0.01 }) };
const failing: SceneReviewer = { review: async () => ({ isPass: false, errors: [{ moment: 'tangent', what: 'the slope label says 3 and the code computes 2', truth: 'the slope is 2', confidence: 'high' }], model: 'fake', ms: 10, costUsd: 0.01 }) };

function setUp({ renders = [goodRender], reviewer = passing }: { renders?: RenderResult[]; reviewer?: SceneReviewer } = {}) {
  const store = createSceneStore(mkdtempSync(join(tmpdir(), 'scene-store-')));
  let call = 0;
  const jobs: Parameters<RenderWorker>[0][] = [];
  const worker: RenderWorker = async (job) => {
    jobs.push(job);
    return renders[Math.min(call++, renders.length - 1)] as RenderResult;
  };
  return { store, worker, jobs, reviewer };
}

describe('making a scene', () => {
  it('saves a scene that passes, with code, moments, and a take per theme', async () => {
    const { store, worker, reviewer, jobs } = setUp();
    const made = await makeScene({ writers: [makeWriter('first')], reviewer, worker, store }, { topic: 'What a derivative measures', plan: PLAN });
    expect(made.isOk).toBe(true);
    const saved = store.find(getSceneId('What a derivative measures'));
    expect(saved?.status).toBe('checked');
    expect(saved?.code).toContain('class Lesson');
    expect(Object.keys(saved?.moments ?? {})).toEqual(['curve', 'tangent']);
    expect(saved?.takeBytes).toEqual({ light: 5, dark: 4 });
    expect(saved?.engineVersion).toBe('0.1.1');
    expect(jobs[0]?.themes).toEqual(['light', 'dark']);
  });

  it('hands over to the fallback, with the reasons, when the gate fails, and does not race them', async () => {
    const { store, worker, reviewer } = setUp({ renders: [{ isOk: false, stage: 'gate', reasons: ['import os is not allowed'], ms: 5 }, goodRender] });
    const seen: (string | null)[] = [];
    const fallback: SceneWriter = { name: 'fallback', write: async (_brief, repair) => { seen.push(repair?.problems[0] ?? null); return { code: 'class Lesson: pass', model: 'fallback', ms: 100, costUsd: 0.1 }; } };
    let firstCalls = 0;
    const made = await makeScene({ writers: [makeWriter('first', 'import os', () => (firstCalls += 1)), fallback], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(true);
    expect(firstCalls).toBe(1);
    expect(seen).toEqual(['import os is not allowed']);
    expect(store.find(getSceneId('Slope'))?.trace.writer).toBe('fallback');
  });

  it('hands over when the first writer stalls or fails', async () => {
    const { store, worker, reviewer } = setUp();
    const broken: SceneWriter = { name: 'broken', write: async () => { throw new Error('overloaded'); } };
    const made = await makeScene({ writers: [broken, makeWriter('fallback')], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(true);
  });

  it('treats text crossed by a line as a failed check', async () => {
    const { store, worker, reviewer } = setUp({ renders: [{ ...goodRender, layoutProblems: ['t=16s Line runs through the text'] } as RenderResult] });
    const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(false);
    expect(store.find(getSceneId('Slope'))).toBeNull();
  });

  it('never reviews a scene with no pictures, because a reviewer would have nothing to see', async () => {
    const { store, worker, reviewer } = setUp({ renders: [{ ...goodRender, sheets: [] } as RenderResult] });
    const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(false);
  });

  it('keeps a planted fact error from a student, and saves it marked, with the reviewer\'s report', async () => {
    const { store, worker } = setUp();
    const made = await makeScene({ writers: [makeWriter('first')], reviewer: failing, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made).toEqual({ isOk: false, reasons: ['the slope label says 3 and the code computes 2'] });
    const saved = store.find(getSceneId('Slope'));
    expect(saved?.status).toBe('rejected');
    expect(saved?.review[0]?.truth).toBe('the slope is 2');
  });

  it('treats a review that cannot be read or reached as a failure', async () => {
    const { store, worker } = setUp();
    const broken: SceneReviewer = { review: async () => { throw new Error('no reply'); } };
    const made = await makeScene({ writers: [makeWriter('first')], reviewer: broken, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(false);
  });

  it('gives the writer a brief with no student in it', async () => {
    const { store, worker, reviewer } = setUp();
    let seenBrief: unknown = null;
    const writer: SceneWriter = { name: 'first', write: async (brief) => { seenBrief = brief; return { code: 'class Lesson: pass', model: 'x', ms: 1, costUsd: 0 }; } };
    await makeScene({ writers: [writer], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(Object.keys(seenBrief as object).sort()).toEqual(['durationSeconds', 'moments', 'narration', 'plan', 'topic']);
  });
});
