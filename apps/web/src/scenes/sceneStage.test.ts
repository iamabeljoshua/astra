import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnginePlayer } from './sceneEngine';

const engineState = vi.hoisted(() => ({ makePlayer: (() => null) as unknown as () => EnginePlayer }));

vi.mock('./sceneEngine', () => ({
  bootSceneEngine: async () => ({
    Player: function FakePlayer() {
      return engineState.makePlayer();
    },
  }),
}));
vi.mock('../api/client', () => ({ api: { get: async () => new ArrayBuffer(8) } }));

import { createSceneStage } from './sceneStage';

function makePlayer(overrides: Partial<EnginePlayer> = {}): EnginePlayer & { drawn: number[]; freed: number } {
  const player = {
    drawn: [] as number[],
    freed: 0,
    duration: 20,
    time: 0,
    feed: () => {},
    wake: () => {},
    resize: () => {},
    draw() {
      player.drawn.push(player.time);
    },
    free() {
      player.freed += 1;
    },
    ...overrides,
  };
  return player;
}

describe('the scene stage', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    container = document.createElement('div');
    document.documentElement.dataset.theme = 'light';
  });

  afterEach(() => vi.unstubAllGlobals());

  it('draws its first frame when it loads, then draws by seconds', async () => {
    const player = makePlayer();
    engineState.makePlayer = () => player;
    const stage = createSceneStage(container);
    expect(await stage.load('slope', 20)).toBe(true);
    expect(player.drawn).toEqual([0]);
    stage.draw('slope', 3.5);
    stage.draw('slope', 1.25);
    expect(player.drawn).toEqual([0, 3.5, 1.25]);
  });

  it('skips a frame it has just drawn, because the board asks every frame', async () => {
    const player = makePlayer();
    engineState.makePlayer = () => player;
    const stage = createSceneStage(container);
    await stage.load('slope', 20);
    stage.draw('slope', 2);
    stage.draw('slope', 2);
    expect(player.drawn).toEqual([0, 2]);
  });

  it('refuses a take the engine will not read', async () => {
    engineState.makePlayer = () => makePlayer({ feed() { throw new Error('a message of the take ends early'); } });
    expect(await createSceneStage(container).load('slope', 20)).toBe(false);
  });

  it('refuses a take that is not the length its scene says', async () => {
    const player = makePlayer({ duration: 3 });
    engineState.makePlayer = () => player;
    expect(await createSceneStage(container).load('slope', 20)).toBe(false);
    expect(player.freed).toBe(1);
  });

  it('drops a take that throws while drawing, and keeps the lesson running', async () => {
    let isBroken = false;
    const player = makePlayer({ draw() { if (isBroken) throw new Error('the device was lost'); } });
    engineState.makePlayer = () => player;
    const stage = createSceneStage(container);
    await stage.load('slope', 20);
    isBroken = true;
    expect(() => stage.draw('slope', 4)).not.toThrow();
    isBroken = false;
    expect(() => stage.draw('slope', 5)).not.toThrow();
    expect(player.freed).toBe(1);
  });

  it('ignores a scene it has not loaded', async () => {
    const player = makePlayer();
    engineState.makePlayer = () => player;
    const stage = createSceneStage(container);
    await stage.load('slope', 20);
    stage.draw('another-scene', 9);
    expect(player.drawn).toEqual([0]);
  });
});
