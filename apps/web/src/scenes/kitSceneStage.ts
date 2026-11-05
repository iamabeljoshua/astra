import type { SceneEngine } from '@astra/contracts';
import type { KitTake } from '@astra/board/scene3d';
import { api } from '../api/client';
import { isFastSceneEnabled, isKitSceneEnabled } from '../session/lessonFlag';
import { getAppliedTheme } from '../theme/theme';
import type { KitFrame } from './kitFrame';
import { createSceneStage, type SceneStage } from './sceneStage';

const PHONE_WIDTH = 860;
const MOST_HELD_FRAMES = 2;
const KIT_LOAD_LIMIT_MS = 15_000;
const CROSS_FADE_MS = 300;

interface KitEntry {
  layer: HTMLElement;
  frame: KitFrame | null;
  opening: Promise<boolean>;
}

const hasWebGl = () => document.createElement('canvas').getContext('webgl2') !== null;

export const getCanPlayKit = () => isKitSceneEnabled() && window.innerWidth > PHONE_WIDTH && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && hasWebGl();

/** A recipe's scene has no 2D take, so where depth cannot run, the same scene draws itself flat. It needs WebGL, and a page without it gets words and the board. */
export const getCanDrawRecipes = () => isFastSceneEnabled() && hasWebGl();

function createLayer(parent: HTMLElement): HTMLElement {
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'hidden' });
  parent.append(layer);
  return layer;
}

async function getKitTake(sceneId: string): Promise<KitTake> {
  return (await api.get('/scene-takes/{sceneId}/kit', { params: { path: { sceneId } } })) as KitTake;
}

/** A kit scene and its 2D take share one id and one clock, so the 2D take plays until the kit is ready, and stands in with no word whenever the kit cannot. */
export function createKitSceneStage(container: HTMLElement, onChange: () => void = () => {}): SceneStage {
  const flatLayer = createLayer(container);
  const flat = createSceneStage(flatLayer);
  const entries = new Map<string, KitEntry>();
  let lastDrawnId: string | null = null;

  const drop = (sceneId: string) => {
    const entry = entries.get(sceneId);
    entry?.frame?.dispose();
    entry?.layer.remove();
    entries.delete(sceneId);
  };

  const dropOldest = (keepId: string) => {
    for (const sceneId of entries.keys()) {
      if (entries.size <= MOST_HELD_FRAMES) return;
      if (sceneId !== keepId && sceneId !== lastDrawnId) drop(sceneId);
    }
  };

  const openEntry = async (sceneId: string, layer: HTMLElement, drawsFlat: boolean): Promise<boolean> => {
    try {
      const [{ openKitFrame }, take] = await Promise.all([import('./kitFrame'), getKitTake(sceneId)]);
      const frame = await openKitFrame({
        host: layer,
        take,
        theme: getAppliedTheme(),
        limitMs: KIT_LOAD_LIMIT_MS,
        drawsFlat,
        onLost: () => {
          drop(sceneId);
          onChange();
        },
        onFirstDraw: onChange,
      });
      const entry = entries.get(sceneId);
      if (!entry) {
        frame.dispose();
        return false;
      }
      entry.frame = frame;
      onChange();
      return true;
    } catch (error) {
      container.dataset.kitProblem = String(error);
      entries.delete(sceneId);
      layer.remove();
      return false;
    }
  };

  const open = (sceneId: string, drawsFlat = false): Promise<boolean> => {
    const held = entries.get(sceneId);
    if (held) return held.opening;
    const layer = createLayer(container);
    Object.assign(layer.style, { opacity: '0', visibility: 'hidden', transition: `opacity ${CROSS_FADE_MS}ms` });
    const entry: KitEntry = { layer, frame: null, opening: Promise.resolve(false) };
    entries.set(sceneId, entry);
    entry.opening = openEntry(sceneId, layer, drawsFlat);
    dropOldest(sceneId);
    return entry.opening;
  };

  const show = (sceneId: string, isKitOn: boolean, isKitSeen: boolean) => {
    for (const [heldId, { layer }] of entries) {
      const isThisScene = isKitOn && heldId === sceneId;
      layer.style.visibility = isThisScene ? 'visible' : 'hidden';
      layer.style.opacity = isThisScene && isKitSeen ? '1' : '0';
    }
    container.dataset.engine = isKitSeen ? 'kit' : 'flat';
  };

  const observer = new ResizeObserver(() => {
    for (const entry of entries.values()) entry.frame?.resize();
  });
  observer.observe(container);

  return {
    async load(sceneId, durationSeconds, engine?: SceneEngine) {
      if (engine !== 'kit' || !getCanPlayKit()) {
        const isLoaded = await flat.load(sceneId, durationSeconds);
        onChange();
        if (isLoaded || engine !== 'kit' || !getCanDrawRecipes()) return isLoaded;
        return open(sceneId, true);
      }
      const kitOpening = open(sceneId);
      const hasFlat = await flat.load(sceneId, durationSeconds);
      onChange();
      return hasFlat || kitOpening;
    },
    async prepare(sceneId, engine?: SceneEngine) {
      const kitOpening = engine === 'kit' && getCanPlayKit() ? open(sceneId) : Promise.resolve(false);
      const isHeld = (await flat.prepare(sceneId)) || (await kitOpening);
      return isHeld || (engine === 'kit' && !getCanPlayKit() && getCanDrawRecipes() ? open(sceneId, true) : false);
    },
    draw(sceneId, seconds) {
      lastDrawnId = sceneId;
      const frame = entries.get(sceneId)?.frame;
      if (frame) {
        frame.setTheme(getAppliedTheme());
        frame.render(seconds);
      }
      const hasFlat = flat.canDraw(sceneId);
      const isKitSeen = Boolean(frame && (frame.hasDrawn() || !hasFlat));
      show(sceneId, Boolean(frame), isKitSeen);
      if (!isKitSeen && hasFlat) flat.draw(sceneId, seconds);
    },
    canDraw: (sceneId) => Boolean(entries.get(sceneId)?.frame) || flat.canDraw(sceneId),
    free() {
      observer.disconnect();
      for (const sceneId of [...entries.keys()]) drop(sceneId);
      flat.free();
    },
  };
}
