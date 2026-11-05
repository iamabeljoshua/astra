import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { build } from 'vite';

const WEB_ROOT = join(import.meta.dirname, '..');
const SOURCE_ROOT = join(WEB_ROOT, '../../packages/board/src');
const PUBLIC_ROOT = join(WEB_ROOT, 'public/scene-kit');
const LOCK_DOWN = 'scene3d/lock-down.js';

/** Each runtime is one file the page fetches, and its hash says it was built from the source beside it. */
export const SCENE_BUNDLES = {
  kit: { out: join(PUBLIC_ROOT, SCENE_ENGINE_VERSIONS.kit, 'kit.js'), entry: 'scene3d/runtime.js', sources: ['scene3d/runtime.js', 'scene3d/overlay-dom.js', 'scene3d/kit.js', 'scene3d/studio.js', LOCK_DOWN] },
  canvas: { out: join(PUBLIC_ROOT, `canvas-${SCENE_ENGINE_VERSIONS.canvas}`, 'canvas.js'), entry: 'scene2d/runtime.js', sources: ['scene2d/runtime.js', 'scene2d/kit2d.js', 'scene2d/frame-check.js', LOCK_DOWN] },
} as const;

type BundleName = keyof typeof SCENE_BUNDLES;

export const getSourceHashPath = (name: BundleName) => SCENE_BUNDLES[name].out.replace(/\.js$/, '.source.sha256');

export const getSourceHash = (name: BundleName) => SCENE_BUNDLES[name].sources.reduce((hash, file) => hash.update(readFileSync(join(SOURCE_ROOT, file))), createHash('sha256')).digest('hex');

export async function buildBundle(name: BundleName): Promise<string> {
  const reply = await build({
    configFile: false,
    logLevel: 'warn',
    build: { write: false, minify: true, target: 'chrome110', lib: { entry: join(SOURCE_ROOT, SCENE_BUNDLES[name].entry), formats: ['iife'], name: 'astraKit', fileName: () => 'kit.js' } },
  });
  const [{ output: [chunk] }] = [reply].flat() as unknown as [{ output: [{ code: string }] }];
  return chunk.code;
}

if (process.argv[1] === import.meta.filename) {
  for (const name of Object.keys(SCENE_BUNDLES) as BundleName[]) {
    const bundle = await buildBundle(name);
    const { out } = SCENE_BUNDLES[name];
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bundle);
    writeFileSync(getSourceHashPath(name), `${getSourceHash(name)}\n`);
    console.log(`${out} ${bundle.length} bytes`);
  }
}
