import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLessonWork } from '../src/scenes/lesson/lesson-work.ts';
import type { RenderWorker } from '../src/scenes/render-worker.ts';
import { createSceneStore, getSceneId } from '../src/scenes/scene-store.ts';
import type { LessonPlan, RouteEngine, SceneBrief, StoredScene } from '../src/scenes/scene-types.ts';

const PLAN: LessonPlan = { opening: [{ say: 'Words first.' }], setup: 'Watch.', narration: '[[a]] One two. [[b]] Three four.', plan: 'a: x\nb: y', close: 'Why?' };
const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const flush = () => new Promise((resolve) => setTimeout(resolve));
const worker: RenderWorker = async () => ({ isOk: true, takes: [{ theme: 'light', bytes: Buffer.from('t'), makeMs: 1, seconds: 1, parts: [] }], sheets: [Buffer.from('p')], layoutProblems: [], layoutNotes: [], declared: {}, ms: 1 });

function setUp({ engine = 'manimgx', topic = 'what a slope measures', isCard = false, request = 'hi, my name is Ada and I am stuck on slopes' }: { engine?: RouteEngine; topic?: string; isCard?: boolean; request?: string } = {}) {
  const store = createSceneStore(mkdtempSync(join(tmpdir(), 'lesson-work-')));
  const route = vi.fn(async () => ({ engine, kind: 'graph', topic, ...USAGE }));
  const plan = vi.fn(async () => ({ ...PLAN, ...USAGE }));
  const briefs: SceneBrief[] = [];
  const write = async (brief: SceneBrief) => {
    briefs.push(brief);
    return { code: 'class Lesson: pass', ...USAGE };
  };
  const work = createLessonWork({ router: { route }, planner: { plan }, writers: [{ name: 'writer', write }], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker, store, request, isCard, getNowMs: () => 0 });
  return { work, store, route, plan, briefs };
}

const saved = (topic: string, status: StoredScene['status']): StoredScene => ({ id: getSceneId(topic), topic, status, plan: PLAN, review: [{ moment: 'a', what: 'wrong', truth: '', confidence: 'high' }] }) as unknown as StoredScene;

describe('a lesson asking for its scene', () => {
  it('gives the writer the router\'s topic and never the student\'s words', async () => {
    const { work, briefs, plan } = setUp();
    work.desk.ask(work.request);
    await flush();
    await flush();
    expect(plan.mock.calls[0]).toContain('what a slope measures');
    expect(JSON.stringify(briefs[0])).not.toMatch(/Ada|stuck/);
  });

  it('reuses a saved scene for a card with no model call, so the next student gets it free', async () => {
    const { work, store, route, plan, briefs } = setUp({ isCard: true, request: 'What a derivative really measures' });
    store.save(saved('What a derivative really measures', 'checked'), [], []);
    work.desk.ask(work.request);
    await flush();
    expect(work.desk.getState().kind).toBe('ready');
    expect(await work.plan).toEqual(PLAN);
    expect(route).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
    expect(briefs).toEqual([]);
  });

  it('hands over the first line as soon as the planner has it', async () => {
    const { work, plan } = setUp();
    plan.mockImplementation(((_topic: string, _signal: AbortSignal, onFirstLine?: (line: { say: string }) => void) => {
      onFirstLine?.({ say: 'Streamed first.' });
      return new Promise(() => {});
    }) as unknown as typeof plan);
    work.desk.ask(work.request);
    expect(await work.firstLine).toEqual({ say: 'Streamed first.' });
  });

  it('finds a saved scene for a question typed exactly as its topic, with no model call', async () => {
    const { work, store, route } = setUp({ request: 'Why Pythagoras was right' });
    store.save(saved('Why Pythagoras was right', 'checked'), [], []);
    work.desk.ask(work.request);
    await flush();
    expect(work.desk.getState().kind).toBe('ready');
    expect(route).not.toHaveBeenCalled();
  });

  it('reuses a scene saved under the same topic for a typed question', async () => {
    const { work, store, briefs } = setUp();
    store.save(saved('what a slope measures', 'checked'), [], []);
    work.desk.ask(work.request);
    await flush();
    await flush();
    expect(work.desk.getState().kind).toBe('ready');
    expect(briefs).toEqual([]);
  });

  it('does not pay again for a scene the review failed, and does not show it', async () => {
    const { work, store, briefs } = setUp();
    store.save(saved('what a slope measures', 'rejected'), [], []);
    work.desk.ask(work.request);
    await flush();
    await flush();
    expect(work.desk.getState().kind).toBe('failed');
    expect(briefs).toEqual([]);
  });

  it('still gives the tutor words when the router sends a request to the kit, with no scene written', async () => {
    const { work, briefs } = setUp({ engine: 'kit', topic: 'a beating heart' });
    work.desk.ask(work.request);
    await flush();
    expect(await work.plan).toEqual({ ...PLAN, ...USAGE });
    await flush();
    expect(work.desk.getState()).toEqual({ kind: 'declined', engine: 'kit' });
    expect(briefs).toEqual([]);
  });

  it('settles with no plan when the request needs no drawing', async () => {
    const { work, plan } = setUp({ engine: 'none', topic: '' });
    work.desk.ask(work.request);
    expect(await work.plan).toBeNull();
    expect(plan).not.toHaveBeenCalled();
  });

  it('still gives a card its words when the router says no drawing', async () => {
    const { work } = setUp({ engine: 'none', topic: '', isCard: true, request: 'What a derivative really measures' });
    work.desk.ask(work.request);
    expect(await work.plan).toEqual({ ...PLAN, ...USAGE });
  });

  it('settles with no plan when the router fails, so the lesson never hangs', async () => {
    const { work, route } = setUp();
    route.mockRejectedValue(new Error('down'));
    work.desk.ask(work.request);
    expect(await work.plan).toBeNull();
  });

  it('gets words with no scene for a browser that cannot show one', async () => {
    const { work, briefs } = setUp();
    work.planWithoutScene();
    expect(await work.plan).toEqual({ ...PLAN, ...USAGE });
    await flush();
    expect(briefs).toEqual([]);
  });
});
