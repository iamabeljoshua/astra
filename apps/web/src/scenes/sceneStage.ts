import { api } from '../api/client';
import { getAppliedTheme, type Theme } from '../theme/theme';
import { bootSceneEngine, type EnginePlayer } from './sceneEngine';

// The engine draws its controls while paused and has no switch, so the canvas is taller than its box and the box clips them.
const CONTROLS_CLIP_PX = 120;
const MOST_DENSITY = 2;
const DURATION_SLACK_SECONDS = 1;
const MOST_KEPT_TAKES = 4;
const SAME_FRAME_SECONDS = 0.0005;

export interface SceneStage {
  load(sceneId: string, durationSeconds: number): Promise<boolean>;
  draw(sceneId: string, seconds: number): void;
  canDraw(sceneId: string): boolean;
  free(): void;
}

interface ActivePlayer {
  sceneId: string;
  theme: Theme;
  durationSeconds: number;
  canvas: HTMLCanvasElement;
  player: EnginePlayer;
  drawnSeconds: number;
}

const takes = new Map<string, Uint8Array>();

async function getTakeBytes(sceneId: string, theme: Theme): Promise<Uint8Array> {
  const key = `${sceneId}/${theme}`;
  const kept = takes.get(key);
  if (kept) return kept;
  const reply: unknown = await api.get('/scene-takes/{sceneId}/{theme}', { params: { path: { sceneId, theme } }, parseAs: 'arrayBuffer' });
  const bytes = new Uint8Array(reply as ArrayBuffer);
  takes.set(key, bytes);
  if (takes.size > MOST_KEPT_TAKES) takes.delete(takes.keys().next().value as string);
  return bytes;
}

function createCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', left: '0', width: '100%', top: `${-CONTROLS_CLIP_PX}px`, height: `calc(100% + ${2 * CONTROLS_CLIP_PX}px)`, display: 'block' });
  container.replaceChildren(canvas);
  return canvas;
}

function fitCanvas(canvas: HTMLCanvasElement, player?: EnginePlayer): { width: number; height: number; density: number } {
  const { width, height } = canvas.getBoundingClientRect();
  const density = Math.min(window.devicePixelRatio || 1, MOST_DENSITY);
  const size = { width: Math.max(1, Math.round(width * density)), height: Math.max(1, Math.round(height * density)), density };
  canvas.width = size.width;
  canvas.height = size.height;
  player?.resize(size.width, size.height, density);
  return size;
}

export function createSceneStage(container: HTMLElement): SceneStage {
  let active: ActivePlayer | null = null;
  let isChangingTheme = false;

  const dropActive = () => {
    try {
      active?.player.free();
    } catch {
      // Freeing a damaged player has nothing left to save.
    }
    active = null;
  };

  const makePlayer = async ({ sceneId, theme, durationSeconds }: Pick<ActivePlayer, 'sceneId' | 'theme' | 'durationSeconds'>, startSeconds: number): Promise<ActivePlayer> => {
    const engine = await bootSceneEngine();
    const bytes = await getTakeBytes(sceneId, theme);
    const canvas = createCanvas(container);
    const { width, height, density } = fitCanvas(canvas);
    const player = new engine.Player(canvas, startSeconds, false, navigator.userAgent.includes('Mac'));
    player.resize(width, height, density);
    player.feed(bytes);
    if (Math.abs(player.duration - durationSeconds) > DURATION_SLACK_SECONDS) {
      player.free();
      throw new Error('the take is not the length its scene says');
    }
    player.time = startSeconds;
    player.wake();
    player.draw();
    return { sceneId, theme, durationSeconds, canvas, player, drawnSeconds: startSeconds };
  };

  const observer = new ResizeObserver(() => {
    if (active) {
      fitCanvas(active.canvas, active.player);
      active.drawnSeconds = Number.NaN;
    }
  });
  observer.observe(container);

  const changeTheme = (current: ActivePlayer, theme: Theme) => {
    isChangingTheme = true;
    const { sceneId, durationSeconds, drawnSeconds } = current;
    dropActive();
    void makePlayer({ sceneId, theme, durationSeconds }, Number.isNaN(drawnSeconds) ? 0 : drawnSeconds)
      .then((made) => {
        active = made;
      })
      .catch(() => {})
      .finally(() => {
        isChangingTheme = false;
      });
  };

  return {
    async load(sceneId, durationSeconds) {
      dropActive();
      try {
        active = await makePlayer({ sceneId, theme: getAppliedTheme(), durationSeconds }, 0);
        return true;
      } catch {
        return false;
      }
    },
    draw(sceneId, seconds) {
      if (isChangingTheme || active?.sceneId !== sceneId) return;
      const theme = getAppliedTheme();
      if (active.theme !== theme) {
        changeTheme(active, theme);
        return;
      }
      if (Math.abs(active.drawnSeconds - seconds) < SAME_FRAME_SECONDS) return;
      try {
        active.player.time = seconds;
        active.player.wake();
        active.player.draw();
        active.drawnSeconds = seconds;
      } catch {
        dropActive();
      }
    },
    canDraw: (sceneId) => isChangingTheme || active?.sceneId === sceneId,
    free() {
      observer.disconnect();
      dropActive();
    },
  };
}
