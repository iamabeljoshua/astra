/// <reference lib="dom" />
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium, type Page } from 'playwright';
import { type LessonName, LESSONS } from '../lesson.ts';
import { AGENT_ROOT, delay, LIVEKIT_URL, REPO_ROOT, startLabStack, WEB_URL } from './lab-stack.ts';
import type { FrameWatch } from './math-page-checks.ts';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '/tmp/m3-3-proof' },
    only: { type: 'string' },
  },
});

declare global {
  interface Window {
    holdBoardFrame?(frame: { atMs: number; source: 'live' | 'replay' } | null): void;
    mathChecks: typeof import('./math-page-checks.ts');
  }
}

const CHECKS_PATH = `/@fs${REPO_ROOT}/apps/agent/src/lab/proof/math-page-checks.ts`;

const lessonBeats = (lesson: LessonName) => LESSONS[lesson][0]?.length ?? 0;

const VIEWPORTS = { laptop: { width: 1366, height: 800 }, phone: { width: 390, height: 844 } } as const;

type ViewportName = keyof typeof VIEWPORTS;
type Theme = 'light' | 'dark';

interface LabPage {
  page: Page;
  folder: string;
  command(command: object): Promise<void>;
  waitForPlayedBeats(count: number, limitMs?: number): Promise<void>;
  finish(): Promise<void>;
}

function startAgent(room: string, folder: string): Promise<{ child: ChildProcess; openUrl: string }> {
  const flags = ['src/lab/start-lab.ts', '--room', room, '--url', LIVEKIT_URL, '--webUrl', WEB_URL, '--out', folder, '--fake'];
  const child = spawn(process.execPath, flags, { cwd: AGENT_ROOT, stdio: ['ignore', 'pipe', openSync(join(folder, 'agent.log'), 'a')] });
  process.once('exit', () => child.kill());
  return new Promise((resolve, reject) => {
    child.stdout?.on('data', (data: Buffer) => {
      const match = /OPEN (\S+)/.exec(data.toString());
      if (match?.[1]) resolve({ child, openUrl: match[1] });
    });
    child.on('exit', (code) => reject(new Error(`the lab agent exited with ${code}`)));
  });
}

interface OpenOptions {
  browser: Browser;
  name: string;
  lesson: LessonName;
  viewport: ViewportName;
  theme: Theme;
  isReducedMotion?: boolean;
  prepare?(page: Page): Promise<void>;
}

async function openLab({ browser, name, lesson, viewport, theme, isReducedMotion, prepare }: OpenOptions): Promise<LabPage> {
  const folder = join(args.out as string, name);
  mkdirSync(folder, { recursive: true });
  const { child, openUrl } = await startAgent(`math-${name}-${Date.now()}`, folder);
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], reducedMotion: isReducedMotion ? 'reduce' : 'no-preference' });
  await context.addInitScript((chosen) => localStorage.setItem('theme', chosen), theme);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(name, 'page error', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(name, 'console error', message.text());
  });
  await prepare?.(page);
  await page.goto(`${openUrl}&lesson=${lesson}`);
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('button', { name: 'Play the lesson' }).and(page.locator(':enabled')).waitFor({ timeout: 30_000 });
  await page.evaluate(async (path) => {
    window.mathChecks = (await import(/* @vite-ignore */ path)) as typeof window.mathChecks;
  }, CHECKS_PATH);
  return {
    page,
    folder,
    command: (command) => page.evaluate((labCommand) => window.sceneLab?.command(labCommand), command),
    waitForPlayedBeats: async (count, limitMs = 90_000) => {
      await page.waitForFunction((expected) => (window.sceneLab?.records.browserMessages.filter((message) => message.type === 'played').length ?? 0) >= expected, count, { timeout: limitMs });
    },
    async finish() {
      await page.evaluate(() => window.sceneLab?.command({ type: 'finish' }));
      await new Promise((done) => child.once('exit', done));
      await context.close();
    },
  };
}

const HIDE_DEV_BUTTON = '.tsqd-parent-container { display: none !important; }';
const DRAWING_PATH = `/@fs${REPO_ROOT}/packages/board/src/drawing.ts`;
const REFUSED_BY_KATEX = ['x^2^3', String.raw`\frac{1}`];
const BOARD_SELECTOR = '[data-testid="board"]';
const QUIET_MS = 3000;
const REST_AFTER_LAST_MS = 4000;
const INTERRUPT_INTO_MOVE_MS = 450;

const FULL_COMBINATIONS = (['laptop', 'phone'] as const).flatMap((viewport) => (['light', 'dark'] as const).map((theme) => ({ viewport, theme })));

function holdFrame(lab: LabPage, frame: { atMs: number; source: 'live' | 'replay' } | null): Promise<void> {
  return lab.page.evaluate((held) => window.holdBoardFrame?.(held), frame);
}

async function shoot(lab: LabPage, name: string): Promise<Buffer> {
  await delay(60);
  return lab.page.locator(BOARD_SELECTOR).screenshot({ path: join(lab.folder, `${name}.png`) });
}

async function getCommandTimes(lab: LabPage): Promise<number[]> {
  return lab.page.evaluate(() => window.sceneLab?.player.getOperations().filter((operation) => operation.kind === 'command').map((operation) => operation.atMs) ?? []);
}

/** Each equation at each rest in the lesson, against plain KaTeX of the same source, by position and by bytes. */
async function checkRestsAgainstPlainKatex(lab: LabPage): Promise<{ rests: number; equations: number; glyphsChecked: number; worstOffset: number; differingImages: string[]; motionLeft: number; shown: string[] }> {
  const times = await getCommandTimes(lab);
  const rests = [...times.slice(1).map((atMs) => atMs - 20), (times.at(-1) ?? 0) + REST_AFTER_LAST_MS];
  const result = { rests: rests.length, equations: 0, glyphsChecked: 0, worstOffset: 0, differingImages: [] as string[], motionLeft: 0, shown: [] as string[] };
  const seen = new Set<string>();
  for (const atMs of rests) {
    await holdFrame(lab, { atMs, source: 'live' });
    await delay(80);
    const shots = await lab.page.evaluate(([path, heldMs]) => window.mathChecks.compareEquationsWithPlainKatex(path, heldMs), [DRAWING_PATH, atMs] as const);
    for (const shot of shots) {
      result.equations += 1;
      result.glyphsChecked += shot.glyphs.length;
      result.worstOffset = Math.max(result.worstOffset, shot.worstGlyphOffset);
      if (shot.hasMotionLeft) result.motionLeft += 1;
      const key = `${shot.id}|${shot.tex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.shown.push(shot.tex);
      const asShown = await lab.page.screenshot({ clip: shot.clip });
      await lab.page.evaluate(([path, id]) => window.mathChecks.swapInPlainKatex(path, id, true), [DRAWING_PATH, shot.id] as const);
      await delay(30);
      const asPlain = await lab.page.screenshot({ clip: shot.clip });
      await lab.page.evaluate(([path, id]) => window.mathChecks.swapInPlainKatex(path, id, false), [DRAWING_PATH, shot.id] as const);
      if (!asShown.equals(asPlain)) result.differingImages.push(shot.tex);
    }
  }
  await holdFrame(lab, null);
  return result;
}

/** The same moments from the live board and from the log, by bytes, including moments in the middle of a move. */
async function checkReplayPixels(lab: LabPage): Promise<{ moments: number; differing: number[]; describedDifferently: number }> {
  const times = await getCommandTimes(lab);
  const { shiftMs, firstLive } = await lab.page.evaluate(() => {
    const operations = window.sceneLab?.player.getOperations() ?? [];
    const liveStart = operations.find((operation) => operation.kind === 'beatStarted')?.atMs ?? 0;
    const logStart = (window.sceneLab?.records.log[0] as { atMs: number } | undefined)?.atMs ?? 0;
    return { shiftMs: logStart - liveStart, firstLive: liveStart };
  });
  const moments = times.flatMap((atMs) => [atMs + 30, atMs + 200, atMs + 450, atMs + 800]).filter((atMs) => atMs >= firstLive);
  const differing: number[] = [];
  let describedDifferently = 0;
  for (const atMs of moments) {
    await holdFrame(lab, { atMs, source: 'live' });
    const live = await shoot(lab, 'replay-compare');
    await holdFrame(lab, { atMs: atMs + shiftMs, source: 'replay' });
    const replay = await shoot(lab, 'replay-compare');
    if (!live.equals(replay)) differing.push(Math.round(atMs));
    const isSame = await lab.page.evaluate(([liveMs, replayMs]) => JSON.stringify(window.sceneLab?.describeLive(liveMs as number)) === JSON.stringify(window.sceneLab?.describeReplay(replayMs as number)), [atMs, atMs + shiftMs]);
    if (!isSame) describedDifferently += 1;
  }
  await holdFrame(lab, null);
  return { moments: moments.length, differing, describedDifferently };
}

async function checkStillness(lab: LabPage): Promise<{ writes: number; animations: number; imagesMatch: boolean }> {
  await delay(600);
  const before = await shoot(lab, 'still-start');
  const { writes, animations } = await lab.page.evaluate((ms) => window.mathChecks.countWritesOver(ms), QUIET_MS);
  const after = await shoot(lab, 'still-end');
  return { writes, animations, imagesMatch: before.equals(after) };
}

interface LessonRun {
  lesson: LessonName;
  viewport: ViewportName;
  theme: Theme;
  isReducedMotion?: boolean;
}

function getLabel({ lesson, viewport, theme, isReducedMotion }: LessonRun): string {
  return `${lesson}-${viewport}-${theme}${isReducedMotion ? '-reduced' : ''}`;
}

// Plays a whole lesson on the real page and checks every frame of it, then its rests, its replay, and its stillness.
async function proveLesson(browser: Browser, run: LessonRun) {
  const label = getLabel(run);
  const lab = await openLab({ browser, name: label, ...run });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.page.evaluate((options) => window.mathChecks.startFrameWatch(options), { isReducedMotion: run.isReducedMotion ?? false, refusedTex: REFUSED_BY_KATEX });
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(lessonBeats(run.lesson));
  await delay(1800);
  const frames: FrameWatch = await lab.page.evaluate(() => window.mathChecks.stopFrameWatch());
  await shoot(lab, 'final');
  const still = await checkStillness(lab);
  const rests = await checkRestsAgainstPlainKatex(lab);
  const replay = await checkReplayPixels(lab);
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []);
  const summary = await lab.page.evaluate(() => window.mathChecks.getBoardSummary());
  const colors = await lab.page.evaluate(() => window.mathChecks.getColorsOnBoard());
  await lab.finish();
  return { label, frames, still, rests, replay, refused, summary, colors };
}

// Cuts the tutor off in the middle of a move and proves the frame holds, then resumes and proves the lesson ends where it should.
async function proveFreeze(browser: Browser, run: LessonRun) {
  const label = `${getLabel(run)}-freeze`;
  const lab = await openLab({ browser, name: label, ...run });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.command({ type: 'play', lesson: run.lesson });
  const moveCueIndex = 3;
  await lab.page.waitForFunction((count) => (window.sceneLab?.records.fired.length ?? 0) > count, moveCueIndex, { timeout: 60_000 });
  await delay(INTERRUPT_INTO_MOVE_MS);
  await lab.command({ type: 'interrupt' });
  await lab.page.waitForFunction(() => (window.sceneLab?.records.stops.length ?? 0) > 0, undefined, { timeout: 10_000 });
  const frozenAt = await lab.page.evaluate(() => {
    const lab2 = window.sceneLab;
    const atMs = lab2?.player.getNowMs() ?? 0;
    return lab2?.describeLive(atMs).elements.filter((element) => element.kind === 'writeMath');
  });
  await delay(150);
  const first = await shoot(lab, 'frozen-first');
  const writes = await lab.page.evaluate((ms) => window.mathChecks.countWritesOver(ms), 1500);
  const later = await shoot(lab, 'frozen-later');
  await lab.command({ type: 'resume' });
  await lab.page.waitForFunction((count) => (window.sceneLab?.records.turnsSent.length ?? 0) >= count, 2, { timeout: 60_000 });
  await delay(2500);
  await shoot(lab, 'after-resume');
  const finalEquation = await lab.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-tex]')].map((host) => host.dataset.tex));
  const log = await lab.page.evaluate(() => (window.sceneLab?.records.log as { kind: string; ending?: string; frozen?: unknown[] }[]).filter((event) => event.kind === 'beatPlayed').map(({ ending, frozen }) => ({ ending, frozen })));
  await lab.finish();
  return { label, frozenAt, framesIdentical: first.equals(later), ...writes, finalEquation, cutReport: log.find((event) => event.ending === 'interrupted') };
}

const FONT_DELAY_MS = 2500;

// Holds every math font back and starts at once, so a frame with a wrong glyph would have nowhere to hide.
async function proveLateFonts(browser: Browser, run: LessonRun) {
  const label = `${getLabel(run)}-late-fonts`;
  const lab = await openLab({
    browser,
    name: label,
    ...run,
    prepare: async (page) => {
      await page.route('**/KaTeX_*', async (route) => {
        await delay(FONT_DELAY_MS);
        await route.continue();
      });
    },
  });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.page.evaluate((options) => window.mathChecks.startFrameWatch(options), { isReducedMotion: false, refusedTex: REFUSED_BY_KATEX });
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(lessonBeats(run.lesson));
  await delay(1500);
  const frames: FrameWatch = await lab.page.evaluate(() => window.mathChecks.stopFrameWatch());
  await shoot(lab, 'final');
  const rests = await checkRestsAgainstPlainKatex(lab);
  await lab.finish();
  return { label, frames, rests };
}

const REFUSED_COMMANDS: { name: string; command: unknown }[] = [
  { name: 'a macro bomb', command: { kind: 'writeMath', id: 'bomb', tex: String.raw`\def\a{\a\a}\a` } },
  { name: 'a huge rule', command: { kind: 'writeMath', id: 'rule', tex: String.raw`\rule{100000em}{100000em}` } },
  { name: 'a link', command: { kind: 'writeMath', id: 'link', tex: String.raw`\href{javascript:window.pwned=1}{x}` } },
  { name: 'raw attributes', command: { kind: 'writeMath', id: 'raw', tex: String.raw`\htmlData{onclick=window.pwned=1}{x}` } },
  { name: 'a color', command: { kind: 'writeMath', id: 'color', tex: String.raw`\textcolor{white}{x}` } },
  { name: 'a pixel position', command: { kind: 'writeMath', id: 'pixel', tex: 'x', x: 900, y: 900 } },
  { name: 'a poisoned id', command: { kind: 'writeMath', id: '__proto__', tex: 'x' } },
  { name: 'a poisoned target', command: { kind: 'highlight', id: 'h', target: 'constructor' } },
  { name: 'too much math', command: { kind: 'writeMath', id: 'long', tex: 'x'.repeat(501) } },
  { name: 'a form feed from an unescaped frac', command: { kind: 'writeMath', id: 'feed', tex: '\frac{1}{2}' } },
  { name: 'math nested too deep', command: { kind: 'writeMath', id: 'deep', tex: `${String.raw`\sqrt{`.repeat(13)}x${'}'.repeat(13)}` } },
  { name: 'a comment that hides math', command: { kind: 'writeMath', id: 'comment', tex: 'x % y' } },
  { name: 'text with a bidi override', command: { kind: 'text', id: 'bidi', text: 'a‮b' } },
];

// Sends what a bad model could write through the real channel, then plays what the parser lets through.
async function proveHostile(browser: Browser, run: LessonRun) {
  const label = `${getLabel(run)}-hostile`;
  const lab = await openLab({ browser, name: label, ...run, lesson: 'hostile' });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.page.evaluate((options) => window.mathChecks.startFrameWatch(options), { isReducedMotion: false, refusedTex: REFUSED_BY_KATEX });
  await lab.command({ type: 'play', lesson: 'hostile' });
  await lab.page.waitForFunction(() => (window.sceneLab?.records.fired.length ?? 0) > 0, undefined, { timeout: 30_000 });
  const turnId = await lab.page.evaluate(() => window.sceneLab?.records.fired[0]?.turnId);
  await lab.command({ type: 'sendRaw', messages: REFUSED_COMMANDS.map(({ command }) => ({ type: 'cue', turnId, beatId: 'markup', atWord: 1, command })) });
  await lab.waitForPlayedBeats(lessonBeats('hostile'));
  await delay(1500);
  const frames: FrameWatch = await lab.page.evaluate(() => window.mathChecks.stopFrameWatch());
  const clearedAt = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { kind: string; atMs: number; command?: { kind: string } }[]).filter((operation) => operation.command?.kind === 'clearBoard').map((operation) => operation.atMs));
  for (const [index, atMs] of clearedAt.entries()) {
    await holdFrame(lab, { atMs: atMs - 30, source: 'live' });
    await shoot(lab, `hostile-before-clear-${index + 1}`);
  }
  await holdFrame(lab, null);
  await shoot(lab, 'hostile-final');
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []);
  const summary = await lab.page.evaluate(() => window.mathChecks.getBoardSummary());
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  return { label, frames, refused, refusedByParser: refused.filter((problem) => !problem.startsWith('math:')).length, sent: REFUSED_COMMANDS.length, refusedAtRender: refused.filter((problem) => problem.startsWith('math:')), summary, replay };
}

const PROOFS = {
  lessons: async (browser: Browser) => {
    const results = [];
    for (const { viewport, theme } of FULL_COMBINATIONS) for (const lesson of ['algebra', 'dense'] as const) results.push(await proveLesson(browser, { lesson, viewport, theme }));
    return results;
  },
  reduced: async (browser: Browser) => [await proveLesson(browser, { lesson: 'algebra', viewport: 'laptop', theme: 'light', isReducedMotion: true }), await proveLesson(browser, { lesson: 'dense', viewport: 'phone', theme: 'dark', isReducedMotion: true })],
  freeze: async (browser: Browser) => {
    const results = [];
    for (const { viewport, theme } of FULL_COMBINATIONS) results.push(await proveFreeze(browser, { lesson: 'algebra', viewport, theme }));
    return results;
  },
  fonts: async (browser: Browser) => [await proveLateFonts(browser, { lesson: 'rare-fonts', viewport: 'laptop', theme: 'light' }), await proveLateFonts(browser, { lesson: 'algebra', viewport: 'phone', theme: 'dark' })],
  hostile: async (browser: Browser) => [await proveHostile(browser, { lesson: 'hostile', viewport: 'laptop', theme: 'light' }), await proveHostile(browser, { lesson: 'hostile', viewport: 'phone', theme: 'dark' })],
} as const;

mkdirSync(args.out as string, { recursive: true });
const stack = await startLabStack();
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain', '--mute-audio'] });
try {
  for (const name of (args.only ?? Object.keys(PROOFS).join(',')).split(',')) {
    const results = await PROOFS[name as keyof typeof PROOFS](browser);
    writeFileSync(join(args.out as string, `${name}.json`), `${JSON.stringify(results, null, 1)}\n`);
    console.log(name, JSON.stringify(results).slice(0, 4000));
  }
} finally {
  await browser.close();
  stack.stop();
}
process.exit(0);
