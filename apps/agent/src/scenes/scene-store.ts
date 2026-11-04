import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import type { SceneTheme, StoredScene } from './scene-types.ts';

const MOST_SLUG_CHARACTERS = 60;
const HASH_CHARACTERS = 8;
const BROTLI_QUALITY = 9;

const toSlug = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, MOST_SLUG_CHARACTERS).replace(/-$/, '');

/** The same topic, values, and engine version give the same id, so a saved scene is found again, and a new version of the engine makes its takes afresh. */
export function getSceneId(topic: string, values: Readonly<Record<string, number>> = {}): string {
  const sortedValues = Object.entries(values).sort(([first], [second]) => first.localeCompare(second));
  const hash = createHash('sha256').update(JSON.stringify([topic.toLowerCase().trim(), sortedValues, SCENE_ENGINE_VERSIONS.manimgx])).digest('hex').slice(0, HASH_CHARACTERS);
  return `${toSlug(topic) || 'scene'}-${hash}`;
}

export interface SceneStore {
  find(sceneId: string): StoredScene | null;
  save(scene: StoredScene, takes: readonly { theme: SceneTheme; bytes: Buffer }[], sheets: readonly Buffer[]): void;
  list(): StoredScene[];
}

const writeReplacing = (path: string, bytes: Buffer | string) => {
  writeFileSync(`${path}.part`, bytes);
  renameSync(`${path}.part`, path);
};

// A take is one immutable file per theme, compressed once so the API can send it as is. Moving to object storage later changes only this file and the API's reader.
export function createSceneStore(root: string): SceneStore {
  const scenesRoot = join(root, 'scenes');
  const read = (sceneId: string): StoredScene | null => {
    const path = join(scenesRoot, sceneId, 'scene.json');
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as StoredScene) : null;
  };
  return {
    find: read,
    list: () => (existsSync(scenesRoot) ? readdirSync(scenesRoot).flatMap((sceneId) => read(sceneId) ?? []) : []),
    save(scene, takes, sheets) {
      const folder = join(scenesRoot, scene.id);
      mkdirSync(folder, { recursive: true });
      for (const { theme, bytes } of takes) writeReplacing(join(folder, `${theme}.take.br`), brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } }));
      sheets.forEach((sheet, index) => writeReplacing(join(folder, `sheet-${index}.png`), sheet));
      writeReplacing(join(folder, 'scene.json'), JSON.stringify(scene, null, 1));
    },
  };
}
