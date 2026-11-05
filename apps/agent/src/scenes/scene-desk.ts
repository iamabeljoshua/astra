import type { RichScene } from '@astra/contracts';
import type { MadeScene } from './make-scene.ts';
import type { RouteEngine, SceneRoute, StoredScene } from './scene-types.ts';

export const SHOW_WINDOW_MS = 20_000;

export type SceneState =
  | { kind: 'idle' }
  | { kind: 'routing' }
  | { kind: 'declined'; engine: RouteEngine }
  | { kind: 'making'; route: SceneRoute }
  | { kind: 'ready'; scene: StoredScene }
  | { kind: 'shown'; scene: StoredScene }
  | { kind: 'failed'; reasons: readonly string[] };

export interface SceneDeskOptions {
  route(request: string): Promise<SceneRoute>;
  make(route: SceneRoute): Promise<MadeScene>;
  getNowMs(): number;
  onChange?(state: SceneState, atMs: number): void;
  drawsEngine?: RouteEngine;
}

export interface SceneDesk {
  ask(request: string): void;
  /** Takes a scene at a pause, and the first call starts the 20 s. */
  takeReady(): StoredScene | null;
  /** Takes a scene that was saved already, before the lesson has spoken. A saved scene opens the lesson, so this starts no window. */
  takeAtOpening(): StoredScene | null;
  /** Settles when a scene is ready, or none can come, or the 20 s are up, so a lesson can wait out the window without polling. */
  untilLastChance(): Promise<void>;
  getState(): SceneState;
}

const WAITING_KINDS: readonly SceneState['kind'][] = ['routing', 'making'];

export function createSceneDesk({ route, make, getNowMs, onChange, drawsEngine = 'manimgx' }: SceneDeskOptions): SceneDesk {
  let state: SceneState = { kind: 'idle' };
  let firstPauseAtMs: number | null = null;
  const waiters = new Set<() => void>();

  const setState = (next: SceneState) => {
    state = next;
    onChange?.(next, getNowMs());
    if (!WAITING_KINDS.includes(next.kind)) for (const wake of waiters) wake();
  };

  const isPastWindow = () => firstPauseAtMs !== null && getNowMs() - firstPauseAtMs > SHOW_WINDOW_MS;

  const run = async (request: string) => {
    setState({ kind: 'routing' });
    const chosen = await route(request);
    if (chosen.engine !== drawsEngine) {
      setState({ kind: 'declined', engine: chosen.engine });
      return;
    }
    setState({ kind: 'making', route: chosen });
    const made = await make(chosen);
    setState(made.isOk ? { kind: 'ready', scene: made.scene } : { kind: 'failed', reasons: made.reasons });
  };

  return {
    ask(request) {
      if (state.kind !== 'idle') return;
      void run(request).catch((error: unknown) => setState({ kind: 'failed', reasons: [String(error)] }));
    },
    takeReady() {
      firstPauseAtMs ??= getNowMs();
      if (state.kind !== 'ready' || isPastWindow()) return null;
      const { scene } = state;
      setState({ kind: 'shown', scene });
      return scene;
    },
    takeAtOpening() {
      if (state.kind !== 'ready') return null;
      const { scene } = state;
      setState({ kind: 'shown', scene });
      return scene;
    },
    untilLastChance() {
      firstPauseAtMs ??= getNowMs();
      if (!WAITING_KINDS.includes(state.kind) || isPastWindow()) return Promise.resolve();
      const leftMs = firstPauseAtMs + SHOW_WINDOW_MS - getNowMs();
      return new Promise((resolve) => {
        const wake = () => {
          clearTimeout(limit);
          waiters.delete(wake);
          resolve();
        };
        const limit = setTimeout(wake, leftMs);
        waiters.add(wake);
      });
    },
    getState: () => state,
  };
}

export function getSceneCommand(scene: Pick<StoredScene, 'engine' | 'id' | 'moments' | 'parts' | 'durationSeconds'>, id: RichScene['id']): RichScene {
  return { kind: 'richScene', id, engine: scene.engine, sceneId: scene.id, moments: { ...scene.moments }, parts: [...scene.parts], durationSeconds: scene.durationSeconds };
}
