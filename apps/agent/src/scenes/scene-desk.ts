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
}

export interface SceneDesk {
  ask(request: string): void;
  takeReady(): StoredScene | null;
  getState(): SceneState;
  isMissed(): boolean;
}

export function createSceneDesk({ route, make, getNowMs, onChange }: SceneDeskOptions): SceneDesk {
  let state: SceneState = { kind: 'idle' };
  let firstPauseAtMs: number | null = null;

  const setState = (next: SceneState) => {
    state = next;
    onChange?.(next, getNowMs());
  };

  const isPastWindow = () => firstPauseAtMs !== null && getNowMs() - firstPauseAtMs > SHOW_WINDOW_MS;

  const run = async (request: string) => {
    setState({ kind: 'routing' });
    const chosen = await route(request);
    if (chosen.engine !== 'manimgx') {
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
    getState: () => state,
    isMissed: isPastWindow,
  };
}

export function getSceneCommand(scene: StoredScene, id: RichScene['id']): RichScene {
  return { kind: 'richScene', id, engine: scene.engine, sceneId: scene.id, moments: { ...scene.moments }, parts: [...scene.parts], durationSeconds: scene.durationSeconds };
}
