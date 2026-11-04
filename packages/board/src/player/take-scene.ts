import type { RichScene, SceneEngine } from '@astra/contracts';
import type { Scene } from './scene.ts';

/** Which second of which stored take to show. The view draws it, so this stays pure and a seek needs no replay. */
export interface TakeFrame {
  engine: SceneEngine;
  sceneId: string;
  takeSeconds: number;
}

export function createTakeScene({ engine, sceneId, moments, parts, durationSeconds }: RichScene): Scene<TakeFrame> {
  return {
    parts,
    moments,
    durationSeconds,
    getFrame: (seconds) => ({ engine, sceneId, takeSeconds: Math.min(Math.max(seconds, 0), durationSeconds) }),
  };
}
