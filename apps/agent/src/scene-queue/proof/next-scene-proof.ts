/// <reference lib="dom" />
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';

const { values: args } = parseArgs({
  options: {
    web: { type: 'string' },
    out: { type: 'string' },
    trace: { type: 'string' },
    ask: { type: 'string' },
    says: { type: 'string', default: "I think I follow.|Okay, makes sense. What's the next idea?|Got it, keep going with the next idea.|Okay. What comes after that?|Right. Next idea please." },
    /** One event at a given landing or line: `reload@1`, `skip@1`, `switch@2:Teach me how logarithms work`. */
    event: { type: 'string' },
    seconds: { type: 'string', default: '180' },
    scenes: { type: 'string', default: '2' },
  },
});
if (!args.web || !args.out || !args.trace || !args.ask) throw new Error('Give --web, --out, --trace, and --ask.');

const FLAGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-mock-keychain', '--autoplay-policy=no-user-gesture-required'];
const QUIET_MS = 7000;
const POLL_MS = 80;
const FADE_IN_MS = 1800;
const SKIP_SETTLE_MS = 2500;
const OUT = args.out;
const TRACE = args.trace;
const SAYS = (args.says ?? '').split('|');
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });

interface FiredCue {
  atWord: number;
  positionMs: number;
  wordStartMs: number;
  firedEpochMs: number;
}

interface Seen {
  sceneId: string;
  atWallMs: number;
  caption: string;
  cue: FiredCue | null;
}

const readPage = (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('[data-testid="board-visual"] [data-testid="scene-layer"]');
    const view = (window as unknown as { astraVoice?: { getView(): { isTutorSpeaking: boolean; isThinking: boolean } } }).astraVoice?.getView();
    return {
      sceneId: layer && Number(layer.style.opacity || 0) > 0 ? (layer.dataset.scene ?? null) : null,
      seconds: layer?.dataset.seconds ? Number(layer.dataset.seconds) : null,
      caption: document.querySelector('[data-testid="tutor-caption"]')?.textContent?.trim() ?? '',
      isBusy: (view?.isTutorSpeaking ?? false) || (view?.isThinking ?? false),
    };
  });

function readTrace(startedAtWallMs: number) {
  const lines = readdirSync(TRACE)
    .filter((name) => name.endsWith('.jsonl') && statSync(join(TRACE, name)).mtimeMs >= startedAtWallMs)
    .map((name) => readFileSync(join(TRACE, name), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { name: string; atMs: number; wallMs?: number; text?: string } & Record<string, unknown>))
    .filter((file) => (file[0]?.atMs ?? 0) >= startedAtWallMs);
  return lines.flat();
}

const browser = await chromium.launch({ headless: true, args: FLAGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: args.web, colorScheme: 'light' });
const page = await context.newPage();
const problems: string[] = [];
page.on('pageerror', (error) => problems.push(error.message));
await page.goto('/');
await page.getByRole('button', { name: 'Development sign-in' }).click();
await page.getByRole('button', { name: 'maya@astra.test' }).click();
await page.getByRole('textbox', { name: 'What do you want to learn next' }).waitFor({ timeout: 60_000 });
await delay(1500);

const startedAtWallMs = Date.now();
await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill(args.ask);
await page.getByRole('button', { name: 'Start session' }).click();
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);

const [eventKind, eventRest] = (args.event ?? '').split('@');
const [eventAt, eventWords] = (eventRest ?? '').split(':');
let hasDoneEvent = !args.event;
const seen: Seen[] = [];
const said: { atS: number; words: string }[] = [];
const captions: string[] = [];
let quietSinceMs = Date.now();
let hasSpoken = false;
let saysIndex = 0;
let afterLanding = 0;
const targetScenes = Number(args.scenes);
const limitAtMs = Date.now() + Number(args.seconds) * 1000;

const sendLine = async (words: string) => {
  const box = page.getByRole('textbox').first();
  if (await box.isDisabled()) {
    problems.push(`the reply box was closed before: ${words}`);
    quietSinceMs = Date.now();
    return;
  }
  await box.fill(words);
  await box.press('Enter');
  said.push({ atS: Math.round((Date.now() - startedAtWallMs) / 100) / 10, words });
  quietSinceMs = Date.now();
};

const reloadPage = async () => {
  await page.screenshot({ path: join(OUT, 'before-reload.png') });
  await page.reload();
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="tutor-caption"]')), undefined, { timeout: 30_000 }).catch(() => problems.push('no caption after the reload'));
  said.push({ atS: Math.round((Date.now() - startedAtWallMs) / 100) / 10, words: '(reloaded the page)' });
};

while (Date.now() < limitAtMs) {
  const read = await readPage(page).catch(() => null);
  await delay(POLL_MS);
  if (!read) continue;
  if (read.caption && captions.at(-1) !== read.caption) captions.push(read.caption);
  if (read.sceneId && !seen.some((one) => one.sceneId === read.sceneId)) {
    const atWallMs = Date.now();
    const cue = await page.evaluate(() => (window as unknown as { astraVoice?: { records: { fired: FiredCue[] } } }).astraVoice?.records.fired.filter((one) => one.atWord === 0).at(-1) ?? null).catch(() => null);
    seen.push({ sceneId: read.sceneId, atWallMs, caption: read.caption, cue });
    afterLanding = 0;
    await delay(FADE_IN_MS);
    await page.screenshot({ path: join(OUT, `scene-${seen.length}-landed.png`) });
    if (eventKind === 'skip' && Number(eventAt) === seen.length && !hasDoneEvent) {
      hasDoneEvent = true;
      await delay(SKIP_SETTLE_MS);
      await sendLine('skip that');
      await delay(SKIP_SETTLE_MS);
      await page.screenshot({ path: join(OUT, 'after-skip.png') });
    }
    if (eventKind === 'reload' && Number(eventAt) === seen.length && !hasDoneEvent) {
      hasDoneEvent = true;
      await delay(SKIP_SETTLE_MS);
      await reloadPage();
      await delay(1500);
      await page.screenshot({ path: join(OUT, 'after-reload.png') });
    }
  }
  if (read.isBusy) {
    hasSpoken = true;
    quietSinceMs = Date.now();
    continue;
  }
  if (!hasSpoken || Date.now() - quietSinceMs < QUIET_MS) continue;
  if (seen.length >= targetScenes && afterLanding >= 1) break;
  if (eventKind === 'switch' && Number(eventAt) === saysIndex && !hasDoneEvent) {
    hasDoneEvent = true;
    await sendLine(eventWords ?? '');
    continue;
  }
  if (eventKind === 'reloadLine' && Number(eventAt) === saysIndex && !hasDoneEvent) {
    hasDoneEvent = true;
    await reloadPage();
    quietSinceMs = Date.now();
    continue;
  }
  await sendLine(SAYS[saysIndex % SAYS.length] ?? '');
  saysIndex += 1;
  afterLanding += 1;
}
await page.screenshot({ path: join(OUT, 'end.png') });
const lastRead = await readPage(page).catch(() => null);
await context.close();
await browser.close();

const trace = readTrace(startedAtWallMs).filter((line) => line.name.startsWith('scene') || line.name === 'turnWritten' || line.name === 'planAnswered' || line.name === 'planFailed' || line.name === 'studentLeft');
const sliceStart = trace.findIndex((line) => line.wallMs !== undefined);
const cues = trace.filter((line) => line.name === 'sceneCue');
const readies = trace.filter((line) => line.name === 'sceneAhead' && line.state === 'ready');
const landings = seen.map((one) => {
  const cue = cues.filter((line) => (line.wallMs ?? 0) <= one.atWallMs).at(-1) ?? null;
  const ready = cue ? readies.filter((line) => line.text?.toLowerCase() === cue.text?.toLowerCase()).at(-1) ?? null : null;
  return {
    sceneId: one.sceneId,
    atS: (one.atWallMs - startedAtWallMs) / 1000,
    cueToSeenS: cue?.wallMs ? (one.atWallMs - cue.wallMs) / 1000 : null,
    readyBeforeCueS: ready?.wallMs && cue?.wallMs ? (cue.wallMs - ready.wallMs) / 1000 : null,
    source: cue?.source ?? null,
    wordLagMs: one.cue ? Math.round(one.cue.positionMs - one.cue.wordStartMs) : null,
    seenAfterCueFiredMs: one.cue ? one.atWallMs - Math.round(one.cue.firedEpochMs) : null,
    topic: cue?.text ?? null,
    caption: one.caption.slice(0, 120),
  };
});
const turns = trace.filter((line) => line.name === 'turnWritten');
const median = (values: number[]) => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)] ?? null;
const summary = {
  ask: args.ask,
  event: args.event ?? null,
  load: loadavg().map((value) => Math.round(value)),
  landings,
  neverSeen: cues.filter((cue) => !landings.some((landing) => landing.topic === cue.text)).map((cue) => cue.text),
  ended: trace.filter((line) => line.name === 'sceneEnded').map((line) => line.how),
  refused: trace.filter((line) => line.name === 'sceneAheadRefused').map((line) => line.refusal),
  started: trace.filter((line) => line.name === 'sceneAheadStarted').map((line) => ({ text: line.text, source: line.source, stepIndex: line.stepIndex })),
  firstTextMedianMs: median(turns.map((turn) => Number(turn.firstTextMs ?? 0)).filter(Boolean)),
  firstBeatMedianMs: median(turns.map((turn) => Number(turn.firstBeatMs ?? 0)).filter(Boolean)),
  turnCount: turns.length,
  said,
  captions: captions.slice(-60),
  sceneAtEnd: lastRead?.sceneId ?? null,
  problems,
  sliceStart,
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
writeFileSync(join(OUT, 'trace.json'), JSON.stringify(trace, null, 1));
console.log(JSON.stringify({ ...summary, captions: summary.captions.length }, null, 1));
