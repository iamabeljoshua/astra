/// <reference lib="dom" />
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';

const { values: args } = parseArgs({
  options: {
    web: { type: 'string' },
    out: { type: 'string' },
    trace: { type: 'string' },
    title: { type: 'string', default: 'How a rocket escapes Earth' },
    topic: { type: 'string', default: 'rocket-escape' },
    subject: { type: 'string', default: 'Physics' },
    says: { type: 'string', default: '' },
    replies: { type: 'string', default: '8' },
    seconds: { type: 'string', default: '420' },
  },
});
if (!args.web || !args.out || !args.trace) throw new Error('Give --web, --out, and --trace.');

const OUT = args.out;
const TRACE = args.trace;
const FLAGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-mock-keychain', '--mute-audio', '--autoplay-policy=no-user-gesture-required'];
const POLL_MS = 200;
const AFTER_THE_LAST_REPLY_MS = 6000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });

const readPage = (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('[data-testid="board-visual"] [data-testid="scene-layer"]');
    return {
      sceneId: layer && Number(layer.style.opacity || 0) > 0 ? (layer.dataset.scene ?? null) : null,
      caption: document.querySelector('[data-testid="tutor-caption"]')?.textContent?.trim() ?? '',
    };
  });

function readTrace(startedAtWallMs: number) {
  return readdirSync(TRACE)
    .filter((name) => name.endsWith('.jsonl') && statSync(join(TRACE, name)).mtimeMs >= startedAtWallMs)
    .flatMap((name) => readFileSync(join(TRACE, name), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { name: string; atMs: number } & Record<string, unknown>));
}

const browser = await chromium.launch({ headless: true, args: FLAGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: args.web, colorScheme: 'light' });
const page = await context.newPage();
const problems: string[] = [];
page.on('pageerror', (error) => problems.push(error.message));
await page.goto('/');
await page.getByRole('button', { name: 'Development sign-in' }).click();
await page.getByRole('button', { name: 'maya@astra.test' }).click();
const box = page.getByRole('textbox', { name: 'What do you want to learn next' });
await box.waitFor({ timeout: 60_000 });
await delay(1500);

await page.route('**/api/sessions', async (route) => {
  if (route.request().method() !== 'POST') return route.continue();
  await route.continue({ postData: JSON.stringify({ title: args.title, subject: args.subject, language: 'en', topicId: args.topic }) });
});
const startedAtWallMs = Date.now();
await box.fill(args.title ?? '');
await page.getByRole('button', { name: 'Start session' }).click();
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
await page.unroute('**/api/sessions');

const seen: { sceneId: string; atS: number }[] = [];
const captions: { atS: number; words: string }[] = [];
const said: { atS: number; words: string }[] = [];
const toSay = (args.says ?? '').split('|').filter(Boolean).map((one) => ({ afterReplies: Number(one.split(':')[0]), words: one.split(':').slice(1).join(':') }));
const getAtS = () => Math.round((Date.now() - startedAtWallMs) / 100) / 10;
const target = Number(args.replies);
const limitAtMs = Date.now() + Number(args.seconds) * 1000;
let replies = 0;
let reachedAtMs: number | null = null;
while (Date.now() < limitAtMs) {
  await delay(POLL_MS);
  const read = await readPage(page);
  if (read.caption && captions.at(-1)?.words !== read.caption) captions.push({ atS: getAtS(), words: read.caption });
  if (read.sceneId && !seen.some((one) => one.sceneId === read.sceneId)) {
    seen.push({ sceneId: read.sceneId, atS: getAtS() });
    await delay(2500);
    await page.screenshot({ path: join(OUT, `scene-${seen.length}.png`) });
  }
  replies = readTrace(startedAtWallMs).filter((line) => line.name === 'turnWritten').length;
  const next = toSay[0];
  if (next && replies >= next.afterReplies) {
    toSay.shift();
    await page.getByRole('textbox').first().fill(next.words);
    await page.getByRole('textbox').first().press('Enter');
    said.push({ atS: getAtS(), words: next.words });
  }
  if (replies >= target) reachedAtMs ??= Date.now();
  if (reachedAtMs !== null && Date.now() - reachedAtMs > AFTER_THE_LAST_REPLY_MS) break;
}
await page.screenshot({ path: join(OUT, 'end.png') });
const trace = readTrace(startedAtWallMs);
const summary = {
  replies,
  scenes: seen,
  leads: trace.filter((line) => line.name === 'replyDecided' && line.via === 'lead').map((line) => line.text),
  sceneEvents: trace.filter((line) => line.name === 'sceneEnded' || line.name === 'sceneCue').map((line) => [line.name, line.how ?? line.text]),
  said,
  problems,
};
writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify({ ...summary, captions }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
await browser.close();
