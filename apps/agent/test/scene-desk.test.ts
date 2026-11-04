import { describe, expect, it } from 'vitest';
import type { MadeScene } from '../src/scenes/make-scene.ts';
import { createSceneDesk, SHOW_WINDOW_MS } from '../src/scenes/scene-desk.ts';
import type { RouteEngine, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';

const SCENE = { id: 'slope-1a2b', status: 'checked' } as StoredScene;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setUp(engine: RouteEngine = 'manimgx') {
  let nowMs = 0;
  let finishMaking: (made: MadeScene) => void = () => {};
  let makeCalls = 0;
  const desk = createSceneDesk({
    getNowMs: () => nowMs,
    route: async () => ({ engine, kind: 'graph', topic: 'slope', model: 'fake', ms: 1, costUsd: 0 }) satisfies SceneRoute,
    make: () => {
      makeCalls += 1;
      return new Promise((resolve) => {
        finishMaking = resolve;
      });
    },
  });
  return { desk, advance: (ms: number) => (nowMs += ms), finish: (made: MadeScene) => finishMaking(made), getMakeCalls: () => makeCalls };
}

describe('the scene desk', () => {
  it('returns at once and has nothing at the first pause while the scene is being made', async () => {
    const { desk } = setUp();
    desk.ask('what does a derivative measure');
    await flush();
    expect(desk.getState().kind).toBe('making');
    expect(desk.takeReady()).toBeNull();
  });

  it('gives a ready scene at a pause, once', async () => {
    const { desk, finish } = setUp();
    desk.ask('what does a derivative measure');
    await flush();
    finish({ isOk: true, scene: SCENE });
    await flush();
    expect(desk.takeReady()).toBe(SCENE);
    expect(desk.takeReady()).toBeNull();
  });

  it('drops a scene that comes about 20 s after the first pause, and lets it finish so it is saved', async () => {
    const { desk, finish, advance } = setUp();
    desk.ask('what does a derivative measure');
    await flush();
    expect(desk.takeReady()).toBeNull();
    advance(SHOW_WINDOW_MS + 1);
    finish({ isOk: true, scene: SCENE });
    await flush();
    expect(desk.getState().kind).toBe('ready');
    expect(desk.takeReady()).toBeNull();
    expect(desk.isMissed()).toBe(true);
  });

  it('still shows a scene just inside the window', async () => {
    const { desk, finish, advance } = setUp();
    desk.ask('what does a derivative measure');
    await flush();
    expect(desk.takeReady()).toBeNull();
    advance(SHOW_WINDOW_MS - 1);
    finish({ isOk: true, scene: SCENE });
    await flush();
    expect(desk.takeReady()).toBe(SCENE);
  });

  it.each(['kit', 'none'] as const)('writes nothing when the router says %s, so the lesson stays on the plain board', async (engine) => {
    const { desk, getMakeCalls } = setUp(engine);
    desk.ask('a beating heart');
    await flush();
    expect(desk.getState()).toEqual({ kind: 'declined', engine });
    expect(getMakeCalls()).toBe(0);
    expect(desk.takeReady()).toBeNull();
  });

  it('never shows a scene that failed its checks', async () => {
    const { desk, finish } = setUp();
    desk.ask('what does a derivative measure');
    await flush();
    finish({ isOk: false, reasons: ['the slope is wrong'] });
    await flush();
    expect(desk.takeReady()).toBeNull();
    expect(desk.getState().kind).toBe('failed');
  });

  it('asks once per lesson, so a concept keeps one engine', async () => {
    const { desk, getMakeCalls } = setUp();
    desk.ask('what does a derivative measure');
    desk.ask('and the slope?');
    await flush();
    expect(getMakeCalls()).toBe(1);
  });

  it('keeps a throwing router from reaching the lesson', async () => {
    const desk = createSceneDesk({ getNowMs: () => 0, route: async () => { throw new Error('the router is down'); }, make: async () => ({ isOk: false, reasons: [] }) });
    desk.ask('what does a derivative measure');
    await flush();
    expect(desk.getState().kind).toBe('failed');
  });
});
