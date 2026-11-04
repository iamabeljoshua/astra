import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { fetchAppFile } from '../api/fetchAppFile';

const ENGINE_BASE = `/scene-engine/${SCENE_ENGINE_VERSIONS.manimgx}/`;
const WASM_PATH = `${ENGINE_BASE}engine.wasm`;
const FONT_PATH = `${ENGINE_BASE}font.bin`;
const REQUIRED_GPU_FEATURES = ['float32-blendable', 'depth32float-stencil8'];

export interface EnginePlayer {
  feed(bytes: Uint8Array): void;
  readonly duration: number;
  time: number;
  wake(): unknown;
  draw(): void;
  resize(width: number, height: number, density: number): void;
  free(): void;
}

interface EngineModule {
  default(input: { module_or_path: Uint8Array }): Promise<unknown>;
  init(fonts: Uint8Array[]): unknown;
  Player: new (canvas: HTMLCanvasElement, time: number, isPlaying: boolean, isMac: boolean) => EnginePlayer;
}

interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<{ features: { has(name: string): boolean } } | null> };
}

let canPlay: Promise<boolean> | null = null;
let booted: Promise<EngineModule> | null = null;

async function readCanPlay(): Promise<boolean> {
  const adapter = await (navigator as GpuNavigator).gpu?.requestAdapter();
  return adapter ? REQUIRED_GPU_FEATURES.every((feature) => adapter.features.has(feature)) : false;
}

export function getCanPlayScenes(): Promise<boolean> {
  canPlay ??= readCanPlay().catch(() => false);
  return canPlay;
}

export function fetchSceneEngineInBackground(): void {
  void getCanPlayScenes().then((isAble) => {
    if (isAble) void Promise.all([fetchAppFile(WASM_PATH), fetchAppFile(FONT_PATH)]).catch(() => {});
  });
}

async function boot(): Promise<EngineModule> {
  const engine = (await import(/* @vite-ignore */ `${ENGINE_BASE}engine.js`)) as EngineModule;
  await engine.default({ module_or_path: new Uint8Array(await fetchAppFile(WASM_PATH)) });
  await engine.init([new Uint8Array(await fetchAppFile(FONT_PATH))]);
  return engine;
}

export function bootSceneEngine(): Promise<EngineModule> {
  booted ??= boot().catch((error: unknown) => {
    booted = null;
    throw error;
  });
  return booted;
}
