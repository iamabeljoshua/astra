import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';

const { values: args } = parseArgs({ options: { web: { type: 'string' }, plan: { type: 'string' }, out: { type: 'string' }, trace: { type: 'string' }, waitS: { type: 'string', default: '45' }, noWebgl: { type: 'boolean', default: false } } });
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const POLL_MS = 150;
const AFTER_LANDING_S = 26;
const TRACED = new Set(['sceneAskFromLine', 'sceneAsked', 'sceneCue', 'recipeWritten', 'sceneMatched', 'sceneMatchFailed', 'sceneRouted', 'freshStarted', 'freshWritten', 'scenePageHas', 'freshOnPage', 'sceneEnded', 'recipeReviewed', 'recipeNoPicture', 'sceneOffTopic', 'sceneAskPassed']);

/** One lesson: `ask` starts it from Home, and `say`, when given, is typed once the tutor has started talking, and is what the clock runs from. */
interface PlannedLesson {
  name: string;
  ask: string;
  say?: string;
  sayAfterS?: number;
}

const readPage = (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('[data-testid="board-visual"] [data-testid="scene-layer"]');
    const stage = document.querySelector<HTMLElement>('[data-engine]');
    return {
      caption: document.querySelector('[data-testid="tutor-caption"]')?.textContent?.trim() ?? '',
      sceneId: layer?.dataset.scene ?? null,
      sceneSeconds: layer?.dataset.seconds ? Number(layer.dataset.seconds) : null,
      opacity: layer ? Number(layer.style.opacity || 0) : 0,
      engine: stage?.dataset.engine ?? null,
      problem: document.querySelector<HTMLElement>('[data-kit-problem]')?.dataset.kitProblem ?? null,
    };
  });

function readTrace(startedAtWallMs: number) {
  const folder = args.trace as string;
  return readdirSync(folder)
    .map((name) => join(folder, name))
    .filter((path) => path.endsWith('.jsonl') && statSync(path).mtimeMs >= startedAtWallMs)
    .flatMap((path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { name: string; atMs: number } & Record<string, unknown>))
    .filter(({ name }) => TRACED.has(name))
    .map(({ name, afterMs, text, how, isDrawn, isGood, reasons, title, costUsd, problem }) => ({ name, afterMs, text, how, isDrawn, isGood, reasons, title, costUsd, problem }));
}

async function runLesson(page: Page, lesson: PlannedLesson, out: string) {
  mkdirSync(out, { recursive: true });
  const startedAtWallMs = Date.now();
  await page.goto(args.web as string);
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill(lesson.ask);
  await page.getByRole('button', { name: 'Start session' }).click();
  const pressedAt = performance.now();
  const atS = () => Number(((performance.now() - pressedAt) / 1000).toFixed(2));
  const limitS = Number(args.waitS);
  let firstWordsAtS: number | null = null;
  let saidAtS: number | null = null;
  let sceneWhenSaid: string | null = null;
  let pictureAtS: number | null = null;
  let lastCaption = '';
  let lastProblem: string | null = null;
  const lines: { atS: number; seconds: number | null; caption: string; frame: string }[] = [];
  while (atS() < (pictureAtS === null ? limitS : pictureAtS + AFTER_LANDING_S)) {
    const read = await readPage(page);
    if (firstWordsAtS === null && read.caption !== '') firstWordsAtS = atS();
    if (lesson.say && firstWordsAtS !== null && saidAtS === null && atS() >= firstWordsAtS + (lesson.sayAfterS ?? 4)) {
      await page.evaluate((words) => (window as unknown as { astraVoice: { sendTyped(text: string): void } }).astraVoice.sendTyped(words), lesson.say);
      saidAtS = atS();
      sceneWhenSaid = read.sceneId;
    }
    lastProblem = read.problem ?? lastProblem;
    if (read.sceneId && read.sceneId !== sceneWhenSaid && read.opacity > 0.5 && pictureAtS === null && (!lesson.say || saidAtS !== null)) pictureAtS = atS();
    if (pictureAtS !== null && read.caption !== lastCaption && read.caption !== '') {
      lastCaption = read.caption;
      const frame = `frame-${lines.length}.jpg`;
      await page.screenshot({ path: join(out, frame), type: 'jpeg', quality: 70 });
      lines.push({ atS: atS(), seconds: read.sceneSeconds, caption: read.caption, frame });
    }
    await delay(POLL_MS);
  }
  const ending = await readPage(page);
  await page.screenshot({ path: join(out, 'last.jpg'), type: 'jpeg', quality: 70 });
  const summary = { ...lesson, firstWordsAtS, saidAtS, pictureAtS, askToPictureS: pictureAtS === null ? null : Number((pictureAtS - (saidAtS ?? 0)).toFixed(2)), sceneId: ending.sceneId, engine: ending.engine, problem: lastProblem, lines, trace: args.trace ? readTrace(startedAtWallMs) : [] };
  await page.goto('about:blank');
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ name: lesson.name, firstWordsAtS, saidAtS, pictureAtS, askToPictureS: summary.askToPictureS, engine: ending.engine, problem: lastProblem, lines: lines.length }));
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-mock-keychain', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: args.web as string })).newPage();
if (args.noWebgl) await page.addInitScript(() => {
  const real = OffscreenCanvas.prototype.getContext;
  OffscreenCanvas.prototype.getContext = function getContext(this: OffscreenCanvas, kind: string, ...rest: unknown[]) {
    return kind === 'webgl2' || kind === 'webgl' ? null : (real as (...parts: unknown[]) => unknown).call(this, kind, ...rest);
  } as never;
});
await page.goto('/');
await page.getByRole('button', { name: 'Development sign-in' }).click();
await page.getByRole('button', { name: 'maya@astra.test' }).click();
await page.getByRole('textbox', { name: 'What do you want to learn next' }).waitFor();
for (const lesson of JSON.parse(readFileSync(args.plan as string, 'utf8')) as PlannedLesson[]) await runLesson(page, lesson, join(args.out as string, lesson.name));
await browser.close();
