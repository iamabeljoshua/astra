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
    noGpu: { type: 'boolean', default: false },
    damageTake: { type: 'boolean', default: false },
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
const requests: { url: string; atMs: number; bytes: number | null }[] = [];
const pageOpenedAt = performance.now();
page.on('response', (response) => {
  const url = response.url();
  if (url.includes('scene-engine') || url.includes('scene-takes') || url.includes('livekit')) requests.push({ url: url.replace(args.web as string, ''), atMs: Math.round(performance.now() - pageOpenedAt), bytes: Number(response.headers()['content-length'] ?? 0) || null });
});
if (args.noGpu) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }));
if (args.damageTake) {
  await page.route('**/api/scene-takes/**', async (route) => {
    const body = Buffer.from(Array.from({ length: 4096 }, (_, index) => (index * 37) % 256));
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body });
  });
}
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
if (args.record) await page.evaluate(() => localStorage.setItem('astra.lesson.record', '1'));

if (args.card) await page.getByText(args.card, { exact: true }).first().click();
else {
  await page.getByRole('textbox').first().fill(args.type as string);
  await page.keyboard.press('Enter');
}
const requestsOnHome = requests.length;
await page.waitForURL(/\/sessions\/[0-9a-f-]+/, { timeout: 30_000 });
const cdp = args.record ? await context.newCDPSession(page) : null;
const screencast: { epochMs: number; data: string }[] = [];
if (cdp) {
  cdp.on('Page.screencastFrame', (frame) => {
    screencast.push({ epochMs: (frame.metadata.timestamp ?? 0) * 1000, data: frame.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
}
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
    await delay(400);
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
await delay(1500);
const log = await page.evaluate(() => window.sceneLesson?.records.log.length ?? 0);
if (cdp) await cdp.send('Page.stopScreencast');
const proofs = await readProofs(page);
writeFileSync(join(folder, 'proofs.json'), JSON.stringify({ ...proofs, requestsOnHome: requests.slice(0, requestsOnHome), requestsInLesson: requests.slice(requestsOnHome) }, null, 1));
if (args.record && cdp) await saveRecording(page);
writeFileSync(join(folder, 'samples.json'), JSON.stringify(samples, null, 0));
writeFileSync(join(folder, 'summary.json'), JSON.stringify({ problems, log, lastCaption: samples.at(-1)?.caption, firstSceneAtS: samples.find((sample) => sample.sceneId)?.atS ?? null, sceneRange: samples.filter((sample) => sample.sceneSeconds !== null).map((sample) => sample.sceneSeconds).at(-1) ?? null }, null, 1));
console.log(JSON.stringify({ folder, problems: problems.slice(0, 6), log, samples: samples.length, firstSceneAtS: samples.find((sample) => sample.sceneId)?.atS ?? null, lastSceneSeconds: samples.filter((sample) => sample.sceneSeconds !== null).at(-1)?.sceneSeconds ?? null, lastCaption: samples.at(-1)?.caption }));
await browser.close();

async function saveRecording(recorded: Page) {
  const taken = await recorded.evaluate(() => {
    const lesson = window.sceneLesson;
    return lesson?.pcm ? { output: lesson.pcm.take('output'), clockMap: lesson.clockMap() } : null;
  });
  if (!taken) throw new Error('The lesson kept no sound');
  writeFileSync(join(folder, 'output.pcm'), Buffer.from(taken.output.base64, 'base64'));
  writeFileSync(join(folder, 'taps.json'), JSON.stringify({ rate: 24000, outputFirstFrame: taken.output.firstFrame }));
  writeFileSync(join(folder, 'page.json'), JSON.stringify({ clockMap: taken.clockMap }));
  writeFileSync(join(folder, 'screencast.json'), JSON.stringify(screencast));
}

async function readProofs(open: Page) {
  const fromPage = await open.evaluate(() => {
    const lesson = window.sceneLesson;
    if (!lesson) return null;
    const { fired, log: events } = lesson.records;
    const errors = fired.map((cue) => Math.abs(cue.positionMs - cue.wordStartMs)).sort((first, second) => first - second);
    const getSeconds = (board: { elements: { id: string; sceneSeconds?: number }[] }) => board.elements.find((element) => element.sceneSeconds !== undefined)?.sceneSeconds ?? null;
    const scene = events.filter((event) => event.kind === 'beatPlayed').find((event) => JSON.stringify(event.beat?.script).includes('richScene'));
    const fromMs = scene?.atMs ?? 0;
    const toMs = fromMs + (scene?.durationMs ?? 0);
    const comparisons = Array.from({ length: 40 }, (_, index) => {
      const atMs = fromMs + ((toMs - fromMs) * index) / 39;
      return { atMs, live: getSeconds(lesson.describeReplay(atMs)), again: getSeconds(lesson.describeReplay(atMs)) };
    });
    const frameTimes = lesson.records.frames.map((frame) => frame.ms);
    const gaps = frameTimes.slice(1).map((ms, index) => ms - (frameTimes[index] as number)).sort((first, second) => first - second);
    const sceneLoads = performance.getEntriesByName('scene-load').map((entry) => Math.round(entry.duration));
    return { framesPerSecond: gaps.length > 0 ? Math.round((1000 * gaps.length) / gaps.reduce((sum, gap) => sum + gap, 0)) : null, frameGapP95Ms: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0), sceneLoads, cueCount: fired.length, cueErrorP50Ms: errors[errors.length >> 1] ?? null, cueErrorP95Ms: errors[Math.floor(errors.length * 0.95)] ?? null, cueErrorWorstMs: errors.at(-1) ?? null, logEvents: events.length, sceneBeatInLog: scene !== undefined, replaySamples: comparisons.filter((row) => row.live !== null).length, replaySeconds: comparisons.map((row) => row.live), clockKind: lesson.records.clockKind, refused: lesson.records.refused };
  });
  const seek = await proveSeekExact(open);
  return { fromPage, seek };
}

async function proveSeekExact(open: Page) {
  const window_ = await open.evaluate(() => {
    const lesson = window.sceneLesson;
    const events = lesson?.records.log ?? [];
    const played = events.filter((event) => event.kind === 'beatPlayed');
    const scene = played.find((event) => JSON.stringify(event.beat?.script).includes('richScene'));
    const liveStart = lesson?.player.getOperations().find((operation) => operation.kind === 'beatStarted')?.atMs;
    const logStart = played[0]?.atMs;
    return scene && liveStart !== undefined && logStart !== undefined ? { fromMs: scene.atMs, toMs: scene.atMs + (scene.durationMs ?? 0), liveMinusLogMs: liveStart - logStart } : null;
  });
  if (!window_) return null;
  const stageBox = open.getByTestId('scene-layer');
  const times = Array.from({ length: 12 }, (_, index) => window_.fromMs + 600 + ((window_.toMs - window_.fromMs - 1200) * ((index * 5) % 12)) / 11);
  const shoot = async (atMs: number, source: 'live' | 'replay') => {
    await open.evaluate(([at, from]) => window.holdLessonFrame?.({ atMs: at as number, source: from as 'live' | 'replay' }), [atMs, source]);
    await delay(150);
    const seconds = await open.evaluate(() => document.querySelector<HTMLElement>('[data-testid="scene-layer"]')?.dataset.seconds ?? null);
    return { seconds, image: (await stageBox.screenshot()).toString('base64') };
  };
  const live: { seconds: string | null; image: string }[] = [];
  for (const atMs of times) live.push(await shoot(atMs + window_.liveMinusLogMs, 'live'));
  const replayed: { seconds: string | null; image: string }[] = [];
  for (const atMs of [...times].reverse()) replayed.push(await shoot(atMs, 'replay'));
  replayed.reverse();
  await open.evaluate(() => window.holdLessonFrame?.(null));
  return { liveMinusLogMs: window_.liveMinusLogMs, replaySeconds: replayed.map((frame) => frame.seconds), seeks: times.length, distinctFrames: new Set(live.map((frame) => frame.image)).size, sameSecond: live.filter((frame, index) => frame.seconds === replayed[index]?.seconds).length, samePixels: live.filter((frame, index) => frame.image === replayed[index]?.image).length, seconds: live.map((frame) => frame.seconds) };
}

interface ProofBoard {
  elements: { id: string; sceneSeconds?: number }[];
}

declare global {
  interface Window {
    sceneLesson?: {
      records: { frames: { ms: number }[]; clockKind: string; refused: string[]; fired: { positionMs: number; wordStartMs: number }[]; log: { kind: string; atMs: number; durationMs?: number; beat?: { script: unknown[] } }[] };
      pcm: { take(point: 'output'): { firstFrame: number | null; base64: string } } | null;
      player: { getOperations(): { kind: string; atMs: number }[] };
      clockMap(): { epochAtGraphZeroMs: number };
      describeReplay(atMs: number): ProofBoard;
    };
    holdLessonFrame?(held: { atMs: number; source: 'live' | 'replay' } | null): void;
  }
}
