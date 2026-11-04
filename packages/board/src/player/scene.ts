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
