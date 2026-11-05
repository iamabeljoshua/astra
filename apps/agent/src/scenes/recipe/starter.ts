import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSceneKey, type SceneStore } from '../scene-store.ts';
import type { NameReader } from '../scene-types.ts';
import type { PartCatalogue } from './catalogue.ts';
import { addRecipeLine, checkRecipe, compileRecipe, createRecipeDraft, type SceneRecipe } from './recipe.ts';
import { getCleanLines } from './recipe-work.ts';
import { toRecipeScene } from './recipe-scene.ts';

export const STARTER_FOLDER = join(import.meta.dirname, 'starter');
export const STARTER_FILE_ENDING = '.jsonl';

/** Recipes a person read and took out, each with why. */
export const KNOWN_WRONG_RECIPES: Readonly<Record<string, string>> = {
  'car-engine': '"The spark lights the mix" plays over cold gas',
};

const NO_NAMES_CLEARED: NameReader = { clear: async () => new Set() };

export type RecipeRead = { isOk: true; recipe: SceneRecipe } | { isOk: false; why: string };

/** The same reading a fresh recipe gets: the schema, the part check, and the word check. */
export async function readStarterRecipe({ text, parts, nameReader = NO_NAMES_CLEARED }: { text: string; parts: PartCatalogue; nameReader?: NameReader }): Promise<RecipeRead> {
  const draft = createRecipeDraft();
  for (const line of text.split('\n')) addRecipeLine(draft, line);
  if (draft.fit.kind === 'noFit') return { isOk: false, why: `no part fits: ${draft.fit.why}` };
  const checked = checkRecipe(draft, parts);
  if (!checked.isOk) return { isOk: false, why: checked.problems.join('; ') };
  const { says, problems } = await getCleanLines({ topic: checked.recipe.topic, says: checked.recipe.says, nameReader, signal: AbortSignal.timeout(10_000) });
  return problems.length > 0 ? { isOk: false, why: `the words were refused: ${problems.join('; ')}` } : { isOk: true, recipe: { ...checked.recipe, says } };
}

export interface StarterOutcome {
  name: string;
  topic: string;
  kind: 'saved' | 'alreadySaved' | 'skipped';
  why?: string;
}

export interface StarterImport {
  store: SceneStore;
  parts: PartCatalogue;
  core: string;
  folder?: string;
  nameReader?: NameReader;
}

/** Saves each starter recipe as a shared scene, so its topic plays at once. A second run changes nothing. */
export async function importStarterRecipes({ store, parts, core, folder = STARTER_FOLDER, nameReader }: StarterImport): Promise<StarterOutcome[]> {
  const outcomes: StarterOutcome[] = [];
  for (const file of readdirSync(folder).filter((name) => name.endsWith(STARTER_FILE_ENDING)).sort()) {
    const name = file.slice(0, -STARTER_FILE_ENDING.length);
    const read = await readStarterRecipe({ text: readFileSync(join(folder, file), 'utf8'), parts, ...(nameReader ? { nameReader } : {}) });
    if (!read.isOk) {
      outcomes.push({ name, topic: '', kind: 'skipped', why: read.why });
      continue;
    }
    const { recipe } = read;
    const key = getSceneKey(recipe.topic);
    const isSaved = store.find(key) !== null;
    if (!isSaved) await store.saveChecked(toRecipeScene({ recipe, code: compileRecipe(recipe, { core, parts }), key, costUsd: 0, writeMs: 0 }), [], []);
    outcomes.push({ name, topic: recipe.topic, kind: isSaved ? 'alreadySaved' : 'saved' });
  }
  return outcomes;
}
