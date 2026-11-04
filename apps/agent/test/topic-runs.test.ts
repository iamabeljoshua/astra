import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createTopicRuns } from '../src/scenes/lesson/topic-runs.ts';
import { createLessonWork } from '../src/scenes/lesson/lesson-work.ts';
import type { RenderWorker } from '../src/scenes/render-worker.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { LessonPlan, OpeningLine, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';

const PLAN: LessonPlan = { opening: [{ say: 'What a slope measures is how steep a line is.' }], setup: 'Watch the slope.', narration: '[[a]] One two slope. [[b]] Three four.', plan: 'a: x\nb: y', close: 'Why does the slope change?' };
const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const TOPIC = 'what a slope measures';
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
const worker: RenderWorker = async () => ({ isOk: true, takes: [{ theme: 'light', bytes: Buffer.from('t'), makeMs: 1, seconds: 1, parts: [] }, { theme: 'dark', bytes: Buffer.from('t'), makeMs: 1, seconds: 1, parts: [] }], sheets: [{ theme: 'light', bytes: Buffer.from('p') }, { theme: 'dark', bytes: Buffer.from('p') }], layoutProblems: [], layoutNotes: [], declared: {}, ms: 1 });

function makeShared({ topic = TOPIC, plan = PLAN, onPlan = () => {} }: { topic?: string; plan?: LessonPlan; onPlan?: () => void } = {}) {
  const store = createSceneStore(mkdtempSync(join(tmpdir(), 'lesson-more-')));
  let planCount = 0;
  const planner = { plan: vi.fn(async (_topic: string, _signal: AbortSignal, hooks?: { onFirstLine?(line: OpeningLine): void }) => { planCount += 1; onPlan(); hooks?.onFirstLine?.(plan.opening[0] as OpeningLine); await flush(); return { ...plan, narration: plan.narration.replace('One', `One${planCount}`), ...USAGE }; }) };
  const route = vi.fn(async () => ({ engine: 'manimgx', kind: 'graph', topic, ...USAGE }) as SceneRoute);
  let writes = 0;
  const writers = [{ name: 'writer', write: vi.fn(async () => { writes += 1; await flush(); return { code: 'class Lesson: pass', ...USAGE }; }) }];
  const reviewer = { review: vi.fn(async () => ({ isPass: true, errors: [], ...USAGE })) };
  const runs = createTopicRuns({ planner, writers, reviewer, worker, store });
  const open = ({ request, isCard, studentId }: { request: string; isCard: boolean; studentId: string }) => createLessonWork({ router: { route }, runs, store, request, isCard, studentId, getNowMs: () => 0 });
  return { store, planner, route, writers, reviewer, runs, open, getWrites: () => writes };
}

const untilSettled = async (work: ReturnType<ReturnType<typeof makeShared>['open']>) => {
  for (let tries = 0; tries < 50 && !['ready', 'failed', 'declined'].includes(work.desk.getState().kind); tries += 1) await flush();
};

describe('two students on one new card', () => {
  it('share one plan and one scene, so words and pictures match', async () => {
    const shared = makeShared();
    const first = shared.open({ request: TOPIC, isCard: true, studentId: 'maya' });
    const second = shared.open({ request: TOPIC, isCard: true, studentId: 'tola' });
    first.desk.ask(first.request);
    second.desk.ask(second.request);
    await untilSettled(first);
    await untilSettled(second);
    expect(shared.planner.plan).toHaveBeenCalledOnce();
    expect(shared.getWrites()).toBe(1);
    expect(((await first.plan) as LessonPlan).narration).toBe(((await second.plan) as LessonPlan).narration);
    const [one, two] = [first.desk.getState(), second.desk.getState()];
    expect(one.kind === 'ready' && two.kind === 'ready' && one.scene.id === two.scene.id).toBe(true);
    if (one.kind === 'ready') expect(one.scene.narration).toBe(((await second.plan) as LessonPlan).narration);
  });

  it('a student who arrives while the scene is being written joins it', async () => {
    const shared = makeShared();
    const first = shared.open({ request: TOPIC, isCard: true, studentId: 'maya' });
    first.desk.ask(first.request);
    await flush();
    const second = shared.open({ request: TOPIC, isCard: true, studentId: 'tola' });
    second.desk.ask(second.request);
    await untilSettled(first);
    await untilSettled(second);
    expect(shared.getWrites()).toBe(1);
    expect(shared.planner.plan).toHaveBeenCalledOnce();
  });
});

describe('a typed question', () => {
  it("is written under the student who typed it and never shown to another student asking the same words", async () => {
    const shared = makeShared();
    const maya = shared.open({ request: 'tell me about slopes', isCard: false, studentId: 'maya' });
    maya.desk.ask(maya.request);
    await untilSettled(maya);
    expect(shared.store.find(getSceneKey(TOPIC, { ownerId: 'maya' }))?.ownerId).toBe('maya');
    const tola = shared.open({ request: 'tell me about slopes', isCard: false, studentId: 'tola' });
    tola.desk.ask(tola.request);
    await untilSettled(tola);
    expect(shared.getWrites()).toBe(2);
    const state = tola.desk.getState();
    expect(state.kind === 'ready' && state.scene.ownerId).toBe('tola');
  });

  it('never saves a typed topic where a card can find it, even a topic spelled as a card', async () => {
    const shared = makeShared();
    const maya = shared.open({ request: 'poison', isCard: false, studentId: 'maya' });
    maya.desk.ask(maya.request);
    await untilSettled(maya);
    expect(shared.store.find(getSceneKey(TOPIC))).toBeNull();
    const card = shared.open({ request: TOPIC, isCard: true, studentId: 'tola' });
    card.desk.ask(card.request);
    await untilSettled(card);
    const state = card.desk.getState();
    expect(state.kind === 'ready' && state.scene.ownerId).toBeNull();
    expect(shared.getWrites()).toBe(2);
  });

  it('comes back free for the same student', async () => {
    const shared = makeShared();
    const first = shared.open({ request: 'tell me about slopes', isCard: false, studentId: 'maya' });
    first.desk.ask(first.request);
    await untilSettled(first);
    const again = shared.open({ request: 'tell me about slopes', isCard: false, studentId: 'maya' });
    again.desk.ask(again.request);
    await untilSettled(again);
    expect(shared.getWrites()).toBe(1);
  });

  it('may read a scene from the shared list, which holds no student words', async () => {
    const shared = makeShared();
    const card = shared.open({ request: TOPIC, isCard: true, studentId: 'tola' });
    card.desk.ask(card.request);
    await untilSettled(card);
    const typed = shared.open({ request: 'tell me about slopes', isCard: false, studentId: 'maya' });
    typed.desk.ask(typed.request);
    await untilSettled(typed);
    expect(shared.getWrites()).toBe(1);
  });
});

describe('words that should never be said', () => {
  const POISON: LessonPlan = { ...PLAN, opening: [{ say: 'Jane Doe is a cheat, and everyone at her school should know it.' }] };

  it('never reach the first line or the plan', async () => {
    const shared = makeShared({ plan: POISON });
    const work = shared.open({ request: TOPIC, isCard: true, studentId: 'maya' });
    work.desk.ask(work.request);
    await untilSettled(work);
    expect(JSON.stringify(await work.plan)).not.toMatch(/Jane Doe/);
    expect(JSON.stringify(await work.firstLine)).not.toMatch(/Jane Doe/);
    expect(shared.getWrites()).toBe(0);
  });

  it('leave a typed question with no lesson, and no first line', async () => {
    const shared = makeShared({ plan: POISON });
    const work = shared.open({ request: TOPIC, isCard: false, studentId: 'maya' });
    work.desk.ask(work.request);
    await untilSettled(work);
    expect(await work.plan).toBe('nothing');
    expect(await work.firstLine).toBeNull();
    expect(shared.getWrites()).toBe(0);
  });
});

describe('a topic the review refused', () => {
  it('does not replay the refused plan and writes no scene', async () => {
    const shared = makeShared();
    shared.store.saveRefusal({ key: getSceneKey(TOPIC), code: 'c', plan: { ...PLAN, opening: [{ say: 'A refused line about slopes.' }] }, review: [{ moment: 'a', what: 'wrong', truth: '', confidence: 'high' }], savedAt: 'now' });
    const work = shared.open({ request: TOPIC, isCard: true, studentId: 'maya' });
    work.desk.ask(work.request);
    await untilSettled(work);
    expect(((await work.plan) as LessonPlan).opening[0]?.say).toBe(PLAN.opening[0]?.say);
    expect(work.desk.getState().kind).toBe('failed');
    expect(shared.getWrites()).toBe(0);
  });
});

describe('a saved scene', () => {
  it('uses its own plan, so a reused scene and its words always match', async () => {
    const shared = makeShared();
    const saved = { ...getSceneKey(TOPIC), status: 'checked', plan: PLAN, narration: PLAN.narration } as unknown as StoredScene;
    await shared.store.saveChecked(saved, [{ theme: 'light', bytes: Buffer.from('t') }, { theme: 'dark', bytes: Buffer.from('t') }], []);
    const work = shared.open({ request: TOPIC, isCard: true, studentId: 'maya' });
    work.desk.ask(work.request);
    await flush();
    expect(await work.plan).toEqual(PLAN);
    expect(shared.planner.plan).not.toHaveBeenCalled();
    expect(shared.route).not.toHaveBeenCalled();
  });
});

describe('a plan that goes wrong', () => {
  const GOOD = { ...PLAN, ...USAGE };
  function makeRuns(plan: ReturnType<typeof vi.fn>) {
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'plan-retry-')));
    const write = vi.fn(async () => ({ code: 'class Lesson: pass', ...USAGE }));
    return { write, runs: createTopicRuns({ planner: { plan: plan as never }, writers: [{ name: 'writer', write }], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker, store, warn: () => {} }) };
  }

  it('asks once more when the planner throws, as a too-long narration did on 2 of 14 cards', async () => {
    const plan = vi.fn().mockRejectedValueOnce(new Error('the narration is too long')).mockResolvedValueOnce(GOOD);
    const { runs } = makeRuns(plan);
    expect(await runs.join(getSceneKey(TOPIC)).plan).toMatchObject({ setup: PLAN.setup });
    expect(plan).toHaveBeenCalledTimes(2);
  });

  it('asks once more when the check refuses a plan, as "what is the pythagorean theorem" was refused as off topic', async () => {
    const plan = vi.fn().mockResolvedValueOnce({ ...PLAN, opening: [{ say: 'A squared plus b squared.' }], narration: '[[a]] One. [[b]] Two.', plan: 'a: x\nb: y', setup: 'Look.', close: 'Why?', more: [], ...USAGE }).mockResolvedValueOnce(GOOD);
    const { runs } = makeRuns(plan);
    expect(await runs.join(getSceneKey(TOPIC)).plan).toMatchObject({ setup: PLAN.setup });
    expect(plan).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(plan.mock.calls[1])).toMatch(/off the topic/);
  });

  it('keeps a first line already said when it asks again', async () => {
    const first = { say: 'A slope tells you how steep a line is.' };
    let calls = 0;
    const plan = vi.fn(async (_topic: string, _signal: AbortSignal, hooks: { onFirstLine?(line: OpeningLine): void }) => {
      calls += 1;
      if (calls > 1) return { ...GOOD, opening: [{ say: 'Some other first line about a slope.' }, { say: 'Then a slope again.' }] };
      hooks.onFirstLine?.(first);
      throw new Error('the plan has no setup');
    });
    const { runs } = makeRuns(plan as never);
    const run = runs.join(getSceneKey(TOPIC));
    expect(await run.plan).toMatchObject({ opening: [first, { say: 'Then a slope again.' }] });
    expect(JSON.stringify(plan.mock.calls[1])).toContain(first.say);
  });

  it('gives a card lines to teach on the plain board when both tries fail the check, and writes no scene', async () => {
    const offTopic = { opening: [{ say: 'Soup needs salt.' }], more: [{ say: 'Jane Doe stirs the pot.' }], setup: 'Stir it.', narration: '[[a]] Add water. [[b]] Add salt.', plan: 'a: pot\nb: spoon', close: 'Is it hot?', ...USAGE };
    const plan = vi.fn().mockResolvedValue(offTopic);
    const { runs, write } = makeRuns(plan);
    const run = runs.join(getSceneKey(TOPIC), { cardFallback: { say: 'Once a line tilts, what does its slope tell you?' } });
    const settled = (await run.plan) as LessonPlan;
    expect(settled.opening.length).toBeGreaterThan(0);
    expect(JSON.stringify(settled)).not.toMatch(/Jane Doe/);
    expect((await run.getScene()).isOk).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('gives a card its library line and says why when no model will answer at all', async () => {
    const plan = vi.fn().mockRejectedValue(new Error('overloaded'));
    const { runs } = makeRuns(plan);
    const settled = (await runs.join(getSceneKey(TOPIC), { cardFallback: { say: 'Once a line tilts, what does its slope tell you?' } }).plan) as LessonPlan;
    expect(JSON.stringify(settled)).toContain('Once a line tilts');
    expect(plan).toHaveBeenCalledTimes(2);
  });

  it('has no plan for a typed question when both tries fail, and says it is not a danger refusal', async () => {
    const plan = vi.fn().mockRejectedValue(new Error('overloaded'));
    const { runs } = makeRuns(plan);
    expect(await runs.join(getSceneKey(TOPIC, { ownerId: 'maya' })).plan).toBe('nothing');
  });
});

describe('a typed scene nobody is left to see', () => {
  const makeWaitingRuns = () => {
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'plan-stop-')));
    const signals: AbortSignal[] = [];
    const write = vi.fn((_brief: unknown, _repair: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('stopped'))));
    });
    const plan = vi.fn(async () => ({ ...PLAN, ...USAGE }));
    return { store, signals, plan, runs: createTopicRuns({ planner: { plan }, writers: [{ name: 'writer', write }], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker, store, warn: () => {} }) };
  };

  it('stops its write and records no trouble when its last lesson has gone, because a left-page run paid $0.113', async () => {
    const { runs, signals, store } = makeWaitingRuns();
    const key = getSceneKey(TOPIC, { ownerId: 'maya' });
    const run = runs.join(key);
    const scene = run.getScene();
    await flush();
    run.leave?.();
    expect(signals[0]?.aborted).toBe(true);
    expect((await scene).isOk).toBe(false);
    expect(store.getTrouble(key).tries).toBe(0);
  });

  it('keeps going while another lesson of that student is on it', async () => {
    const { runs, signals } = makeWaitingRuns();
    const key = getSceneKey(TOPIC, { ownerId: 'maya' });
    const first = runs.join(key);
    const second = runs.join(key);
    void first.getScene();
    await flush();
    first.leave?.();
    expect(signals[0]?.aborted).toBe(false);
    second.leave?.();
    expect(signals[0]?.aborted).toBe(true);
  });

  it('keeps a card going when every student has left, because the next student gets it free', async () => {
    const { runs, signals } = makeWaitingRuns();
    const run = runs.join(getSceneKey(TOPIC));
    void run.getScene();
    await flush();
    run.leave?.();
    expect(signals[0]?.aborted).toBe(false);
  });
});

describe('a writer that starts from the streamed plan', () => {
  const WORDS = { narration: PLAN.narration, plan: PLAN.plan };
  const makeStreaming = (whole: LessonPlan) => {
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'plan-stream-')));
    const write = vi.fn(async () => ({ code: 'class Lesson: pass', ...USAGE }));
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const plan = vi.fn(async (_topic: string, _signal: AbortSignal, hooks: { onSceneWords?(words: typeof WORDS): void }) => {
      hooks.onSceneWords?.(WORDS);
      await held;
      return { ...whole, ...USAGE };
    });
    return { write, release, runs: createTopicRuns({ planner: { plan: plan as never }, writers: [{ name: 'writer', write }], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker, store, warn: () => {} }) };
  };

  it('starts writing before the plan is whole, and writes once', async () => {
    const { write, release, runs } = makeStreaming(PLAN);
    const run = runs.join(getSceneKey(TOPIC));
    const scene = run.getScene();
    await flush();
    expect(write).toHaveBeenCalledOnce();
    release();
    expect((await scene).isOk).toBe(true);
    expect(write).toHaveBeenCalledOnce();
  });

  it('writes nothing early when nobody asked for a scene, as on a browser that cannot play one', async () => {
    const { write, release, runs } = makeStreaming(PLAN);
    const run = runs.join(getSceneKey(TOPIC));
    await flush();
    expect(write).not.toHaveBeenCalled();
    release();
    await run.plan;
    expect(write).not.toHaveBeenCalled();
  });

  it('writes again when the whole plan changed the words the early write used', async () => {
    const { write, release, runs } = makeStreaming({ ...PLAN, narration: '[[a]] Other slope words. [[b]] And more.' });
    const scene = runs.join(getSceneKey(TOPIC)).getScene();
    await flush();
    release();
    expect((await scene).isOk).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
