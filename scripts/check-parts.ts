/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { getCoreSource, getPartCatalogue, type PartDefinition } from '../apps/agent/src/scenes/recipe/catalogue.ts';
import { compileRecipe, getRecipeTiming, type SceneRecipe } from '../apps/agent/src/scenes/recipe/recipe.ts';
import { buildKitFramePage, getNeededTextures } from '../packages/board/src/scene3d/index.ts';
import { SCENE_ENGINE_VERSIONS } from '../packages/contracts/src/index.ts';

const ROOT = join(import.meta.dirname, '..');
const GPU_FLAGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-mock-keychain', '--mute-audio'];
const DRAW_TIMES = [1.5, 4, 7, 11, 16, 4, 1.5];
const BROKEN_SCENE = /unknown|failed|bad expression|needs points|not loaded|duplicate part/i;

/** Runs every motion a part has, so a part that only misbehaves while moving is caught. */
export function getWholePartRecipe(part: PartDefinition): SceneRecipe {
  const motions = Object.keys(part.motions);
  return {
    topic: part.name,
    stage: part.stage ?? 'studio',
    says: [{ m: 'first', text: 'A line that gives the part a moment to stand still before it moves.' }, { m: 'second', text: 'A line long enough to run its motions for a good while, so they go round.' }, { m: 'third', text: 'A last line, so the part settles back on the whole thing in the frame.' }],
    items: [{ id: 'main', part: part.name }],
    moves: motions.map((motion) => ({ item: 'main', motion, on: 'second' })),
    labels: part.anchors.slice(0, 5).map((anchor) => ({ text: anchor, at: `main.${anchor}`, show: 'first' })),
    arrows: [],
    flows: [],
    gauges: [],
    cams: [{ on: 'first', look: 'main', view: 'front', zoom: 1 }],
  };
}

async function checkPart(page: Page, part: PartDefinition, kitBundle: string): Promise<string[]> {
  const recipe = getWholePartRecipe(part);
  const code = compileRecipe(recipe, { core: getCoreSource(), parts: getPartCatalogue() });
  const { moments, durationSeconds } = getRecipeTiming(recipe.says);
  const timing = { moments, duration: durationSeconds };
  const srcdoc = buildKitFramePage({ kitBundle, code });
  const textures = Object.fromEntries(getNeededTextures(code).map((name) => [name, readFileSync(join(ROOT, 'apps/web/public/scene-kit/textures', `${name}.${name.endsWith('alpha') ? 'png' : 'jpg'}`)).toString('base64')]));
  const result = await page.evaluate(
    ({ srcdoc, textures, timing, times }) =>
      new Promise<{ error?: string; issues?: string[]; deterministic?: boolean; mismatches?: number[]; blank?: number[] }>((resolve) => {
        document.body.replaceChildren();
        const blobs = Object.fromEntries(Object.entries(textures).map(([name, text]) => [name, new Blob([Uint8Array.from(atob(text), (letter) => letter.charCodeAt(0))])]));
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px;border:0';
        frame.srcdoc = srcdoc;
        addEventListener('message', function onReply(event) {
          if (event.source !== frame.contentWindow) return;
          const reply = event.data as { type: string; message?: string; issues?: string[]; result?: { deterministic: boolean; mismatches: number[]; samples: { t: number; lit: number; std: number }[] }; error?: string };
          if (reply.type === 'loaded') frame.contentWindow?.postMessage({ type: 'load', timing, textures: blobs, theme: 'dark' }, '*');
          if (reply.type === 'ready') frame.contentWindow?.postMessage({ type: 'gate', times }, '*');
          if (reply.type === 'error') {
            removeEventListener('message', onReply);
            resolve({ error: reply.message });
          }
          if (reply.type === 'gate') {
            removeEventListener('message', onReply);
            resolve({ error: reply.error, issues: reply.issues, deterministic: reply.result?.deterministic, mismatches: reply.result?.mismatches, blank: reply.result?.samples.filter(({ lit, std }) => lit < 0.002 && std < 0.02).map(({ t }) => t) });
          }
        });
        document.body.append(frame);
      }),
    { srcdoc, textures, timing, times: DRAW_TIMES },
  );
  return [
    ...(result.error ? [`threw: ${result.error}`] : []),
    ...(result.issues ?? []).filter((issue) => BROKEN_SCENE.test(issue)),
    ...(result.deterministic === false ? [`not the same frame at ${result.mismatches?.join(', ')} s when drawn again`] : []),
    ...(result.blank?.length ? [`nothing to see at ${result.blank.join(', ')} s`] : []),
  ];
}

const wanted = process.argv.slice(2);
const kitBundle = readFileSync(join(ROOT, 'apps/web/public/scene-kit', SCENE_ENGINE_VERSIONS.kit, 'kit.js'), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_FLAGS });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
await page.goto('data:text/html,<!doctype html><body></body>');
let failed = 0;
for (const part of getPartCatalogue().values()) {
  if (wanted.length > 0 && !wanted.includes(part.name)) continue;
  const problems = await checkPart(page, part, kitBundle);
  if (problems.length > 0) failed += 1;
  console.log(problems.length > 0 ? `FAIL ${part.name}: ${problems.join('. ')}` : `ok ${part.name}`);
}
await browser.close();
if (failed > 0) process.exit(1);
