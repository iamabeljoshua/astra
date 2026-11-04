/// <reference lib="dom" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { buildKitFramePage, getNeededTextures, type KitTheme } from '../packages/board/src/scene3d/index.ts';
import { SCENE_ENGINE_VERSIONS } from '../packages/contracts/src/index.ts';
import { getMostFlashesInASecond, type LuminanceChange } from '../apps/web/src/lab/deck/flashes.ts';

const ROOT = join(import.meta.dirname, '..');
const GPU_FLAGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-mock-keychain', '--mute-audio'];
const MOST_FLASHES_IN_A_SECOND = 3;
const FLASH_STEP_SECONDS = 0.05;
const FLASH_LUMINANCE_CHANGE = 0.1;
/** WCAG's limit is 25% of a 10 degree field. On a board 960 wide that is about a quarter of these 32 tiles at once, so a change across 8 tiles counts. */
const FLASH_TILES = 8;
const DARKER_SIDE_LIMIT = 0.8;
const BLANK_LIT = 0.002;
const BLANK_STD = 0.02;

const { values: args } = parseArgs({ options: { scene: { type: 'string' }, out: { type: 'string' }, headless: { type: 'boolean', default: false }, theme: { type: 'string', default: 'dark' }, seconds: { type: 'string' } } });
if (!args.scene) throw new Error('--scene takes a folder with scene.js and scene.json, or a scene.json holding its code');
const isFolder = existsSync(join(args.scene, 'scene.js'));
const record = JSON.parse(readFileSync(isFolder ? join(args.scene, 'scene.json') : args.scene, 'utf8')) as { code?: string; moments: Record<string, number>; durationSeconds: number; topic?: string };
const code = isFolder ? readFileSync(join(args.scene, 'scene.js'), 'utf8') : (record.code as string);
const timing = { moments: record.moments, duration: record.durationSeconds };
const theme = args.theme as KitTheme;

async function bootScene(page: Page): Promise<unknown> {
  const srcdoc = buildKitFramePage({ kitBundle: readFileSync(join(ROOT, 'apps/web/public/scene-kit', SCENE_ENGINE_VERSIONS.kit, 'kit.js'), 'utf8'), code });
  const textures = Object.fromEntries(getNeededTextures(code).map((name) => [name, readFileSync(join(ROOT, 'apps/web/public/scene-kit/textures', `${name}.${name.endsWith('alpha') ? 'png' : 'jpg'}`)).toString('base64')]));
  return page.evaluate(
    ({ srcdoc, textures, timing, theme }) =>
      new Promise((resolve) => {
        const blobs = Object.fromEntries(Object.entries(textures).map(([name, text]) => [name, new Blob([Uint8Array.from(atob(text), (letter) => letter.charCodeAt(0))])]));
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px;border:0';
        frame.srcdoc = srcdoc;
        addEventListener('message', function onReply(event) {
          if (event.source !== frame.contentWindow) return;
          const reply = event.data as { type: string };
          if (reply.type === 'loaded') frame.contentWindow?.postMessage({ type: 'load', timing, textures: blobs, theme }, '*');
          if (reply.type === 'ready' || reply.type === 'error') {
            removeEventListener('message', onReply);
            resolve(reply);
          }
        });
        document.body.append(frame);
        (window as unknown as { kitFrame: HTMLIFrameElement }).kitFrame = frame;
      }),
    { srcdoc, textures, timing, theme },
  );
}

function ask<Reply>(page: Page, command: Record<string, unknown>, replyType: string): Promise<Reply> {
  return page.evaluate(
    ({ command, replyType }) =>
      new Promise<Reply>((resolve) => {
        const frame = (window as unknown as { kitFrame: HTMLIFrameElement }).kitFrame;
        addEventListener('message', function onReply(event) {
          if (event.source !== frame.contentWindow || (event.data as { type: string }).type !== replyType) return;
          removeEventListener('message', onReply);
          resolve(event.data as Reply);
        });
        frame.contentWindow?.postMessage(command, '*');
      }),
    { command, replyType },
  );
}

const getTimes = () => {
  const moments = Object.values(timing.moments).sort((first, second) => first - second);
  return [...new Set([...moments.map((moment) => moment + 1), timing.duration / 2, timing.duration - 0.2].map((seconds) => Number(Math.min(seconds, timing.duration).toFixed(3))))];
};

function getFlashes(frames: { t: number; tiles: number[] }[]): number {
  const changes: LuminanceChange[] = [];
  for (const [index, frame] of frames.entries()) {
    const before = frames[index - 1];
    if (!before) continue;
    const rising = frame.tiles.filter((level, tile) => level - (before.tiles[tile] as number) > FLASH_LUMINANCE_CHANGE && (before.tiles[tile] as number) < DARKER_SIDE_LIMIT).length;
    const falling = frame.tiles.filter((level, tile) => (before.tiles[tile] as number) - level > FLASH_LUMINANCE_CHANGE && level < DARKER_SIDE_LIMIT).length;
    if (rising >= FLASH_TILES) changes.push({ atMs: frame.t * 1000, direction: 1 });
    else if (falling >= FLASH_TILES) changes.push({ atMs: frame.t * 1000, direction: -1 });
  }
  return getMostFlashesInASecond(changes);
}

const browser = await chromium.launch({ channel: 'chrome', headless: args.headless, args: GPU_FLAGS });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
await page.goto('data:text/html,<!doctype html><body></body>');
const failures: string[] = [];
const ready = (await bootScene(page)) as { type: string; message?: string; issues?: string[] };
if (ready.type === 'error') failures.push(`it did not build: ${ready.message}`);
else {
  const broken = (ready.issues ?? []).filter((issue) => /unknown|failed|bad expression|needs points|not loaded|duplicate part/i.test(issue));
  if (broken.length) failures.push(`the kit reported: ${broken.join('; ')}`);
  const times = args.seconds ? args.seconds.split(',').map(Number) : getTimes();
  const gate = await ask<{ result: { samples: { t: number; lit: number; std: number }[]; deterministic: boolean; mismatches: number[] }; error?: string }>(page, { type: 'gate', times }, 'gate');
  if (gate.error) failures.push(`it threw while drawing: ${gate.error}`);
  const blank = gate.result?.samples.filter(({ lit, std }) => lit < BLANK_LIT && std < BLANK_STD) ?? [];
  if (blank.length) failures.push(`nothing to see at ${blank.map(({ t }) => t).join(', ')} s`);
  if (gate.result && !gate.result.deterministic) failures.push(`not the same frame at ${gate.result.mismatches.join(', ')} s when drawn again`);
  console.log(JSON.stringify(gate.result?.samples));
  const flashTimes = Array.from({ length: Math.floor(timing.duration / FLASH_STEP_SECONDS) }, (_, index) => Number((index * FLASH_STEP_SECONDS).toFixed(3)));
  const flash = await ask<{ result: { t: number; tiles: number[] }[]; error?: string }>(page, { type: 'flash', times: flashTimes }, 'flash');
  const flashes = flash.error ? null : getFlashes(flash.result);
  console.log(`Most flashes in a second: ${flashes}, over ${flashTimes.length} frames. The limit is ${MOST_FLASHES_IN_A_SECOND}.`);
  if (flashes === null || flashes > MOST_FLASHES_IN_A_SECOND) failures.push(`it flashes ${flashes} times in a second, and the limit is ${MOST_FLASHES_IN_A_SECOND}`);
  if (args.out) {
    mkdirSync(args.out, { recursive: true });
    for (const [index, seconds] of times.entries()) {
      const { url } = await ask<{ url: string }>(page, { type: 'picture', seconds, id: index }, 'picture');
      writeFileSync(join(args.out, `${theme}-${String(seconds).replace('.', '_')}.jpg`), Buffer.from(url.split(',')[1] as string, 'base64'));
    }
  }
}
await browser.close();
if (failures.length) {
  console.error(`FAIL ${record.topic ?? args.scene}: ${failures.join('. ')}`);
  process.exit(1);
}
console.log(`ok ${record.topic ?? args.scene}`);
