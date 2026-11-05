import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import type { SceneKey, StoredScene } from '../scene-types.ts';
import { getMarkedNarration, getRecipeTiming, type SceneRecipe } from './recipe.ts';

export function toRecipeScene({ recipe, code, key, costUsd, writeMs, atIso = new Date().toISOString() }: { recipe: SceneRecipe; code: string; key: SceneKey; costUsd: number; writeMs: number; atIso?: string }): StoredScene {
  const { moments, durationSeconds } = getRecipeTiming(recipe.says);
  const [first, ...rest] = recipe.says;
  return {
    id: key.id,
    topic: key.topic,
    ownerId: key.ownerId,
    status: 'checked',
    engine: 'kit',
    engineVersion: SCENE_ENGINE_VERSIONS.kit,
    code,
    recipe,
    narration: getMarkedNarration(rest),
    plan: { opening: [], setup: first?.text ?? '', narration: getMarkedNarration(rest), plan: '', close: '' },
    moments,
    parts: recipe.items.map(({ id }) => id),
    durationSeconds,
    declared: {},
    values: {},
    review: [],
    layoutNotes: [],
    isCheckedByPerson: false,
    takeBytes: { light: 0, dark: 0 },
    trace: { writer: 'recipe', attempts: 1, writeMs, renderMs: 0, reviewMs: 0, totalMs: writeMs, costUsd, problems: [] },
    savedAt: atIso,
  };
}
