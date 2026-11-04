import type { SceneCommand } from '@astra/contracts';

export type SceneParameters = Readonly<Record<string, number>>;

/** Anything the board can run. It must be a pure function of its own seconds, because rewind and replay ask for any moment in any order. */
export interface Scene<Frame = unknown> {
  /** What a command can point at, as "element.part". */
  readonly parts: readonly string[];
  /** Named points on the scene's own timeline, in seconds, which a cue can play to or jump to. */
  readonly moments: Readonly<Record<string, number>>;
  readonly durationSeconds: number;
  /** The values this scene runs on, which is what a slider shows. */
  readonly values?: SceneParameters;
  getFrame(seconds: number): Frame;
}

export type SceneCatalog = (command: SceneCommand, parameterChanges: SceneParameters) => Scene | null;

const isPlayable = ({ durationSeconds, moments }: Scene): boolean => Number.isFinite(durationSeconds) && durationSeconds >= 0 && Object.values(moments).every((seconds) => Number.isFinite(seconds) && seconds >= 0);

function makeSceneSafely(catalog: SceneCatalog, command: SceneCommand, changes: SceneParameters): Scene | null {
  try {
    const scene = catalog(command, changes);
    return scene && isPlayable(scene) ? scene : null;
  } catch {
    return null;
  }
}

// The board rebuilds per frame, so a scene is made once per command, and a bad catalog leaves its element still.
export function guardSceneCatalog(catalog: SceneCatalog): SceneCatalog {
  const made = new WeakMap<SceneCommand, Map<string, Scene | null>>();
  return (command, changes) => {
    const key = JSON.stringify(changes);
    const scenes = made.get(command) ?? new Map<string, Scene | null>();
    made.set(command, scenes);
    if (!scenes.has(key)) scenes.set(key, makeSceneSafely(catalog, command, changes));
    return scenes.get(key) ?? null;
  };
}
