/// <reference lib="dom" />
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from 'playwright';
import { type LessonName, LESSONS } from '../lesson.ts';
import { BOARD_SELECTOR, checkReplayPixels, checkStillness, getCommandTimes, HIDE_DEV_BUTTON, holdFrame, type LabPage, openLabPage, shoot, type Theme, type ViewportName, VIEWPORTS } from './lab-page.ts';
import { delay, REPO_ROOT, startLabStack } from './lab-stack.ts';
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
  }
}

const CHECKS_PATH = `/@fs${REPO_ROOT}/apps/agent/src/lab/proof/math-page-checks.ts`;

const lessonBeats = (lesson: LessonName) => LESSONS[lesson][0]?.length ?? 0;

const openLab = (options: Omit<Parameters<typeof openLabPage>[0], 'outFolder' | 'checksPath'>) => openLabPage({ ...options, outFolder: args.out as string, checksPath: CHECKS_PATH });

const DRAWING_PATH = `/@fs${REPO_ROOT}/packages/board/src/drawing.ts`;
const REFUSED_BY_KATEX = ['x^2^3', String.raw`\frac{1}`];
const REST_AFTER_LAST_MS = 4000;
const INTERRUPT_INTO_MOVE_MS = 450;

const FULL_COMBINATIONS = (['laptop', 'phone'] as const).flatMap((viewport) => (['light', 'dark'] as const).map((theme) => ({ viewport, theme })));

/** Each equation at each rest in the lesson, against plain KaTeX of the same source, by position and by bytes. */
async function checkRestsAgainstPlainKatex(lab: LabPage): Promise<{ rests: number; equations: number; glyphsChecked: number; worstOffset: number; differingImages: string[]; motionLeft: number; shown: string[] }> {
  const times = await getCommandTimes(lab);
  const rests = [...times.slice(1).map((atMs) => atMs - 20), (times.at(-1) ?? 0) + REST_AFTER_LAST_MS];
  const result = { rests: rests.length, equations: 0, glyphsChecked: 0, worstOffset: 0, differingImages: [] as string[], motionLeft: 0, shown: [] as string[] };
  const seen = new Set<string>();
  for (const atMs of rests) {
    await holdFrame(lab, { atMs, source: 'live' });
    await delay(80);
    const shots = await lab.page.evaluate(([path, heldMs]) => window.pageChecks.compareEquationsWithPlainKatex(path, heldMs), [DRAWING_PATH, atMs] as const);
    for (const shot of shots) {
      result.equations += 1;
      result.glyphsChecked += shot.glyphs.length;
      result.worstOffset = Math.max(result.worstOffset, shot.worstGlyphOffsetPixels);
      if (shot.hasMotionLeft) result.motionLeft += 1;
      const key = `${shot.id}|${shot.tex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.shown.push(shot.tex);
      const asShown = await lab.page.screenshot({ clip: shot.clip });
      await lab.page.evaluate(([path, id]) => window.pageChecks.swapInPlainKatex(path, id, true), [DRAWING_PATH, shot.id] as const);
      await delay(30);
      const asPlain = await lab.page.screenshot({ clip: shot.clip });
      await lab.page.evaluate(([path, id]) => window.pageChecks.swapInPlainKatex(path, id, false), [DRAWING_PATH, shot.id] as const);
      if (!asShown.equals(asPlain)) result.differingImages.push(shot.tex);
    }
  }
  await holdFrame(lab, null);
  return result;
}

const JUMP_THRESHOLD = 24;
const EDGE_MS = 1;

/** A rearrangement must start from what was there and end on what stays, or the student sees a jump. */
async function checkMoveEdges(lab: LabPage): Promise<{ moves: number; pixelsJumpingAtStart: number[]; pixelsJumpingAtEnd: number[] }> {
  const moves = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { atMs: number; overMs?: number | null; command?: { kind: string } }[]).filter((operation) => operation.command?.kind === 'transformMath').map(({ atMs, overMs }) => ({ atMs, overMs: overMs ?? 800 })));
  const shotAt = async (atMs: number) => {
    await holdFrame(lab, { atMs, source: 'live' });
    return (await shoot(lab, 'edge-compare')).toString('base64');
  };
  const compare = async (first: number, second: number) => lab.page.evaluate((pair) => window.pageChecks.countDifferentPixels(pair), [await shotAt(first), await shotAt(second), JUMP_THRESHOLD] as [string, string, number]);
  const pixelsJumpingAtStart: number[] = [];
  const pixelsJumpingAtEnd: number[] = [];
  for (const { atMs, overMs } of moves) {
    pixelsJumpingAtStart.push(await compare(atMs - EDGE_MS, atMs + EDGE_MS));
    pixelsJumpingAtEnd.push(await compare(atMs + overMs - EDGE_MS, atMs + overMs + EDGE_MS));
  }
  await holdFrame(lab, null);
  return { moves: moves.length, pixelsJumpingAtStart, pixelsJumpingAtEnd };
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

async function proveLesson(browser: Browser, run: LessonRun) {
  const label = getLabel(run);
  const lab = await openLab({ browser, name: label, ...run });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.page.evaluate((options) => window.pageChecks.startFrameWatch(options), { isReducedMotion: run.isReducedMotion ?? false, refusedTex: REFUSED_BY_KATEX });
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(lessonBeats(run.lesson));
  await delay(1800);
  const frames: FrameWatch = await lab.page.evaluate(() => window.pageChecks.stopFrameWatch());
  await shoot(lab, 'final');
  const still = await checkStillness(lab);
  const rests = await checkRestsAgainstPlainKatex(lab);
  const replay = await checkReplayPixels(lab);
  const edges = await checkMoveEdges(lab);
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []);
  const summary = await lab.page.evaluate(() => window.pageChecks.getBoardSummary());
  const colors = await lab.page.evaluate(() => window.pageChecks.getColorsOnBoard());
  await lab.finish();
  return { label, frames, still, rests, replay, edges, refused, summary, colors };
}

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
  const writes = await lab.page.evaluate((ms) => window.pageChecks.countWritesOver(ms), 1500);
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

async function proveResize(browser: Browser, run: LessonRun) {
  const label = `${getLabel(run)}-resize`;
  const lab = await openLab({ browser, name: label, ...run });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(lessonBeats(run.lesson));
  await delay(1000);
  await lab.page.evaluate((options) => window.pageChecks.startFrameWatch(options), { isReducedMotion: false, refusedTex: REFUSED_BY_KATEX });
  for (const size of [VIEWPORTS.phone, { width: 320, height: 640 }, VIEWPORTS.laptop]) {
    await lab.page.setViewportSize(size);
    await delay(500);
    await shoot(lab, `resized-${size.width}`);
  }
  const frames: FrameWatch = await lab.page.evaluate(() => window.pageChecks.stopFrameWatch());
  const rests = await checkRestsAgainstPlainKatex(lab);
  await lab.finish();
  return { label, frames, rests };
}

const STEP_FRAMES = 8;
const STEP_SHEET_COLUMNS = 8;

async function makeStepSheet(lab: LabPage, run: LessonRun): Promise<string> {
  const moves = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { kind: string; atMs: number; overMs?: number | null; command?: { kind: string } }[]).filter((operation) => operation.command?.kind === 'transformMath').map(({ atMs, overMs }) => ({ atMs, overMs: overMs ?? 800 })));
  const folder = join(lab.folder, 'steps');
  mkdirSync(folder, { recursive: true });
  let frame = 0;
  for (const { atMs, overMs } of moves) {
    for (let step = 0; step < STEP_FRAMES; step += 1) {
      await holdFrame(lab, { atMs: atMs + (overMs * step) / (STEP_FRAMES - 1), source: 'live' });
      await delay(60);
      await lab.page.locator(BOARD_SELECTOR).screenshot({ path: join(folder, `frame-${String(frame).padStart(3, '0')}.png`) });
      frame += 1;
    }
  }
  await holdFrame(lab, null);
  const sheet = join(lab.folder, `steps-${getLabel(run)}.png`);
  const { width, height } = VIEWPORTS[run.viewport];
  const cropHeight = run.viewport === 'phone' ? Math.round(height * 0.4) : 180;
  const cropWidth = Math.round(width * 0.45);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', join(folder, 'frame-%03d.png'), '-vf', `crop=${Math.min(cropWidth, 340)}:${cropHeight}:0:0,tile=${STEP_SHEET_COLUMNS}x${moves.length}`, '-frames:v', '1', sheet]);
  return sheet;
}

async function proveSteps(browser: Browser, run: LessonRun) {
  const label = `${getLabel(run)}-steps`;
  const lab = await openLab({ browser, name: label, ...run });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(lessonBeats(run.lesson));
  await delay(1000);
  const sheet = await makeStepSheet(lab, run);
  await lab.finish();
  return { label, sheet };
}

const FONT_DELAY_MS = 2500;

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
  await lab.page.evaluate((options) => window.pageChecks.startFrameWatch(options), { isReducedMotion: false, refusedTex: REFUSED_BY_KATEX });
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(lessonBeats(run.lesson));
  await delay(1500);
  const frames: FrameWatch = await lab.page.evaluate(() => window.pageChecks.stopFrameWatch());
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

async function proveHostile(browser: Browser, run: LessonRun) {
  const label = `${getLabel(run)}-hostile`;
  const lab = await openLab({ browser, name: label, ...run, lesson: 'hostile' });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.page.evaluate((options) => window.pageChecks.startFrameWatch(options), { isReducedMotion: false, refusedTex: REFUSED_BY_KATEX });
  await lab.command({ type: 'play', lesson: 'hostile' });
  await lab.page.waitForFunction(() => (window.sceneLab?.records.fired.length ?? 0) > 0, undefined, { timeout: 30_000 });
  const turnId = await lab.page.evaluate(() => window.sceneLab?.records.fired[0]?.turnId);
  await lab.command({ type: 'sendRaw', messages: REFUSED_COMMANDS.map(({ command }) => ({ type: 'cue', turnId, beatId: 'markup', atWord: 1, command })) });
  await lab.waitForPlayedBeats(lessonBeats('hostile'));
  await delay(1500);
  const frames: FrameWatch = await lab.page.evaluate(() => window.pageChecks.stopFrameWatch());
  const clearedAt = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { kind: string; atMs: number; command?: { kind: string } }[]).filter((operation) => operation.command?.kind === 'clearBoard').map((operation) => operation.atMs));
  for (const [index, atMs] of clearedAt.entries()) {
    await holdFrame(lab, { atMs: atMs - 30, source: 'live' });
    await shoot(lab, `hostile-before-clear-${index + 1}`);
  }
  await holdFrame(lab, null);
  await shoot(lab, 'hostile-final');
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []);
  const summary = await lab.page.evaluate(() => window.pageChecks.getBoardSummary());
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  return { label, frames, refused, refusedByParser: refused.filter((problem) => !problem.startsWith('math:')).length, sent: REFUSED_COMMANDS.length, refusedAtRender: refused.filter((problem) => problem.startsWith('math:')), summary, replay };
}

const PROOFS = {
  resize: async (browser: Browser) => [await proveResize(browser, { lesson: 'dense', viewport: 'laptop', theme: 'light' })],
  steps: async (browser: Browser) => [await proveSteps(browser, { lesson: 'algebra', viewport: 'laptop', theme: 'light' }), await proveSteps(browser, { lesson: 'algebra', viewport: 'phone', theme: 'dark' }), await proveSteps(browser, { lesson: 'dense', viewport: 'laptop', theme: 'dark' })],
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
