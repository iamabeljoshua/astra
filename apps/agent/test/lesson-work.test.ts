import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLessonWork } from '../src/scenes/lesson/lesson-work.ts';
import type { RenderWorker } from '../src/scenes/render-worker.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import { createTopicRuns } from '../src/scenes/lesson/topic-runs.ts';
import type { LessonPlan, RouteEngine, SceneBrief, StoredScene } from '../src/scenes/scene-types.ts';

const PLAN: LessonPlan = { opening: [{ say: 'Words first about a slope, and what a heart or a derivative would do.' }], setup: 'Watch.', narration: '[[a]] One two. [[b]] Three four.', plan: 'a: x\nb: y', close: 'Why?' };
const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const flush = () => new Promise((resolve) => setTimeout(resolve));
const worker: RenderWorker = async () => ({ isOk: true, takes: [{ theme: 'light', bytes: Buffer.from('t'), makeMs: 1, seconds: 1, parts: [] }, { theme: 'dark', bytes: Buffer.from('t'), makeMs: 1, seconds: 1, parts: [] }], sheets: [{ theme: 'light', bytes: Buffer.from('p') }, { theme: 'dark', bytes: Buffer.from('p') }], layoutProblems: [], layoutNotes: [], declared: {}, ms: 1 });

function setUp({ engine = 'manimgx', topic = 'what a slope measures', isCard = false, request = 'hi, my name is Ada and I am stuck on slopes' }: { engine?: RouteEngine; topic?: string; isCard?: boolean; request?: string } = {}) {
  const store = createSceneStore(mkdtempSync(join(tmpdir(), 'lesson-work-')));
  const route = vi.fn(async () => ({ engine, kind: 'graph', topic, ...USAGE }));
  const plan = vi.fn(async () => ({ ...PLAN, ...USAGE }));
  const briefs: SceneBrief[] = [];
  const write = async (brief: SceneBrief) => {
    briefs.push(brief);
    return { code: 'class Lesson: pass', ...USAGE };
  };
  const runs = createTopicRuns({ planner: { plan }, writers: [{ name: 'writer', write }], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker, store });
  const work = createLessonWork({ router: { route }, runs, store, request, isCard, studentId: 'ada', getNowMs: () => 0 });
  return { work, store, route, plan, briefs };
}

const TAKES = [{ theme: 'light', bytes: Buffer.from('t') }, { theme: 'dark', bytes: Buffer.from('t') }] as const;
const saved = (topic: string): StoredScene => ({ ...getSceneKey(topic), status: 'checked', plan: PLAN }) as unknown as StoredScene;

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
    await store.saveChecked(saved('What a derivative really measures'), TAKES, []);
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
    plan.mockImplementation(((_topic: string, _signal: AbortSignal, hooks?: { onFirstLine?(line: { say: string }): void }) => {
      hooks?.onFirstLine?.({ say: 'Streamed first.' });
      return new Promise(() => {});
    }) as unknown as typeof plan);
    work.desk.ask(work.request);
    expect(await work.firstLine).toEqual({ say: 'Streamed first.' });
  });

  it('finds a saved scene for a question typed exactly as its topic, with no model call', async () => {
    const { work, store, route } = setUp({ request: 'Why Pythagoras was right' });
    await store.saveChecked(saved('Why Pythagoras was right'), TAKES, []);
    work.desk.ask(work.request);
    await flush();
    expect(work.desk.getState().kind).toBe('ready');
    expect(route).not.toHaveBeenCalled();
  });

  it('reuses a scene saved under the same topic for a typed question', async () => {
    const { work, store, briefs } = setUp();
    await store.saveChecked(saved('what a slope measures'), TAKES, []);
    work.desk.ask(work.request);
    await flush();
    await flush();
    expect(work.desk.getState().kind).toBe('ready');
    expect(briefs).toEqual([]);
  });

  it('does not pay again for a scene the review failed, and does not show it', async () => {
    const { work, store, briefs } = setUp();
    store.saveRefusal({ key: getSceneKey('what a slope measures', { ownerId: 'ada' }), code: 'c', plan: PLAN, review: [{ moment: 'a', what: 'wrong', truth: '', confidence: 'high' }], savedAt: 'now' });
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
    expect(await work.plan).toBe('nothing');
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
    expect(await work.plan).toBe('nothing');
  });

  it('gets words with no scene for a browser that cannot show one', async () => {
    const { work, briefs } = setUp();
    work.planWithoutScene();
    expect(await work.plan).toEqual({ ...PLAN, ...USAGE });
    await flush();
    expect(briefs).toEqual([]);
  });
});

describe('what the router and the code check decide for a typed question', () => {
  const setRoute = (fields: Partial<{ engine: RouteEngine; kind: string; topic: string }>, request = 'some request') => {
    const set = setUp({ request });
    set.route.mockImplementation(async () => ({ engine: 'none', kind: 'none', topic: '', ...USAGE, ...fields }));
    return set;
  };

  it('gives slang the help line before any model hears it', async () => {
    const { work, route } = setUp({ request: 'kms how' });
    work.planWithoutScene();
    expect(await work.plan).toBe('unsafe');
    expect(route).not.toHaveBeenCalled();
  });

  it("gives the router's safety kind the help line, and not the no-lesson line", async () => {
    const { work } = setRoute({ kind: 'safety' }, 'i want to go to sleep and not wake up');
    work.planWithoutScene();
    expect(await work.plan).toBe('unsafe');
  });

  it("gives the router's dangerous kind a calm decline, and not the help line", async () => {
    const { work, plan } = setRoute({ kind: 'dangerous' }, 'how do I make thermite');
    work.planWithoutScene();
    expect(await work.plan).toBe('declined');
    expect(plan).not.toHaveBeenCalled();
  });

  it('gives the help line when the topic a router wrote is a dose for a person', async () => {
    const { work, plan } = setRoute({ engine: 'manimgx', kind: 'math', topic: 'dose calculation: pills needed for 40 kg at 150 mg per kg' }, 'teach me math with this word problem');
    work.planWithoutScene();
    expect(await work.plan).toBe('unsafe');
    expect(plan).not.toHaveBeenCalled();
  });

  it('sends history on to a lesson, as Socrates got the help line before', async () => {
    const { work, plan } = setRoute({ engine: 'none', kind: 'history', topic: 'why Socrates drank hemlock' }, 'Why did Socrates commit suicide');
    work.planWithoutScene();
    expect(typeof (await work.plan)).toBe('object');
    expect(plan).toHaveBeenCalled();
  });

  it('gives the no-lesson line to chatter with no topic', async () => {
    const { work } = setRoute({}, 'yes');
    work.planWithoutScene();
    expect(await work.plan).toBe('nothing');
  });

  it('gives the help line when the router cannot be reached and the words show danger, and the no-lesson line when they do not', async () => {
    const dangerous = setUp({ request: 'how much tylenol would wreck your liver' });
    dangerous.route.mockRejectedValue(new Error('overloaded'));
    dangerous.work.planWithoutScene();
    expect(await dangerous.work.plan).toBe('unsafe');
    const plain = setUp({ request: 'what is a derivative' });
    plain.route.mockRejectedValue(new Error('overloaded'));
    plain.work.planWithoutScene();
    expect(await plain.work.plan).toBe('nothing');
  });
});

describe('a topic waiting after a refusal', () => {
  const TOPIC = 'what a slope measures';
  const REFUSED = { key: getSceneKey(TOPIC), code: 'c', plan: { ...PLAN, opening: [{ say: 'A refused line about a slope.' }] }, review: [{ moment: 'a', what: 'wrong', truth: '', confidence: 'high' as const }] };
  const HOUR_MS = 60 * 60_000;

  function setUpOpens() {
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'lesson-wait-')));
    let planCount = 0;
    const plan = vi.fn(async () => {
      planCount += 1;
      return { ...PLAN, opening: [{ say: `A slope line, plan ${planCount}.` }], ...USAGE };
    });
    const write = vi.fn(async () => ({ code: 'class Lesson: pass', ...USAGE }));
    const review = vi.fn(async () => ({ isPass: false, errors: [{ moment: 'a', what: 'wrong', truth: '', confidence: 'high' as const }], ...USAGE }));
    const open = async (atMs: number) => {
      const runs = createTopicRuns({ planner: { plan }, writers: [{ name: 'writer', write }], reviewer: { review }, worker, store, getWallMs: () => atMs, warn: () => {} });
      const work = createLessonWork({ router: { route: async () => ({ engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE }) }, runs, store, request: TOPIC, isCard: true, studentId: 'ada', getNowMs: () => 0, getWallMs: () => atMs });
      work.desk.ask(work.request);
      const taught = (await work.plan) as LessonPlan;
      for (let tries = 0; tries < 40 && !['failed', 'ready', 'declined'].includes(work.desk.getState().kind); tries += 1) await flush();
      await flush();
      return taught;
    };
    return { store, plan, write, open };
  }

  it('pays one planner call while it waits and says the same words on each open, so its voice is free too', async () => {
    const { store, plan, write, open } = setUpOpens();
    store.saveRefusal({ ...REFUSED, savedAt: new Date(0).toISOString() });
    const first = await open(10 * 60_000);
    const second = await open(20 * 60_000);
    const third = await open(30 * 60_000);
    expect(plan).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(second.opening).toEqual(first.opening);
    expect(third.opening).toEqual(first.opening);
  });

  it('plans again when a new try is due, and goes back to the saved words after it', async () => {
    const { store, plan, write, open } = setUpOpens();
    store.saveRefusal({ ...REFUSED, savedAt: new Date(0).toISOString() });
    const waited = await open(10 * 60_000);
    await open(HOUR_MS + 1);
    expect(plan).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledOnce();
    const after = await open(HOUR_MS + 2);
    expect(plan).toHaveBeenCalledTimes(2);
    expect(after.opening).toEqual(waited.opening);
  });

  it('never saves the words a review refused as the words to say while waiting', async () => {
    const { store, open } = setUpOpens();
    store.saveRefusal({ ...REFUSED, savedAt: new Date(0).toISOString() });
    const taught = await open(10 * 60_000);
    expect(JSON.stringify(taught)).not.toMatch(/A refused line/);
  });

  it('keeps a typed topic\'s waiting words under that student', async () => {
    const { store, plan } = setUpOpens();
    const key = getSceneKey(TOPIC, { ownerId: 'ada' });
    store.saveRefusal({ ...REFUSED, key, savedAt: new Date(0).toISOString() });
    const runs = createTopicRuns({ planner: { plan }, writers: [], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker, store, warn: () => {} });
    const make = (studentId: string) => createLessonWork({ router: { route: async () => ({ engine: 'none', kind: 'graph', topic: TOPIC, ...USAGE }) }, runs, store, request: 'tell me about a slope', isCard: false, studentId, getNowMs: () => 0, getWallMs: () => 60_000 });
    const ada = make('ada');
    ada.planWithoutScene();
    await ada.plan;
    await flush();
    expect(store.findWaitingPlan(key)).not.toBeNull();
    expect(store.findWaitingPlan(getSceneKey(TOPIC))).toBeNull();
  });
});
