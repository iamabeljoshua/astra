import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEngineWith(gpu: unknown) {
  vi.resetModules();
  vi.stubGlobal('navigator', { ...navigator, gpu });
  const fetched: string[] = [];
  vi.doMock('../api/fetchAppFile', () => ({ fetchAppFile: async (path: string) => { fetched.push(path); return new ArrayBuffer(1); } }));
  const engine = await import('./sceneEngine');
  return { ...engine, fetched };
}

const adapterWith = (features: string[]) => ({ requestAdapter: async () => ({ features: new Set(features) }) });

describe('checking the device first', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stays on the plain board with no WebGPU', async () => {
    const { getCanPlayScenes, fetchSceneEngineInBackground, fetched } = await loadEngineWith(undefined);
    expect(await getCanPlayScenes()).toBe(false);
    fetchSceneEngineInBackground();
    await new Promise((resolve) => setTimeout(resolve));
    expect(fetched).toEqual([]);
  });

  it('stays on the plain board with no adapter, or when asking for one fails', async () => {
    expect(await (await loadEngineWith({ requestAdapter: async () => null })).getCanPlayScenes()).toBe(false);
    expect(await (await loadEngineWith({ requestAdapter: async () => { throw new Error('blocked'); } })).getCanPlayScenes()).toBe(false);
  });

  it('stays on the plain board when a required feature is missing', async () => {
    expect(await (await loadEngineWith(adapterWith(['float32-blendable']))).getCanPlayScenes()).toBe(false);
  });

  it('fetches the pinned engine in the background once the device can play it', async () => {
    const { getCanPlayScenes, fetchSceneEngineInBackground, fetched } = await loadEngineWith(adapterWith(['float32-blendable', 'depth32float-stencil8']));
    expect(await getCanPlayScenes()).toBe(true);
    fetchSceneEngineInBackground();
    await new Promise((resolve) => setTimeout(resolve));
    expect(fetched).toEqual(['/scene-engine/0.1.1/engine.wasm', '/scene-engine/0.1.1/font.bin']);
  });
});
