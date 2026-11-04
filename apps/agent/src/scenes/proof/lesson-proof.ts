/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';

const { values: args } = parseArgs({
  options: {
    web: { type: 'string', default: `http://127.0.0.1:${process.env.WEB_PORT ?? 6330}` },
    card: { type: 'string' },
    type: { type: 'string' },
    out: { type: 'string' },
    theme: { type: 'string', default: 'light' },
    seconds: { type: 'string', default: '90' },
    record: { type: 'boolean', default: false },
    stopAt: { type: 'string' },
    switchTheme: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
  },
});
if (!args.out || (!args.card && !args.type)) throw new Error('Name --out and one of --card or --type');
const folder = args.out;
mkdirSync(folder, { recursive: true });

const FLAGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-mock-keychain', '--autoplay-policy=no-user-gesture-required'];
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface Sample {
  atS: number;
  caption: string;
  sceneId: string | null;
  sceneSeconds: number | null;
  opacity: string | null;
  boardItems: number;
}

async function readSample(page: Page, startedAt: number): Promise<Sample> {
  const read = await page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('[data-testid="scene-layer"]');
    return {
      caption: document.querySelector('[data-testid="caption"]')?.textContent ?? '',
      sceneId: layer?.dataset.scene ?? null,
      sceneSeconds: layer?.dataset.seconds ? Number(layer.dataset.seconds) : null,
      opacity: layer?.style.opacity ?? null,
      boardItems: document.querySelectorAll('[data-testid="board"] [data-element]').length,
    };
  });
  return { atS: Number(((performance.now() - startedAt) / 1000).toFixed(2)), ...read };
}

const browser = await chromium.launch({ headless: !args.headed, args: FLAGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: args.theme === 'dark' ? 'dark' : 'light' });
const page = await context.newPage();
const problems: string[] = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});

await page.goto(args.web as string);
await page.getByRole('button', { name: 'Development sign-in' }).click();
await page.getByRole('button', { name: 'maya@astra.test' }).click();
await page.waitForSelector('main h1', { timeout: 30_000 });
await page.evaluate((theme) => {
  localStorage.setItem('theme', theme);
  document.documentElement.dataset.theme = theme;
}, args.theme as string);
await delay(800);
await page.screenshot({ path: join(folder, 'home.png') });
if (args.record) await page.addInitScript(() => history.replaceState(null, '', `${location.pathname}?record=1`));

if (args.card) await page.getByText(args.card, { exact: true }).first().click();
else {
  await page.getByRole('textbox').first().fill(args.type as string);
  await page.keyboard.press('Enter');
}
await page.waitForURL(/\/sessions\/[0-9a-f-]+/, { timeout: 30_000 });
const startedAt = performance.now();
const samples: Sample[] = [];
const seconds = Number(args.seconds);
const shots = new Set<string>();
let isStopped = false;
let didSwitch = false;
while (performance.now() - startedAt < seconds * 1000) {
  const sample = await readSample(page, startedAt);
  samples.push(sample);
  const hasScene = sample.sceneId !== null && Number(sample.opacity) > 0.9;
  const whole = Math.floor(sample.atS / 5) * 5;
  const shotName = `${hasScene ? 'scene' : 'board'}-${String(whole).padStart(3, '0')}`;
  if (!shots.has(shotName)) {
    shots.add(shotName);
    await page.screenshot({ path: join(folder, `${shotName}.png`) });
  }
  if (hasScene && args.stopAt && !isStopped && (sample.sceneSeconds ?? 0) >= Number(args.stopAt)) {
    isStopped = true;
    await page.getByRole('textbox').first().fill('wait, why is that?');
    await page.keyboard.press('Enter');
    const frozen = await readSample(page, startedAt);
    await page.screenshot({ path: join(folder, 'stop-1.png') });
    await delay(1500);
    const later = await readSample(page, startedAt);
    await page.screenshot({ path: join(folder, 'stop-2.png') });
    writeFileSync(join(folder, 'stop.json'), JSON.stringify({ frozen, later, isFrozen: frozen.sceneSeconds === later.sceneSeconds }, null, 1));
  }
  if (hasScene && args.switchTheme && !didSwitch && (sample.sceneSeconds ?? 0) >= 5) {
    didSwitch = true;
    await page.evaluate(() => {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    });
    await delay(900);
    await page.screenshot({ path: join(folder, 'after-theme-switch.png') });
  }
  const ending = samples.at(-1)?.caption.trim().endsWith('?');
  if (ending && samples.filter((entry) => entry.caption.trim().endsWith('?')).length > 8) break;
  await delay(100);
}
const log = await page.evaluate(() => window.sceneLesson?.records.log.length ?? 0);
writeFileSync(join(folder, 'samples.json'), JSON.stringify(samples, null, 0));
writeFileSync(join(folder, 'summary.json'), JSON.stringify({ problems, log, lastCaption: samples.at(-1)?.caption, firstSceneAtS: samples.find((sample) => sample.sceneId)?.atS ?? null, sceneRange: samples.filter((sample) => sample.sceneSeconds !== null).map((sample) => sample.sceneSeconds).at(-1) ?? null }, null, 1));
console.log(readFileSyncSafe(join(folder, 'summary.json')));
await browser.close();

function readFileSyncSafe(path: string): string {
  return JSON.stringify({ path, problems: problems.slice(0, 6), log, samples: samples.length, firstSceneAtS: samples.find((sample) => sample.sceneId)?.atS ?? null, lastSceneSeconds: samples.filter((sample) => sample.sceneSeconds !== null).at(-1)?.sceneSeconds ?? null, lastCaption: samples.at(-1)?.caption });
}

declare global {
  interface Window {
    sceneLesson?: { records: { log: unknown[] } };
  }
}
