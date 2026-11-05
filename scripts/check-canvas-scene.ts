import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { SCENE_BUNDLES } from '../apps/web/scripts/build-kit.ts';
import { buildKitFramePage } from '../packages/board/src/scene3d/index.ts';

const { values: args } = parseArgs({ options: { scenes: { type: 'string' }, out: { type: 'string' }, theme: { type: 'string', default: 'light' }, width: { type: 'string', default: '1280' } } });
const LOAD_LIMIT_MS = 15_000;
const BUNDLE = readFileSync(SCENE_BUNDLES.canvas.out, 'utf8');
const scenesFolder = args.scenes as string;

interface FrameResult {
  problem: string | null;
  loadMs: number;
  pictures: { seconds: number; url: string }[];
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-mock-keychain', '--mute-audio'] });
const page = await browser.newPage();
const folders = readdirSync(scenesFolder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name);
let refused = 0;

for (const name of folders) {
  const code = readFileSync(join(scenesFolder, name, 'scene.js'), 'utf8');
  const timing = JSON.parse(readFileSync(join(scenesFolder, name, 'timing.json'), 'utf8')) as { moments: Record<string, number>; duration: number };
  const srcdoc = buildKitFramePage({ kitBundle: BUNDLE, code });
  const times = args.out ? [...Object.values(timing.moments).map((moment) => Math.min(moment + 1.8, timing.duration - 0.05))] : [];
  const result = await page.evaluate(
    ({ srcdoc, timing, theme, times, width, LOAD_LIMIT_MS }) =>
      new Promise<FrameResult>((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.style.cssText = `width:${width}px;height:${(width * 9) / 16}px`;
        iframe.srcdoc = srcdoc;
        const startedAt = performance.now();
        const outcome: FrameResult = { problem: null, loadMs: 0, pictures: [] };
        const finish = () => {
          window.removeEventListener('message', onMessage);
          iframe.remove();
          resolve(outcome);
        };
        const limit = setTimeout(() => {
          outcome.problem = 'it never said ready';
          finish();
        }, LOAD_LIMIT_MS);
        const ask = () => iframe.contentWindow?.postMessage({ type: 'picture', seconds: times[outcome.pictures.length], id: outcome.pictures.length }, '*');
        function onMessage(event: MessageEvent) {
          if (event.source !== iframe.contentWindow) return;
          const reply = event.data as { type: string; message?: string; url?: string };
          if (reply.type === 'loaded') iframe.contentWindow?.postMessage({ type: 'load', timing, textures: {}, theme }, '*');
          if (reply.type === 'error') {
            clearTimeout(limit);
            outcome.problem = reply.message ?? 'unknown';
            finish();
          }
          if (reply.type === 'ready') {
            outcome.loadMs = performance.now() - startedAt;
            if (times.length === 0) {
              clearTimeout(limit);
              finish();
            } else ask();
          }
          if (reply.type === 'picture') {
            outcome.pictures.push({ seconds: times[outcome.pictures.length] as number, url: reply.url as string });
            if (outcome.pictures.length < times.length) ask();
            else {
              clearTimeout(limit);
              finish();
            }
          }
        }
        window.addEventListener('message', onMessage);
        document.body.append(iframe);
      }),
    { srcdoc, timing, theme: args.theme, times, width: Number(args.width), LOAD_LIMIT_MS },
  );
  if (result.problem) refused += 1;
  console.log(`${result.problem ? 'REFUSED' : 'passed '} ${name} ${Math.round(result.loadMs)} ms ${result.problem ?? ''}`);
  if (args.out) {
    mkdirSync(join(args.out, name), { recursive: true });
    result.pictures.forEach(({ url }, index) => writeFileSync(join(args.out as string, name, `f${index}.jpg`), Buffer.from(url.split(',')[1] as string, 'base64')));
  }
}

await browser.close();
console.log(`${folders.length - refused} of ${folders.length} passed the frame check`);
