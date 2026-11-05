import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCoreSource, getPartCatalogue } from '../src/scenes/recipe/catalogue.ts';
import { importStarterRecipes, readStarterRecipe, STARTER_FOLDER } from '../src/scenes/recipe/starter.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';

const parts = getPartCatalogue();
const importInto = (root: string) => importStarterRecipes({ store: createSceneStore(root), parts, core: getCoreSource() });

describe('the starter library', () => {
  it('saves every recipe as a shared scene a student can play at once, and a second run changes nothing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'starter-'));
    const first = await importInto(root);
    expect(first.length).toBeGreaterThan(20);
    expect(first.filter(({ kind }) => kind !== 'saved')).toEqual([]);
    const volcano = createSceneStore(root).find(getSceneKey('How volcanoes erupt'));
    expect(volcano).toMatchObject({ engine: 'kit', ownerId: null, status: 'checked' });
    expect(volcano?.recipe).toBeDefined();
    expect((await importInto(root)).every(({ kind }) => kind === 'alreadySaved')).toBe(true);
  });

  it('holds neither the known wrong car engine nor a recipe with no part', () => {
    const names = readdirSync(STARTER_FOLDER);
    expect(names.some((name) => name.includes('car-engine'))).toBe(false);
    expect(names.flatMap((name) => readFileSync(join(STARTER_FOLDER, name), 'utf8').split('\n').slice(0, 1)).some((line) => line.includes('"in":false'))).toBe(false);
  });

  it('refuses a recipe that fits no part, and words that fail the check a fresh recipe gets', async () => {
    const noFit = await readStarterRecipe({ text: JSON.stringify({ t: 'fit', in: false, topic: 'bees', why: 'no bee' }), parts });
    expect(noFit).toMatchObject({ isOk: false });
    const named = [
      { t: 'fit', in: true, topic: 'Why rockets have stages', stage: 'space' },
      { t: 'say', m: 'a', text: 'Zorblax Quimby built this rocket on the pad.' },
      { t: 'say', m: 'b', text: 'Then the empty first stage drops away.' },
      { t: 'part', id: 'rocket', part: 'rocket' },
    ].map((line) => JSON.stringify(line)).join('\n');
    expect(await readStarterRecipe({ text: named, parts })).toMatchObject({ isOk: false });
  });
});
