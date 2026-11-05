import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKitSceneStage } from './kitSceneStage';

const SCENE = 'scene-a';
const OTHER_SCENE = 'scene-b';
const THIRD_SCENE = 'scene-c';
const TAKE = { code: 'function scene(kit) {}', timing: { moments: {}, duration: 20 } };

interface FakeFrame {
  hasDrawn: () => boolean;
  render: ReturnType<typeof vi.fn>;
  setTheme: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

const fakes = vi.hoisted(() => ({
  flat: { load: vi.fn(), prepare: vi.fn(), draw: vi.fn(), canDraw: vi.fn(), free: vi.fn() },
  opened: [] as { input: { onLost(): void; onFirstDraw(): void }; frame: FakeFrame; setDrawn(): void }[],
  openKitFrame: vi.fn(),
  getTake: vi.fn(),
}));

vi.mock('../api/client', () => ({ api: { get: fakes.getTake } }));
vi.mock('./sceneStage', () => ({ createSceneStage: () => fakes.flat }));
vi.mock('./kitFrame', () => ({ openKitFrame: fakes.openKitFrame }));

const settle = () => new Promise((resolve) => setTimeout(resolve));

function makeContainer() {
  return document.createElement('div');
}

beforeEach(() => {
  vi.stubEnv('VITE_KIT_SCENES', '1');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  fakes.opened.length = 0;
  fakes.flat.load.mockReset().mockResolvedValue(true);
  fakes.flat.prepare.mockReset().mockResolvedValue(true);
  fakes.flat.draw.mockReset();
  fakes.flat.canDraw.mockReset().mockReturnValue(true);
  fakes.flat.free.mockReset();
  fakes.getTake.mockReset().mockResolvedValue(TAKE);
  fakes.openKitFrame.mockReset().mockImplementation(async (input: { onLost(): void; onFirstDraw(): void }) => {
    let hasDrawn = false;
    const frame: FakeFrame = { hasDrawn: () => hasDrawn, render: vi.fn(), setTheme: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    fakes.opened.push({ input, frame, setDrawn: () => { hasDrawn = true; input.onFirstDraw(); } });
    return frame;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a scene with a kit take and a 2D take', () => {
  it('plays the 2D take until the sandbox says it drew a frame, then the kit', async () => {
    const container = makeContainer();
    const stage = createKitSceneStage(container);
    expect(await stage.load(SCENE, 20, 'kit')).toBe(true);
    await settle();
    stage.draw(SCENE, 3);
    expect(container.dataset.engine).toBe('flat');
    expect(fakes.flat.draw).toHaveBeenCalledWith(SCENE, 3);
    fakes.opened[0]?.setDrawn();
    fakes.flat.draw.mockClear();
    stage.draw(SCENE, 4);
    expect(container.dataset.engine).toBe('kit');
    expect(fakes.opened[0]?.frame.render).toHaveBeenLastCalledWith(4);
    expect(fakes.flat.draw).not.toHaveBeenCalled();
  });

  it('never hands a student a clear layer: a frame that has not drawn stays unseen over a playing 2D take', async () => {
    const container = makeContainer();
    const stage = createKitSceneStage(container);
    await stage.load(SCENE, 20, 'kit');
    await settle();
    stage.draw(SCENE, 3);
    const kitLayer = fakes.openKitFrame.mock.calls[0]?.[0].host as HTMLElement;
    expect(kitLayer.style.opacity).toBe('0');
  });

  it('goes back to the 2D take when the frame stalls, at the same second', async () => {
    const container = makeContainer();
    const onChange = vi.fn();
    const stage = createKitSceneStage(container, onChange);
    await stage.load(SCENE, 20, 'kit');
    await settle();
    fakes.opened[0]?.setDrawn();
    stage.draw(SCENE, 3);
    expect(container.dataset.engine).toBe('kit');
    onChange.mockClear();
    fakes.opened[0]?.input.onLost();
    expect(onChange).toHaveBeenCalled();
    stage.draw(SCENE, 3.5);
    expect(container.dataset.engine).toBe('flat');
    expect(fakes.flat.draw).toHaveBeenCalledWith(SCENE, 3.5);
  });

  it('says the page is ready on the 2D take alone, so no word waits on a slow kit', async () => {
    let finishOpening: (frame: FakeFrame) => void = () => {};
    fakes.openKitFrame.mockImplementation(() => new Promise((resolve) => { finishOpening = resolve; }));
    const stage = createKitSceneStage(makeContainer());
    await expect(stage.load(SCENE, 20, 'kit')).resolves.toBe(true);
    finishOpening({ hasDrawn: () => false, render: vi.fn(), setTheme: vi.fn(), resize: vi.fn(), dispose: vi.fn() });
  });

  it('plays the 2D take when the kit take will not load, and shows no error', async () => {
    fakes.getTake.mockRejectedValue(new Error('404'));
    const container = makeContainer();
    const stage = createKitSceneStage(container);
    expect(await stage.load(SCENE, 20, 'kit')).toBe(true);
    await settle();
    stage.draw(SCENE, 1);
    expect(container.dataset.engine).toBe('flat');
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });
});

describe('a live scene, which has no 2D take', () => {
  beforeEach(() => {
    fakes.flat.load.mockResolvedValue(false);
    fakes.flat.canDraw.mockReturnValue(false);
  });

  it('answers ready only when the kit is, and cannot draw before then', async () => {
    const stage = createKitSceneStage(makeContainer());
    const loading = stage.load(SCENE, 20, 'kit');
    expect(stage.canDraw(SCENE)).toBe(false);
    expect(await loading).toBe(true);
    expect(stage.canDraw(SCENE)).toBe(true);
  });

  it('refuses when the kit fails, so the board is left and not an empty box', async () => {
    fakes.openKitFrame.mockRejectedValue(new Error('the scene drew nothing'));
    const stage = createKitSceneStage(makeContainer());
    expect(await stage.load(SCENE, 20, 'kit')).toBe(false);
    expect(stage.canDraw(SCENE)).toBe(false);
  });

  it('cannot draw once the frame stalls, so the board comes back', async () => {
    const stage = createKitSceneStage(makeContainer());
    await stage.load(SCENE, 20, 'kit');
    fakes.opened[0]?.input.onLost();
    expect(stage.canDraw(SCENE)).toBe(false);
  });
});

describe('when a browser should not play the kit', () => {
  const expectFlatOnly = async () => {
    const stage = createKitSceneStage(makeContainer());
    expect(await stage.load(SCENE, 20, 'kit')).toBe(true);
    await settle();
    expect(fakes.getTake).not.toHaveBeenCalled();
    expect(fakes.openKitFrame).not.toHaveBeenCalled();
  };

  it('plays only the 2D take with the switch off', async () => {
    vi.stubEnv('VITE_KIT_SCENES', '');
    await expectFlatOnly();
  });

  it('plays only the 2D take at phone width', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    await expectFlatOnly();
  });

  it('plays only the 2D take with reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    await expectFlatOnly();
  });

  it('plays only the 2D take with no WebGL', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expectFlatOnly();
  });
});

describe('the next scene', () => {
  it('waits off screen in its own frame, and what is on screen stays', async () => {
    const container = makeContainer();
    const stage = createKitSceneStage(container);
    await stage.load(SCENE, 20, 'kit');
    await settle();
    fakes.opened[0]?.setDrawn();
    stage.draw(SCENE, 5);
    expect(await stage.prepare(OTHER_SCENE, 'kit')).toBe(true);
    await settle();
    expect(fakes.opened).toHaveLength(2);
    expect(fakes.flat.prepare).toHaveBeenCalledWith(OTHER_SCENE);
    expect(fakes.flat.load).toHaveBeenCalledTimes(1);
    stage.draw(SCENE, 6);
    expect(container.dataset.engine).toBe('kit');
    expect(fakes.opened[1]?.frame.render).not.toHaveBeenCalled();
  });
});

describe('memory', () => {
  it('holds at most two frames, and never drops the one on screen', async () => {
    const stage = createKitSceneStage(makeContainer());
    await stage.load(SCENE, 20, 'kit');
    await settle();
    stage.draw(SCENE, 1);
    await stage.load(OTHER_SCENE, 20, 'kit');
    await settle();
    await stage.load(THIRD_SCENE, 20, 'kit');
    await settle();
    const [first, second, third] = fakes.opened;
    expect(first?.frame.dispose).not.toHaveBeenCalled();
    expect(second?.frame.dispose).toHaveBeenCalled();
    expect(third?.frame.dispose).not.toHaveBeenCalled();
  });

  it('frees every frame and the 2D take when the session ends', async () => {
    const stage = createKitSceneStage(makeContainer());
    await stage.load(SCENE, 20, 'kit');
    await settle();
    stage.free();
    expect(fakes.opened[0]?.frame.dispose).toHaveBeenCalled();
    expect(fakes.flat.free).toHaveBeenCalled();
  });
});
