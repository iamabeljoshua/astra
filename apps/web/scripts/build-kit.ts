import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { build } from 'vite';

const WEB_ROOT = join(import.meta.dirname, '..');
const OUT_PATH = join(WEB_ROOT, 'public/scene-kit', SCENE_ENGINE_VERSIONS.kit, 'kit.js');
const ENTRY = join(WEB_ROOT, '../../packages/board/src/scene3d/runtime.js');

/** The kit as one text, set inside each scene's sandboxed page. */
export async function buildKitBundle(): Promise<string> {
  const reply = await build({
    configFile: false,
    logLevel: 'warn',
    build: { write: false, minify: true, target: 'chrome110', lib: { entry: ENTRY, formats: ['iife'], name: 'astraKit', fileName: () => 'kit.js' } },
  });
  const [{ output: [chunk] }] = [reply].flat() as { output: { code: string }[] }[];
  return chunk.code;
}

if (process.argv[1] === import.meta.filename) {
  const bundle = await buildKitBundle();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, bundle);
  console.log(`${OUT_PATH} ${bundle.length} bytes`);
}
