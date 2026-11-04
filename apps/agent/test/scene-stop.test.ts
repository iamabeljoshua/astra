import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLessonWork } from '../src/scenes/lesson/lesson-work.ts';
import { createTopicRuns } from '../src/scenes/lesson/topic-runs.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import { createSceneQueue } from '../src/scene-queue/scene-queue.ts';
import { getStateAfterMove, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import { createTutorScenes, type TutorScenes } from '../src/tutor/tutor-scenes.ts';

const REQUEST = 'Saturn: why the rings stay thin';
const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const ROUTE: SceneRoute = { engine: 'manimgx', kind: 'graph', topic: REQUEST, ...USAGE };
const ROUTER_MS = 100;
const STOP_WHILE_ROUTING_MS = 30;
const STOP_AFTER_ROUTING_MS = 130;
const LONG_ENOUGH_MS = 160;
const PLAN: LessonPlan = { opening: [{ say: 'The rings of Saturn stay thin.' }], setup: 'Watch.', narration: '[[a]] One two. [[b]] Three four.', plan: 'a: x\nb: y', close: 'Why?' };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A planner that only ends when it is stopped, so a signal it was given can be read later.
function setUp({ routerHearsStop = false, routerMs = ROUTER_MS } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scene-stop-'));
  const store = createSceneStore(root);
  const routerSignals: AbortSignal[] = [];
  const route = vi.fn(async (_request: string, signal: AbortSignal) => {
    routerSignals.push(signal);
    await new Promise((resolve, reject) => {
      setTimeout(resolve, routerMs);
      if (routerHearsStop) signal.addEventListener('abort', () => reject(signal.reason as Error));
    });
    return ROUTE;
  });
  const plannerSignals: AbortSignal[] = [];
  const plan = vi.fn((_topic: string, signal: AbortSignal) => {
    plannerSignals.push(signal);
    return new Promise<LessonPlan & typeof USAGE>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('stopped')));
    });
  });
  const runs = createTopicRuns({ planner: { plan }, writers: [{ name: 'writer', write: async () => ({ code: 'class Lesson: pass', ...USAGE }) }], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker: async () => ({ isOk: false, reasons: ['no worker'] }) as never, store, warn: () => {} });
  const names: string[] = [];
  const scenes = createTutorScenes({ router: { route }, runs, store, getCardTitle: () => null, getNowMs: () => performance.now(), send: () => {}, canSpeak: () => true, speak: () => true, onShown: () => {}, trace: (name) => void names.push(name) });
  const open = (isCard = false) => createLessonWork({ router: { route }, runs, store, request: REQUEST, isCard, studentId: 'maya', getNowMs: () => 0 });
  return { scenes, root, store, route, routerSignals, plan, plannerSignals, names, open };
}

const opened = (scenes: TutorScenes) => scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');

const STOPS: Record<string, (scenes: TutorScenes) => void> = {
  stopForGood: (scenes) => scenes.stopForGood(),
  close: (scenes) => scenes.close(),
  dropPrepared: (scenes) => scenes.dropPrepared(REQUEST),
};

describe('a stop while the router is answering', () => {
  it.each(Object.keys(STOPS))('%s starts no plan, and stops the router call too', async (stopName) => {
    const { scenes, plan, routerSignals } = setUp();
    opened(scenes);
    expect(scenes.prepare(REQUEST)).toBe(true);
    await wait(STOP_WHILE_ROUTING_MS);
    STOPS[stopName]?.(scenes);
    expect(routerSignals[0]?.aborted).toBe(true);
    await wait(LONG_ENOUGH_MS);
    expect(plan).not.toHaveBeenCalled();
  });

  it('starts no plan when the router gives up on the stop, as the real one does', async () => {
    const { scenes, plan } = setUp({ routerHearsStop: true });
    opened(scenes);
    scenes.prepare(REQUEST);
    await wait(STOP_WHILE_ROUTING_MS);
    scenes.stopForGood();
    await wait(LONG_ENOUGH_MS);
    expect(plan).not.toHaveBeenCalled();
  });

  it('still stops a plan that started before the stop, on one try', async () => {
    const { scenes, plan, plannerSignals } = setUp();
    opened(scenes);
    scenes.prepare(REQUEST);
    await wait(STOP_AFTER_ROUTING_MS);
    scenes.stopForGood();
    await wait(STOP_WHILE_ROUTING_MS);
    expect(plannerSignals[0]?.aborted).toBe(true);
    expect(plan).toHaveBeenCalledOnce();
  });

  it.each([[false], [true]])('tells whoever waits on the lesson that no plan is coming, for a card: %s', async (isCard) => {
    const { open, plan } = setUp();
    const work = open(isCard);
    work.desk.ask(work.request);
    await wait(STOP_WHILE_ROUTING_MS);
    work.leave();
    expect(await work.plan).toBe('nothing');
    expect(plan).not.toHaveBeenCalled();
  });
});

describe('leaving a shared write', () => {
  it('counts one lesson leaving twice as one, so the lesson still on it keeps its write', async () => {
    const { open, plannerSignals } = setUp({ routerMs: 1 });
    const first = open();
    const second = open();
    first.desk.ask(first.request);
    second.desk.ask(second.request);
    await wait(STOP_WHILE_ROUTING_MS);
    first.leave();
    first.leave();
    expect(plannerSignals[0]?.aborted).toBe(false);
    second.leave();
    expect(plannerSignals[0]?.aborted).toBe(true);
  });
});

describe('an ask waiting for the page', () => {
  it('does not start when the page answers after a stop for good', async () => {
    const { scenes, route, names } = setUp();
    scenes.ask(REQUEST);
    scenes.stopForGood();
    opened(scenes);
    await wait(STOP_WHILE_ROUTING_MS);
    expect(names).not.toContain('sceneAsked');
    expect(route).not.toHaveBeenCalled();
  });
});

describe('what the queue asks of the scenes', () => {
  it('says whether an ask was taken', () => {
    const { scenes } = setUp();
    opened(scenes);
    expect(scenes.ask(REQUEST)).toBe(true);
    expect(scenes.ask(REQUEST)).toBe(false);
    expect(scenes.ask('x'.repeat(81))).toBe(false);
  });

  it('cannot play once the student has pressed End, so a plan after it reads no library', async () => {
    const { scenes } = setUp();
    opened(scenes);
    const readLibrary = vi.fn(async () => []);
    const queue = createSceneQueue({ scenes, readLibrary, getFacts: () => ({ writesStarted: 0, sceneUsd: 0, sceneLimitUsd: 0.8, leftTodayUsd: 3, isOverLimit: false, loadPerCore: 0.2, lastFirstTextMs: 900 }), canPlay: scenes.canPlay, moveToNextStep: () => {}, trace: () => {} });
    scenes.close();
    queue.onLesson(getStateAfterMove(NO_LESSON, { move: 'new', plan: { topic: 'Saturn', kind: 'teachFirst', steps: [{ teach: 'rings', exercise: 'name one' }] } }));
    await wait(1);
    expect(scenes.canPlay()).toBe(false);
    expect(readLibrary).not.toHaveBeenCalled();
  });

  it('does not prepare a title flagged after the library was read, which would otherwise pay for a new write of it', async () => {
    const { scenes, root, store, route, plan } = setUp();
    const title = 'Why the rings stay thin';
    await store.saveChecked({ ...getSceneKey(title), status: 'checked', plan: PLAN } as unknown as StoredScene, [{ theme: 'light', bytes: Buffer.from('t') }, { theme: 'dark', bytes: Buffer.from('t') }], []);
    mkdirSync(join(root, 'flags'), { recursive: true });
    writeFileSync(join(root, 'flags', `${getSceneKey(title).id}.json`), '{}');
    expect(store.isFlagged(getSceneKey(title))).toBe(true);
    opened(scenes);
    expect(scenes.prepare(title)).toBe(false);
    await wait(STOP_AFTER_ROUTING_MS);
    expect(route).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });
});
