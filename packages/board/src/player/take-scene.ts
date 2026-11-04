import type { RichScene, SceneEngine } from '@astra/contracts';
import type { Scene } from './scene.ts';

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
