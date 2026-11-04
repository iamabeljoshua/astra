import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { build } from 'vite';

const WEB_ROOT = join(import.meta.dirname, '..');
const OUT_PATH = join(WEB_ROOT, 'public/scene-kit', SCENE_ENGINE_VERSIONS.kit, 'kit.js');
const SOURCE_FOLDER = join(WEB_ROOT, '../../packages/board/src/scene3d');
const ENTRY = join(SOURCE_FOLDER, 'runtime.js');
const SOURCE_FILES = ['runtime.js', 'kit.js', 'studio.js'];
export const SOURCE_HASH_PATH = join(dirname(OUT_PATH), 'kit.source.sha256');

/** The committed kit is built ahead of time, so a check can say when its source has moved on without it. */
export const getKitSourceHash = () => SOURCE_FILES.reduce((hash, name) => hash.update(readFileSync(join(SOURCE_FOLDER, name))), createHash('sha256')).digest('hex');

/** The kit as one text, set inside each scene's sandboxed page. */
export async function buildKitBundle(): Promise<string> {
  const reply = await build({
    configFile: false,
    logLevel: 'warn',
    build: { write: false, minify: true, target: 'chrome110', lib: { entry: ENTRY, formats: ['iife'], name: 'astraKit', fileName: () => 'kit.js' } },
  });
  const [{ output: [chunk] }] = [reply].flat() as unknown as [{ output: [{ code: string }] }];
  return chunk.code;
}

if (process.argv[1] === import.meta.filename) {
  const bundle = await buildKitBundle();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, bundle);
  writeFileSync(SOURCE_HASH_PATH, `${getKitSourceHash()}\n`);
  console.log(`${OUT_PATH} ${bundle.length} bytes`);
}
