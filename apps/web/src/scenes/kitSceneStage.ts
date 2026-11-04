import type { SceneEngine } from '@astra/contracts';
import type { KitTake } from '@astra/board/scene3d';
import { api } from '../api/client';
import { isKitSceneEnabled } from '../session/lessonFlag';
import { getAppliedTheme } from '../theme/theme';
import type { KitFrame } from './kitFrame';
import { createSceneStage, type SceneStage } from './sceneStage';

const PHONE_WIDTH = 860;
const MOST_HELD_FRAMES = 2;
/** The agent gives a page 6 s to take a scene, and a late kit scene only costs its place to the 2D take. */
const KIT_LOAD_LIMIT_MS = 5000;

interface KitEntry {
  layer: HTMLElement;
  frame: KitFrame | null;
  opening: Promise<boolean>;
}

function hasWebGl(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** Laptop first, by Abel's word. Everywhere else plays the 2D take with nothing said. */
export const getCanPlayKit = () => isKitSceneEnabled() && window.innerWidth > PHONE_WIDTH && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && hasWebGl();

function createLayer(parent: HTMLElement): HTMLElement {
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'hidden', visibility: 'hidden' });
  parent.append(layer);
  return layer;
}

async function getKitTake(sceneId: string): Promise<KitTake> {
  return (await api.get('/scene-takes/{sceneId}/kit', { params: { path: { sceneId } } })) as KitTake;
}

/** A kit scene and its 2D take share one id and one clock, so the 2D take stands in with no word whenever the kit cannot. */
export function createKitSceneStage(container: HTMLElement): SceneStage {
  const flatLayer = createLayer(container);
  const flat = createSceneStage(flatLayer);
  const entries = new Map<string, KitEntry>();
  /** Once a scene has shown in one engine it stays there, because a swap in the middle of a sentence would be seen. */
  const chosen = new Map<string, 'kit' | 'flat'>();

  const drop = (sceneId: string) => {
    const entry = entries.get(sceneId);
    entry?.frame?.dispose();
    entry?.layer.remove();
    entries.delete(sceneId);
  };

  const dropOldest = (keepId: string) => {
    const showing = [...chosen.keys()].at(-1);
    for (const sceneId of entries.keys()) {
      if (entries.size <= MOST_HELD_FRAMES) return;
      if (sceneId !== keepId && sceneId !== showing) drop(sceneId);
    }
  };

  const onKitStall = (sceneId: string) => {
    drop(sceneId);
    if (chosen.has(sceneId)) chosen.set(sceneId, 'flat');
  };

  const openEntry = async (sceneId: string, layer: HTMLElement): Promise<boolean> => {
    try {
      const [{ openKitFrame }, take] = await Promise.all([import('./kitFrame'), getKitTake(sceneId)]);
      const frame = await openKitFrame({ host: layer, take, theme: getAppliedTheme(), limitMs: KIT_LOAD_LIMIT_MS, onStall: () => onKitStall(sceneId) });
      const entry = entries.get(sceneId);
      if (!entry) {
        frame.dispose();
        return false;
      }
      entry.frame = frame;
      return true;
    } catch {
      entries.delete(sceneId);
      layer.remove();
      return false;
    }
  };

  const open = (sceneId: string): Promise<boolean> => {
    const held = entries.get(sceneId);
    if (held) return held.opening;
    const layer = createLayer(container);
    const entry: KitEntry = { layer, frame: null, opening: Promise.resolve(false) };
    entries.set(sceneId, entry);
    entry.opening = openEntry(sceneId, layer);
    dropOldest(sceneId);
    return entry.opening;
  };

  const choose = (sceneId: string): 'kit' | 'flat' => {
    const made = chosen.get(sceneId) ?? (entries.get(sceneId)?.frame ? 'kit' : 'flat');
    chosen.delete(sceneId);
    chosen.set(sceneId, made);
    return made;
  };

  const show = (sceneId: string, engine: 'kit' | 'flat') => {
    const kitLayer = entries.get(sceneId)?.layer;
    for (const entry of entries.values()) entry.layer.style.visibility = engine === 'kit' && entry.layer === kitLayer ? 'visible' : 'hidden';
    flatLayer.style.visibility = engine === 'flat' ? 'visible' : 'hidden';
    container.dataset.engine = engine;
  };

  const observer = new ResizeObserver(() => {
    for (const entry of entries.values()) entry.frame?.resize();
  });
  observer.observe(container);

  return {
    async load(sceneId, durationSeconds, engine?: SceneEngine) {
      if (engine !== 'kit' || !getCanPlayKit()) return flat.load(sceneId, durationSeconds);
      const kit = open(sceneId);
      // The words and the board never wait on the kit, so the 2D take alone can say the page is ready. A live scene has no 2D take.
      return (await flat.load(sceneId, durationSeconds)) || kit;
    },
    draw(sceneId, seconds) {
      const engine = choose(sceneId);
      const frame = entries.get(sceneId)?.frame;
      show(sceneId, engine);
      if (engine === 'kit' && frame) {
        frame.setTheme(getAppliedTheme());
        frame.render(seconds);
      } else flat.draw(sceneId, seconds);
    },
    canDraw: (sceneId) => Boolean(entries.get(sceneId)?.frame) || flat.canDraw(sceneId),
    free() {
      observer.disconnect();
      for (const sceneId of [...entries.keys()]) drop(sceneId);
      flat.free();
    },
  };
}
