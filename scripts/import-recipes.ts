// Saves the starter recipes in a scene store, so they play at once on a typed question and at Home. Run it once per store.
//   SCENE_STORE_DIR=<store> node scripts/import-recipes.ts
// With --from it first copies a lab run's passing recipes into the repo's starter library:
//   node scripts/import-recipes.ts --from <run folder holding <topic>/recipe.txt>
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { getCoreSource, getPartCatalogue } from '../apps/agent/src/scenes/recipe/catalogue.ts';
import { importStarterRecipes, KNOWN_WRONG_RECIPES, readStarterRecipe, STARTER_FILE_ENDING, STARTER_FOLDER } from '../apps/agent/src/scenes/recipe/starter.ts';
import { getSceneStoreRoot } from '../apps/agent/src/scenes/scene-settings.ts';
import { createSceneStore } from '../apps/agent/src/scenes/scene-store.ts';

const LAB_RECIPE_FILE = 'recipe.txt';
const LAB_ONLY_PREFIX = /^dev-/;

const { values: args } = parseArgs({ options: { from: { type: 'string' } } });
const parts = getPartCatalogue();

async function copyPassingRecipes(runFolder: string) {
  mkdirSync(STARTER_FOLDER, { recursive: true });
  for (const name of readdirSync(runFolder).sort()) {
    const path = join(runFolder, name, LAB_RECIPE_FILE);
    if (!existsSync(path)) continue;
    const known = KNOWN_WRONG_RECIPES[name];
    const read = known ? { isOk: false as const, why: `known wrong: ${known}` } : await readStarterRecipe({ text: readFileSync(path, 'utf8'), parts });
    if (read.isOk) copyFileSync(path, join(STARTER_FOLDER, `${name.replace(LAB_ONLY_PREFIX, '')}${STARTER_FILE_ENDING}`));
    console.log(read.isOk ? `copied ${name}: ${read.recipe.topic}` : `skipped ${name}: ${read.why}`);
  }
}

if (args.from) await copyPassingRecipes(args.from);
const outcomes = await importStarterRecipes({ store: createSceneStore(getSceneStoreRoot()), parts, core: getCoreSource() });
for (const { name, topic, kind, why } of outcomes) console.log(`${kind} ${name}: ${why ?? topic}`);
console.log(`${outcomes.filter(({ kind }) => kind !== 'skipped').length} of ${outcomes.length} recipes are in ${getSceneStoreRoot()}.`);
