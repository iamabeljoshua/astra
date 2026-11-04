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
  const planner = { plan: vi.fn(async (_topic: string, _signal: AbortSignal, onFirstLine?: (line: OpeningLine) => void) => { planCount += 1; onPlan(); onFirstLine?.(plan.opening[0] as OpeningLine); await flush(); return { ...plan, narration: plan.narration.replace('One', `One${planCount}`), ...USAGE }; }) };
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
    expect((await first.plan)?.narration).toBe((await second.plan)?.narration);
    const [one, two] = [first.desk.getState(), second.desk.getState()];
    expect(one.kind === 'ready' && two.kind === 'ready' && one.scene.id === two.scene.id).toBe(true);
    if (one.kind === 'ready') expect(one.scene.narration).toBe((await second.plan)?.narration);
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
    expect(await work.plan).toBeNull();
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
    expect((await work.plan)?.opening[0]?.say).toBe(PLAN.opening[0]?.say);
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
