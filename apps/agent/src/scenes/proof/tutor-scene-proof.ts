import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';

const { values: args } = parseArgs({
  options: {
    web: { type: 'string', default: 'http://127.0.0.1:7060' },
    ask: { type: 'string', default: 'What does the slope of a line tell you?' },
    card: { type: 'string' },
    out: { type: 'string', default: '/tmp/tutor-scene-proof' },
    trace: { type: 'string' },
    handsOn: { type: 'string', default: "Okay, let me try one myself. Give me an equation of a line to work on." },
    waitS: { type: 'string', default: '70' },
    headed: { type: 'boolean', default: false },
    noGpu: { type: 'boolean', default: false },
    damageTake: { type: 'boolean', default: false },
    phone: { type: 'boolean', default: false },
    dark: { type: 'boolean', default: false },
    say: { type: 'string' },
    sayAfterS: { type: 'string', default: '3' },
    reloadAfterS: { type: 'string' },
    realChrome: { type: 'boolean', default: true },
    noWebgl: { type: 'boolean', default: false },
    reducedMotion: { type: 'boolean', default: false },
    kitFails: { type: 'boolean', default: false },
    kitSlowMs: { type: 'string' },
    kitStallsAfterFrames: { type: 'string' },
    seekTimes: { type: 'string' },
    replay: { type: 'boolean', default: false },
    replayNoScene: { type: 'boolean', default: false },
  },
});

const FLAGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-mock-keychain', '--mute-audio', '--autoplay-policy=no-user-gesture-required'];
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const out = args.out as string;
mkdirSync(out, { recursive: true });

interface VisualRead {
  caption: string;
  hasVisual: boolean;
  sceneId: string | null;
  sceneSeconds: number | null;
  opacity: number;
  isBig: boolean;
  isSmall: boolean;
  isMoving: boolean;
  isBigOverBoard: boolean;
  rect: { x: number; y: number; width: number; height: number } | null;
  rightRect: { x: number; y: number; width: number; height: number } | null;
  transform: string | null;
  boardOpacity: string | null;
  isSpeaking: boolean;
  isThinking: boolean;
  canvasPixels: number;
}

const readVisual = (page: Page): Promise<VisualRead> =>
  page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('[data-testid="board-visual"]');
    const layer = box?.querySelector<HTMLElement>('[data-testid="scene-layer"]') ?? null;
    const right = document.querySelector<HTMLElement>('[data-testid="board-right"]');
    const toRect = (element: Element | null | undefined) => {
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const canvas = layer?.querySelector('canvas');
    const view = (window as unknown as { astraVoice?: { getView(): { isTutorSpeaking: boolean; isThinking: boolean } } }).astraVoice?.getView();
    return {
      caption: document.querySelector('[data-testid="tutor-caption"]')?.textContent?.trim() ?? '',
      hasVisual: Boolean(box),
      sceneId: layer?.dataset.scene ?? null,
      sceneSeconds: layer?.dataset.seconds ? Number(layer.dataset.seconds) : null,
      opacity: layer ? Number(layer.style.opacity || 0) : 0,
      isBig: box?.dataset.big === 'true',
      isSmall: box?.dataset.small === 'true',
      isMoving: box?.dataset.moving === 'true',
      isBigOverBoard: box?.dataset.bigOverBoard === 'true',
      rect: toRect(box),
      rightRect: toRect(right),
      transform: box?.style.transform ?? null,
      boardOpacity: box?.nextElementSibling instanceof HTMLElement ? box.nextElementSibling.style.opacity : null,
      isSpeaking: view?.isTutorSpeaking ?? false,
      isThinking: view?.isThinking ?? false,
      canvasPixels: canvas ? canvas.width * canvas.height : 0,
    };
  });

// A trace folder outlives a proof, and only this run's job belongs in its summary.
const proofStartedAtWallMs = Date.now();

function readTrace(folder: string | undefined) {
  if (!folder) return [];
  return readdirSync(folder)
    .map((name) => join(folder, name))
    .filter((path) => path.endsWith('.jsonl') && statSync(path).mtimeMs >= proofStartedAtWallMs)
    .sort()
    .flatMap((path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { name: string; atMs: number } & Record<string, unknown>));
}

// The headless shell keeps a sandboxed frame in the page's own process, and real Chrome does not, so a stall means nothing on the shell.
const browser = await chromium.launch({ ...(args.realChrome ? { channel: 'chrome' } : {}), headless: !args.headed, args: [...FLAGS, ...(args.noWebgl ? ['--disable-webgl', '--disable-webgl2'] : [])] });
const context = await browser.newContext({ viewport: args.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, colorScheme: 'light', baseURL: args.web as string, ...(args.reducedMotion ? { reducedMotion: 'reduce' as const } : {}) });
const page = await context.newPage();
const problems: string[] = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
// LiveKit logs its own closing channels as errors when the proof leaves the room.
page.on('console', (message) => {
  if (message.type() === 'error' && !/data channel|DataChannel/.test(message.text())) problems.push(`console: ${message.text().slice(0, 300)}`);
});
if (args.noGpu) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }));
if (args.damageTake) await page.route('**/api/scene-takes/**', (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(Array.from({ length: 4096 }, (_, index) => (index * 37) % 256)) }));

await page.addInitScript(() => {
  if (window.top !== window) return;
  const samples: unknown[][] = [];
  (window as unknown as { kitSamples: unknown[][] }).kitSamples = samples;
  let drawnSeconds: number | null = null;
  addEventListener('message', (event) => {
    const shown = [...document.querySelectorAll('iframe')].find((frame) => getComputedStyle(frame).visibility === 'visible');
    if ((event.data as { type?: string } | null)?.type === 'drawn' && event.source === shown?.contentWindow) drawnSeconds = (event.data as { seconds: number }).seconds;
  });
  const sample = () => {
    const seconds = document.querySelector<HTMLElement>('[data-testid="scene-layer"]')?.dataset.seconds;
    if (seconds !== undefined) {
      const view = (window as unknown as { astraVoice?: { getView(): { tutorHeard: { text: string }[] | string } } }).astraVoice?.getView();
      const heard = view ? JSON.stringify(view.tutorHeard).slice(-60) : '';
      samples.push([performance.now(), Number(seconds), drawnSeconds, heard, document.querySelector<HTMLElement>('[data-engine]')?.dataset.engine ?? null, document.querySelector<HTMLElement>('[data-testid="scene-take"]') ? true : false]);
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
if (args.kitFails) await page.route('**/api/scene-takes/*/kit', (route) => route.fulfill({ status: 500, body: '{}' }));
if (args.kitSlowMs) {
  await page.route('**/scene-kit/*/kit.js', async (route) => {
    await delay(Number(args.kitSlowMs));
    await route.continue();
  });
}
if (args.kitStallsAfterFrames) {
  await page.route('**/api/scene-takes/*/kit', async (route) => {
    const reply = await route.fetch();
    const take = (await reply.json()) as { code: string };
    const spin = `window.kitFrames = (window.kitFrames || 0) + 1; if (window.kitFrames > ${Number(args.kitStallsAfterFrames)}) /(a+)+$/.test('a'.repeat(40) + 'b');`;
    await route.fulfill({ response: reply, json: { ...take, code: take.code.replace(/render\(t\) \{/, `render(t) { ${spin}`) } });
  });
}

await page.goto('/');
await page.getByRole('button', { name: 'Development sign-in' }).click();
await page.getByRole('button', { name: 'maya@astra.test' }).click();
await page.getByRole('textbox', { name: 'What do you want to learn next' }).waitFor();
await delay(1500);

const startedAt = performance.now();
const atS = () => Number(((performance.now() - startedAt) / 1000).toFixed(2));
if (args.card) {
  await page.getByRole('button', { name: new RegExp(args.card) }).first().click();
} else {
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill(args.ask as string);
  await page.getByRole('button', { name: 'Start session' }).click();
}
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
if (args.dark) await page.getByRole('button', { name: 'Dark' }).click();

const timeline: (VisualRead & { atS: number })[] = [];
let firstWordsAtS: number | null = null;
let sceneSeenAtS: number | null = null;
let sceneAtStart: VisualRead | null = null;
let quietSinceS: number | null = null;
let hasSaid = false;
let hasShotDrawing = false;
let saidAtS: number | null = null;
let hasReloaded = false;
let reloadedAtS: number | null = null;
const waitLimitS = Number(args.waitS);
while (atS() < waitLimitS) {
  const read = await readVisual(page);
  timeline.push({ ...read, atS: atS() });
  if (firstWordsAtS === null && read.caption !== '') firstWordsAtS = atS();
  if (firstWordsAtS !== null && !hasSaid && args.say && atS() >= firstWordsAtS + Number(args.sayAfterS)) {
    hasSaid = true;
    saidAtS = atS();
    await page.evaluate((words) => (window as unknown as { astraVoice: { sendTyped(text: string): void } }).astraVoice.sendTyped(words), args.say);
  }
  if (firstWordsAtS !== null && !hasReloaded && args.reloadAfterS && atS() >= firstWordsAtS + Number(args.reloadAfterS)) {
    hasReloaded = true;
    reloadedAtS = atS();
    await page.reload();
  }
  if (sceneSeenAtS === null && read.sceneId && read.opacity > 0) {
    sceneSeenAtS = atS();
    sceneAtStart = read;
    await page.screenshot({ path: join(out, 'scene-landed.png') });
  }
  if (sceneSeenAtS !== null && !hasShotDrawing && atS() >= sceneSeenAtS + 1.2) {
    hasShotDrawing = true;
    await page.screenshot({ path: join(out, 'scene-after-1s.png') });
  }
  quietSinceS = read.isSpeaking || read.isThinking ? null : (quietSinceS ?? atS());
  if (sceneSeenAtS !== null && quietSinceS !== null && atS() > quietSinceS + 2.5 && (reloadedAtS === null || atS() > reloadedAtS + 15)) break;
  await delay(100);
}
await page.screenshot({ path: join(out, sceneSeenAtS === null ? 'no-scene.png' : 'scene-played.png') });

async function readSeekPoints() {
  return page.evaluate(
    (times) =>
      new Promise((resolve) => {
        const frame = [...document.querySelectorAll('iframe')].find((candidate) => getComputedStyle(candidate).visibility === 'visible');
        if (!frame?.contentWindow) return resolve({ noFrame: true });
        const limit = setTimeout(() => resolve({ timedOut: true }), 30_000);
        addEventListener('message', function onReply(event) {
          const reply = event.data as { type?: string; result?: { samples: { t: number; hash: number; lit: number; std: number }[]; deterministic: boolean; mismatches: number[] }; error?: string };
          if (event.source !== frame.contentWindow || reply.type !== 'gate') return;
          clearTimeout(limit);
          removeEventListener('message', onReply);
          resolve({ hashes: reply.result?.samples.map(({ t, hash, lit, std }) => ({ t, hash, lit, std })), isSameBackwards: reply.result?.deterministic, mismatches: reply.result?.mismatches, error: reply.error });
        });
        frame.contentWindow.postMessage({ type: 'gate', times }, '*');
      }),
    (args.seekTimes as string).split(',').map(Number),
  );
}

async function readKitClock() {
  const samples = await page.evaluate(() => (window as unknown as { kitSamples: unknown[][] }).kitSamples);
  const rows = samples as [number, number, number | null, string, string | null][];
  const engines = [...new Set(rows.map(([, , , , engine]) => engine))];
  const lags = rows.filter(([, seconds, drawn]) => drawn !== null && seconds > 0).map(([, seconds, drawn]) => Math.abs(seconds - (drawn as number)) * 1000).sort((first, second) => first - second);
  const isHeldAt = (moment: number) => rows.find(([, seconds]) => seconds >= moment - 0.001);
  const pageGapsMs = rows.slice(1).map(([atMs], index) => atMs - (rows[index]?.[0] ?? atMs));
  return { rows: rows.length, largestPageGapMs: Math.round(Math.max(...pageGapsMs)), engines, drawnLagMsP50: Math.round(lags[Math.floor(lags.length * 0.5)] ?? -1), drawnLagMsP95: Math.round(lags[Math.floor(lags.length * 0.95)] ?? -1), firstAndLast: [rows[0]?.[1], rows.at(-1)?.[1]], getAt: Object.fromEntries((args.seekTimes as string | undefined)?.split(',').map((moment) => [moment, isHeldAt(Number(moment))?.[3]]) ?? []) };
}

const glide: { atS: number; rect: VisualRead['rect']; transform: string | null; boardOpacity: string | null; isMoving: boolean; isSmall: boolean }[] = [];
const summary: Record<string, unknown> = { ask: args.card ?? args.ask, firstWordsAtS, sceneSeenAtS, sceneId: sceneAtStart?.sceneId ?? null, canvasPixels: sceneAtStart?.canvasPixels ?? 0, secondsAtEnd: timeline.at(-1)?.sceneSeconds ?? null, wordsHeard: timeline.at(-1)?.caption ?? '' };

if (args.seekTimes && sceneSeenAtS !== null) summary.kitClock = await readKitClock();
if (args.seekTimes && sceneSeenAtS !== null) {
  summary.seekPoints = await readSeekPoints();
  await page.screenshot({ path: join(out, 'after-seeks.png') });
}
summary.framesWhileLive = await page.evaluate(() => document.querySelectorAll('iframe').length);

if (sceneSeenAtS !== null && args.handsOn) {
  await page.evaluate((words) => (window as unknown as { astraVoice: { sendTyped(text: string): void } }).astraVoice.sendTyped(words), args.handsOn);
  const sentAtS = atS();
  let smallAtS: number | null = null;
  let movedAtS: number | null = null;
  while (atS() < sentAtS + 25) {
    const read = await readVisual(page);
    glide.push({ atS: atS(), rect: read.rect, transform: read.transform, boardOpacity: read.boardOpacity, isMoving: read.isMoving, isSmall: read.isSmall });
    if (movedAtS === null && read.isMoving) {
      movedAtS = atS();
      await page.screenshot({ path: join(out, 'glide-midway.png') });
    }
    if (read.isSmall) {
      smallAtS = atS();
      break;
    }
    await delay(16);
  }
  summary.handsOn = { sentAtS, movedAtS, smallAtS };
  if (smallAtS !== null) {
    await delay(300);
    const small = await readVisual(page);
    await page.screenshot({ path: join(out, 'hands-on.png') });
    summary.whatAPressHits = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main input, main textarea, [data-testid="board-right"] .board-row, [data-testid="board-right"] .board-flow > *')].slice(0, 12).map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        const hit = document.elementFromPoint(x + width / 2, y + height / 2);
        const corner = hit?.closest('[data-testid="board-visual"]');
        return { tag: element.tagName, name: element.getAttribute('aria-label') ?? String(element.className).slice(0, 40), box: [Math.round(x), Math.round(y), Math.round(width), Math.round(height)], isUnderScene: Boolean(corner) };
      }),
    );
    const line = page.locator('[data-testid="board-right"] input, [data-testid="board-right"] textarea, [data-testid="board-right"] [contenteditable="true"]').first();
    if ((await line.count()) > 0 && (await line.isVisible())) {
      await line.click({ timeout: 2000 }).then(() => page.keyboard.type('y = 2x', { delay: 20 })).catch((error: unknown) => problems.push(`typing a line: ${String(error).slice(0, 200)}`));
      summary.typedALine = await line.inputValue().catch(() => line.textContent());
      await page.screenshot({ path: join(out, 'typed-line.png') });
    }
    const share = small.rect && small.rightRect ? small.rect.width / small.rightRect.width : null;
    const insets = small.rect && small.rightRect ? { right: small.rightRect.x + small.rightRect.width - (small.rect.x + small.rect.width), top: small.rect.y - small.rightRect.y } : null;
    summary.smallPlace = { share, insets, boardOpacity: small.boardOpacity, sceneId: small.sceneId, sceneSeconds: small.sceneSeconds };
    await page.locator('[data-testid="board-visual"]').click();
    await delay(800);
    const big = await readVisual(page);
    await page.screenshot({ path: join(out, 'clicked-back.png') });
    summary.clickedBack = { isBig: big.isBig, isBigOverBoard: big.isBigOverBoard, width: big.rect?.width, rightWidth: big.rightRect?.width };
    await page.locator('[data-testid="board-visual"]').click();
    await delay(800);
    const again = await readVisual(page);
    summary.clickedAgain = { isSmall: again.isSmall };
    await page.screenshot({ path: join(out, 'back-in-corner.png') });
  }
}

const sessionPath = new URL(page.url()).pathname;
await page.getByRole('button', { name: 'End session' }).click();
await delay(5000);
summary.framesDuringRecap = await page.evaluate(() => document.querySelectorAll('iframe').length);
await page.screenshot({ path: join(out, 'recap.png') });
await page.goto('/sessions');
await delay(1500);
summary.framesAfterLeaving = await page.evaluate(() => document.querySelectorAll('iframe').length);

async function watchReplay() {
  if (args.replayNoScene) {
    await page.route('**/api/scene-takes/**', (route) => route.fulfill({ status: 404, body: '{}' }));
    await page.route('**/api/sessions/*', async (route) => {
      const reply = await route.fetch();
      await route.fulfill({ response: reply, json: { ...((await reply.json()) as object), artwork: null } });
    });
  }
  await page.goto(sessionPath);
  await page.locator('[data-testid="replay-transport"]').waitFor({ timeout: 45_000 });
  const seek = page.getByRole('slider', { name: 'Lesson timeline' });
  const durationMs = Number(await seek.getAttribute('max'));
  const points: Record<string, unknown>[] = [];
  for (const share of [1, 0.05, 0.25, 0.5, 0.75, 1]) {
    await seek.fill(String(Math.round(durationMs * share)));
    await delay(3500);
    const shotName = `replay-${String(points.length)}-${Math.round(share * 100)}.png`;
    await page.screenshot({ path: join(out, shotName) });
    points.push({
      share,
      shotName,
      ...(await page.evaluate(() => {
        const layer = document.querySelector<HTMLElement>('[data-testid="scene-layer"]');
        return { sceneSeconds: layer?.dataset.seconds ?? null, engine: document.querySelector<HTMLElement>('[data-engine]')?.dataset.engine ?? null, frames: document.querySelectorAll('iframe').length, emptyNote: document.querySelector('[data-testid="board-empty"]')?.textContent ?? null, hasPicture: Boolean(document.querySelector('[data-testid="board-visual"] img, [data-testid="board-visual"] svg')) };
      })),
    });
  }
  summary.replay = { durationMs, points };
}
if (args.replay) await watchReplay().catch((error: unknown) => problems.push(`replay: ${String(error).slice(0, 300)}`));
await page.close();
let trace = readTrace(args.trace);
for (let tries = 0; tries < 60 && args.trace && !trace.some(({ name }) => name === 'jobClosed'); tries += 1) {
  await delay(500);
  trace = readTrace(args.trace);
}
summary.saidAtS = saidAtS;
summary.reloadedAtS = reloadedAtS;
const logged = (trace.find(({ name }) => name === 'sessionLog')?.events ?? []) as { kind: string; atMs: number; beat?: { id: string; script: (string | { kind: string })[] } }[];
summary.boardMoves = logged.flatMap(({ kind, atMs, beat }) => (kind === 'beatPlayed' && beat ? beat.script.flatMap((part, index) => (typeof part === 'object' && ['boardMode', 'task', 'clearBoard', 'richScene', 'writeMath'].includes(part.kind) ? [{ atS: Number((atMs / 1000).toFixed(1)), beat: beat.id, kind: part.kind, ...(part.kind === 'boardMode' ? { mode: (part as unknown as { mode: string }).mode } : {}), onWord: beat.script.slice(index + 1).find((next) => typeof next === 'string') }] : [])) : []));
const sceneBeatTexts = new Set(logged.flatMap(({ kind, beat }) => (kind === 'beatPlayed' && beat?.id.startsWith('n') ? [beat.script.filter((part): part is string => typeof part === 'string').join('').trim()] : [])));
summary.sceneWordsWithoutPicture = timeline.filter(({ caption, sceneId, opacity }) => [...sceneBeatTexts].some((text) => text !== '' && caption.includes(text)) && (!sceneId || opacity === 0)).length;
summary.sceneBeatsPlayed = [...sceneBeatTexts];
summary.turns = trace.filter(({ name }) => ['turnStarted', 'sceneAsked', 'sceneEnded', 'sceneWordsDropped'].includes(name));
summary.problems = problems;
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(out, 'timeline.json'), JSON.stringify(timeline));
writeFileSync(join(out, 'glide.json'), JSON.stringify(glide));
writeFileSync(join(out, 'trace.json'), JSON.stringify(trace));
console.log(JSON.stringify(summary));
await browser.close();
process.exit(0);
