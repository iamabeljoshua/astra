/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from 'playwright';
import { type LessonName, LESSONS } from '../lesson.ts';
import { BOARD_SELECTOR, checkReplayPixels, checkStillness, HIDE_DEV_BUTTON, holdFrame, type LabPage, openLabPage, shoot, type Theme, type ViewportName, VIEWPORTS } from './lab-page.ts';
import { delay, REPO_ROOT, startLabStack } from './lab-stack.ts';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/m3-4-proof' }, only: { type: 'string' }, stored: { type: 'string' } } });

const CHECKS_PATH = `/@fs${REPO_ROOT}/apps/agent/src/lab/proof/graph-page-checks.ts`;
const SHOT = { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 };
const SHOT_LANDING_SECONDS = (SHOT.upwardSpeed + Math.sqrt(SHOT.upwardSpeed ** 2 + 2 * SHOT.gravity * SHOT.releaseHeight)) / SHOT.gravity;
const STEPS_ACROSS_DRAG = 24;
const THUMB_WIDTH = 10;
const FREEZE_INTO_FLIGHT_MS = 700;
/** Marks are written to 0.01 of a pixel, so a scale read back from them moves by this share with nothing having moved. */
const SCALE_ROOM = 1e-3;

interface LabLog {
  player: { finishSliderDrag(): void };
  records: { log: { kind: string; ending?: string; frozen?: unknown[] }[] };
}


interface LessonRun {
  lesson: LessonName;
  viewport: ViewportName;
  theme: Theme;
  isReducedMotion?: boolean;
  label?: string;
}

const getLabel = ({ lesson, viewport, theme, isReducedMotion, label }: LessonRun) => `${lesson}-${viewport}-${theme}${isReducedMotion ? '-reduced' : ''}${label ? `-${label}` : ''}`;

async function open(browser: Browser, run: LessonRun): Promise<LabPage> {
  const voiceFlags = args.stored ? ['--stored', args.stored] : undefined;
  const lab = await openLabPage({ browser, name: getLabel(run), ...run, outFolder: args.out as string, checksPath: CHECKS_PATH, voiceFlags });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  return lab;
}

const beatsOf = (lesson: LessonName) => LESSONS[lesson][0]?.length ?? 0;

async function playWatched(lab: LabPage, run: LessonRun) {
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.page.evaluate((options) => window.pageChecks.startFrameWatch(options), { isReducedMotion: run.isReducedMotion ?? false, refusedTex: [] });
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(beatsOf(run.lesson), 120_000);
  await delay(1800);
  const frames = await lab.page.evaluate(() => window.pageChecks.stopFrameWatch());
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  const landing = await lab.page.evaluate(() => window.pageChecks.getLandingErrors());
  return { frames, figures, landing };
}

async function proveLesson(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  const watched = await playWatched(lab, run);
  await shoot(lab, 'final');
  const still = await checkStillness(lab);
  const replay = await checkReplayPixels(lab);
  const colors = await lab.page.evaluate(() => window.pageChecks.getColorsOnBoard());
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []);
  const pwned = await lab.page.evaluate(() => 'pwned' in window);
  await lab.finish();
  return { label: getLabel(run), ...watched, still, replay: { ...replay, differing: replay.differing.length }, colors, refused, pwned };
}

async function dragSliderTo(lab: LabPage, { from, to, min, max }: { from: number; to: number; min: number; max: number }): Promise<void> {
  const slider = lab.page.locator('.board-slider input').first();
  const box = (await slider.boundingBox()) as { x: number; y: number; width: number; height: number };
  const getX = (value: number) => box.x + THUMB_WIDTH / 2 + ((value - min) / (max - min)) * (box.width - THUMB_WIDTH);
  const y = box.y + box.height / 2;
  await lab.page.mouse.move(getX(from), y);
  await lab.page.mouse.down();
  for (let step = 1; step <= STEPS_ACROSS_DRAG; step += 1) {
    await lab.page.mouse.move(getX(from + ((to - from) * step) / STEPS_ACROSS_DRAG), y);
    await delay(20);
  }
  await lab.page.mouse.up();
}

async function nudgeSliderTo(lab: LabPage, value: number): Promise<void> {
  const slider = lab.page.locator('.board-slider input').first();
  await slider.focus();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = Number(await slider.inputValue());
    if (Math.abs(current - value) < 0.04) return;
    await lab.page.keyboard.press(current < value ? 'ArrowRight' : 'ArrowLeft');
  }
}

async function checkDragReplay(lab: LabPage) {
  const { times, shiftMs } = await lab.page.evaluate(() => {
    const operations = window.sceneLab?.player.getOperations() ?? [];
    const samples = operations.filter((operation) => operation.kind === 'parameterSample').map((operation) => operation.atMs);
    const liveStart = operations.find((operation) => operation.kind === 'beatStarted')?.atMs ?? 0;
    const logStart = (window.sceneLab?.records.log[0] as { atMs: number } | undefined)?.atMs ?? 0;
    return { times: samples, shiftMs: logStart - liveStart };
  });
  const moments = [...times.filter((_, index) => index % 4 === 0).map((atMs) => atMs + 5), (times.at(-1) ?? 0) + 300, (times.at(-1) ?? 0) + 900];
  const differing: number[] = [];
  for (const atMs of moments) {
    await holdFrame(lab, { atMs, source: 'live' });
    const live = await shoot(lab, 'drag-compare');
    await holdFrame(lab, { atMs: atMs + shiftMs, source: 'replay' });
    const replay = await shoot(lab, 'drag-compare');
    if (!live.equals(replay)) differing.push(Math.round(atMs));
  }
  await holdFrame(lab, null);
  return { samples: times.length, moments: moments.length, differing };
}

async function proveSlider(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: 'shot' });
  await lab.waitForPlayedBeats(beatsOf('shot'), 120_000);
  await delay(1200);
  await shoot(lab, 'before-drag');
  const before = await lab.page.evaluate(() => window.pageChecks.getBallMetres());
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.page.evaluate(() => window.pageChecks.startSliderLatencyWatch());
  const scaleBefore = before?.metresPerPixel;
  await dragSliderTo(lab, { from: 4.2, to: 8.4, min: 0, max: 10 });
  await nudgeSliderTo(lab, 8.4);
  const speed = Number(await lab.page.locator('.board-slider input').first().inputValue());
  await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).player.finishSliderDrag());
  await delay(SHOT_LANDING_SECONDS * 1000 + 600);
  const latency = await lab.page.evaluate(() => window.pageChecks.getSliderLatency());
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  const after = await lab.page.evaluate(() => window.pageChecks.getBallMetres());
  await shoot(lab, 'm3-4-slider');
  const logged = await lab.page.waitForFunction(() => (window.sceneLab as unknown as LabLog).records.log.some((event) => event.kind === 'studentActed'), undefined, { timeout: 10_000 }).then(() => true, () => false);
  const dragReplay = await checkDragReplay(lab);
  await lab.finish();
  const expected = { before: SHOT.horizontalSpeed * SHOT_LANDING_SECONDS, after: speed * SHOT_LANDING_SECONDS };
  return { label: getLabel(run), speed, expected, before, after, landedRatio: (after?.x ?? 0) / (before?.x ?? 1), errorMetres: Math.abs((after?.x ?? 0) - expected.after), scaleHeld: Math.abs((scaleBefore ?? 0) - (after?.metresPerPixel ?? 1)) / (after?.metresPerPixel ?? 1) < SCALE_ROOM, latency, figures, logged, dragReplay };
}

const ARC_SHARES = [0, 0.1, 0.25, 0.39, 0.5, 0.75, 0.9, 1];

/** Holds the ball at moments of the flight and reads where it was drawn, against the formula worked here, not the code that drew it. */
async function proveArc(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: 'shot' });
  await lab.waitForPlayedBeats(beatsOf('shot') - 1, 120_000);
  const plays = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { atMs: number; overMs?: number | null; command?: { kind: string } }[]).filter((operation) => operation.command?.kind === 'runSimulation').map(({ atMs, overMs }) => ({ atMs, overMs: overMs ?? 0 })));
  await delay(1500);
  const start = plays[0]?.atMs ?? 0;
  const end = (plays.at(-1)?.atMs ?? 0) + (plays.at(-1)?.overMs ?? 0) + 200;
  const points = [];
  for (const share of ARC_SHARES) {
    const atMs = start + (end - start) * share;
    await holdFrame(lab, { atMs, source: 'live' });
    await delay(80);
    const drawn = await lab.page.evaluate((held) => ({ metres: window.pageChecks.getBallMetres(), seconds: (window.sceneLab?.describeLive(held) as { elements: { id: string; sceneSeconds?: number }[] }).elements.find((element) => element.id === 'shot')?.sceneSeconds ?? 0 }), atMs);
    const worked = { x: SHOT.horizontalSpeed * drawn.seconds, y: SHOT.releaseHeight + SHOT.upwardSpeed * drawn.seconds - (SHOT.gravity * drawn.seconds ** 2) / 2 };
    points.push({ seconds: drawn.seconds, drawn: drawn.metres, worked, errorPixels: Math.hypot((drawn.metres?.x ?? 0) - worked.x, (drawn.metres?.y ?? 0) - worked.y) / (drawn.metres?.metresPerPixel ?? 1) });
  }
  await holdFrame(lab, null);
  await lab.page.locator(BOARD_SELECTOR).screenshot({ path: join(lab.folder, 'm3-4-shot.png') });
  await lab.finish();
  return { label: getLabel(run), points, worstErrorPixels: Math.max(...points.map((point) => point.errorPixels)) };
}

async function proveFreeze(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.page.waitForFunction(() => (window.sceneLab?.player.getOperations() as { command?: { kind: string } }[]).some((operation) => operation.command?.kind === 'runSimulation'), undefined, { timeout: 60_000 });
  await delay(FREEZE_INTO_FLIGHT_MS);
  await lab.command({ type: 'interrupt' });
  await lab.page.waitForFunction(() => (window.sceneLab?.records.stops.length ?? 0) > 0, undefined, { timeout: 10_000 });
  await delay(150);
  const frozen = await lab.page.evaluate(() => window.pageChecks.getBallMetres());
  const first = await shoot(lab, 'frozen-first');
  const writes = await lab.page.evaluate((ms) => window.pageChecks.countWritesOver(ms), 1500);
  const later = await shoot(lab, 'frozen-later');
  await lab.page.waitForFunction(() => (window.sceneLab as unknown as LabLog).records.log.some((event) => event.ending === 'interrupted'), undefined, { timeout: 10_000 });
  const report = await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).records.log.find((event) => event.ending === 'interrupted'));
  await lab.command({ type: 'resume' });
  await lab.page.waitForFunction(() => (window.sceneLab?.records.turnsSent.length ?? 0) >= 2, undefined, { timeout: 60_000 });
  await delay(1500);
  const resumed = await lab.page.evaluate(() => window.pageChecks.getBallMetres());
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  return { label: getLabel(run), frozen, identical: first.equals(later), ...writes, cut: report?.frozen ?? null, resumed, replay: { moments: replay.moments, differing: replay.differing.length, described: replay.describedDifferently } };
}

const REFUSED_COMMANDS: { name: string; command: unknown }[] = [
  { name: 'code in an expression', command: { kind: 'plot', id: 'evil', expression: 'process.exit(1)', domain: [0, 1] } },
  { name: 'a property reach', command: { kind: 'plot', id: 'evil', expression: 'x.constructor', domain: [0, 1] } },
  { name: 'a call to a global', command: { kind: 'plot', id: 'evil', expression: 'eval(x)', domain: [0, 1] } },
  { name: 'python power', command: { kind: 'plot', id: 'evil', expression: 'x**2', domain: [0, 1] } },
  { name: 'an expression too long', command: { kind: 'plot', id: 'evil', expression: `x${'+1'.repeat(100)}`, domain: [0, 1] } },
  { name: 'nesting too deep', command: { kind: 'plot', id: 'evil', expression: `${'-'.repeat(40)}x`, domain: [0, 1] } },
  { name: 'a backward domain', command: { kind: 'plot', id: 'evil', expression: 'x', domain: [1, 0] } },
  { name: 'a domain past the limit', command: { kind: 'plot', id: 'evil', expression: 'x', domain: [0, 1e9] } },
  { name: 'a poisoned constant', command: { kind: 'plot', id: 'evil', expression: 'x', domain: [0, 1], constants: [{ name: '__proto__', value: 1, min: 0, max: 2 }] } },
  { name: 'a constant named like a function', command: { kind: 'plot', id: 'evil', expression: 'sin', domain: [0, 1], constants: [{ name: 'sin', value: 1, min: 0, max: 2 }] } },
  { name: 'a pixel position', command: { kind: 'numberLine', id: 'evil', domain: [0, 1], x: 900 } },
  { name: 'a play with a rate and words', command: { kind: 'runSimulation', target: 'busy', action: 'play', rate: 2, overWords: 2 } },
  { name: 'a rate too high', command: { kind: 'runSimulation', target: 'busy', action: 'play', rate: 1000 } },
  { name: 'gravity of zero', command: { kind: 'setParameter', target: 'busy', parameter: 'gravity', value: 0 } },
  { name: 'a poisoned point', command: { kind: 'construct', id: 'evil', target: 'busy', step: { shape: 'point', name: '__proto__', x: 0, y: 0 } } },
];

async function proveHostile(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.page.evaluate(() => window.pageChecks.startFrameWatch({ isReducedMotion: false, refusedTex: [] }));
  await lab.command({ type: 'play', lesson: 'figure-hostile' });
  await lab.page.waitForFunction(() => (window.sceneLab?.records.fired.length ?? 0) > 0, undefined, { timeout: 30_000 });
  const turnId = await lab.page.evaluate(() => window.sceneLab?.records.fired[0]?.turnId);
  await lab.command({ type: 'sendRaw', messages: REFUSED_COMMANDS.map(({ command }) => ({ type: 'cue', turnId, beatId: 'crowded', atWord: 1, command })) });
  await lab.page.waitForFunction((count) => (window.sceneLab?.records.browserMessages.filter((message) => message.type === 'played').length ?? 0) >= count, 1, { timeout: 90_000 });
  await lab.waitForPlayedBeats(beatsOf('figure-hostile'), 120_000);
  await delay(1500);
  const frames = await lab.page.evaluate(() => window.pageChecks.stopFrameWatch());
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  await shoot(lab, 'hostile-final');
  const firstClearAtMs = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { atMs: number; command?: { kind: string } }[]).find((operation) => operation.command?.kind === 'clearBoard')?.atMs ?? 0);
  await holdFrame(lab, { atMs: firstClearAtMs - 30, source: 'live' });
  await shoot(lab, 'hostile-crowded');
  await holdFrame(lab, null);
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []);
  const summary = await lab.page.evaluate(() => ({ pwned: 'pwned' in window, scripts: document.querySelector('[data-testid="board"] script, [data-testid="board"] img') !== null, stillDrawing: document.querySelector('[data-mark^="point-"]') !== null }));
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  return { label: getLabel(run), sent: REFUSED_COMMANDS.length, refused: refused.length, frames, figures, summary, replay: { moments: replay.moments, differing: replay.differing.length } };
}

async function proveResize(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(beatsOf(run.lesson), 120_000);
  await delay(1000);
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.page.evaluate(() => window.pageChecks.startFrameWatch({ isReducedMotion: false, refusedTex: [] }));
  for (const size of [VIEWPORTS.phone, { width: 320, height: 640 }, VIEWPORTS.laptop]) {
    await lab.page.setViewportSize(size);
    await delay(500);
    await shoot(lab, `resized-${size.width}`);
  }
  const frames = await lab.page.evaluate(() => window.pageChecks.stopFrameWatch());
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  await lab.finish();
  return { label: getLabel(run), frames: { overlap: frames.overlapFrames, outside: frames.outsideBoardFrames, frames: frames.frames, examples: frames.examples.slice(0, 5) }, figures: { overlap: figures.textOverlapFrames, outside: figures.textOutsideFrames, examples: figures.examples.slice(0, 5) } };
}

const MOVE_STEP_MS = 16;
const MOVE_STEPS = 28;
const JUMP_THRESHOLD = 24;

/** Frame by frame across every rearrangement, the most pixels that change in one 16 ms step. */
async function proveMoves(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: run.lesson });
  await lab.waitForPlayedBeats(beatsOf(run.lesson), 120_000);
  await delay(1000);
  const moves = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { atMs: number; overMs?: number | null; command?: { kind: string; target?: string } }[]).filter((operation) => operation.command?.kind === 'transformMath').map(({ atMs, overMs, command }) => ({ atMs, overMs: overMs ?? 800, target: command?.target })));
  const worstByMove: { atMs: number; landedOnAnother: boolean; worstStepPixels: number }[] = [];
  for (const [index, move] of moves.entries()) {
    const previous = moves.slice(0, index).filter((other) => other.target === move.target).at(-1);
    let last: string | null = null;
    let worstStepPixels = 0;
    for (let step = 0; step < MOVE_STEPS; step += 1) {
      await holdFrame(lab, { atMs: move.atMs - MOVE_STEP_MS + step * MOVE_STEP_MS, source: 'live' });
      const shot = (await shoot(lab, 'move-compare')).toString('base64');
      if (last !== null) worstStepPixels = Math.max(worstStepPixels, await lab.page.evaluate((pair) => window.pageChecks.countDifferentPixels(pair), [last, shot, JUMP_THRESHOLD] as [string, string, number]));
      last = shot;
    }
    worstByMove.push({ atMs: Math.round(move.atMs), landedOnAnother: previous !== undefined && previous.atMs + previous.overMs > move.atMs, worstStepPixels });
  }
  await holdFrame(lab, null);
  await lab.finish();
  return { label: getLabel(run), worstByMove };
}

async function proveLateWords(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.command({ type: 'play', lesson: run.lesson, sendsWordsOneByOne: true });
  await lab.waitForPlayedBeats(beatsOf(run.lesson), 120_000);
  await delay(1800);
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  const landing = await lab.page.evaluate(() => window.pageChecks.getLandingErrors());
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  return { label: getLabel(run), figures: { ...figures, ballPlaces: figures.ballPlaces.length }, landing, replay: { moments: replay.moments, differing: replay.differing.length, described: replay.describedDifferently } };
}

const ANGLE_SLIDER = { min: 10, max: 80 };
const LAUNCH = { speed: Math.hypot(10, 10), gravity: 9.8 };

/** A launch angle lands farthest in the middle of its range, so this is the drag most likely to move the axes under the student's hand. */
async function proveAngleSlider(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: 'launch' });
  await lab.waitForPlayedBeats(beatsOf('launch'), 120_000);
  await delay(2500);
  const scales: number[] = [];
  const noteScale = async () => scales.push((await lab.page.evaluate(() => window.pageChecks.getBallMetres()))?.metresPerPixel ?? 0);
  await noteScale();
  await dragSliderTo(lab, { from: 45, to: 78, ...ANGLE_SLIDER });
  await noteScale();
  await dragSliderTo(lab, { from: 78, to: 30, ...ANGLE_SLIDER });
  await nudgeSliderTo(lab, 30);
  await noteScale();
  const angle = Number(await lab.page.locator('.board-slider input').first().inputValue());
  await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).player.finishSliderDrag());
  await delay(2600);
  const landed = await lab.page.evaluate(() => window.pageChecks.getBallMetres());
  const workedRange = (LAUNCH.speed ** 2 * Math.sin((2 * angle * Math.PI) / 180)) / LAUNCH.gravity;
  await shoot(lab, 'angle-slider');
  await lab.finish();
  return { label: getLabel(run), angle, scales, scaleHeld: (Math.max(...scales) - Math.min(...scales)) / Math.max(...scales) < SCALE_ROOM, landedX: landed?.x, workedRange, errorMetres: Math.abs((landed?.x ?? 0) - workedRange) };
}

const LESSON_PAIRS: LessonRun[] = (['shot', 'graphs', 'number-line', 'triangle', 'free-body', 'launch'] as const).flatMap((lesson) => [{ lesson, viewport: 'laptop', theme: 'light' }, { lesson, viewport: 'phone', theme: 'dark' }] as LessonRun[]);

const PROOFS = {
  lessons: async (browser: Browser) => {
    const results = [];
    for (const run of LESSON_PAIRS) results.push(await proveLesson(browser, run));
    for (const lesson of ['shot', 'graphs'] as const) {
      results.push(await proveLesson(browser, { lesson, viewport: 'laptop', theme: 'dark' }));
      results.push(await proveLesson(browser, { lesson, viewport: 'phone', theme: 'light' }));
    }
    return results;
  },
  reduced: async (browser: Browser) => [await proveLesson(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light', isReducedMotion: true }), await proveLesson(browser, { lesson: 'graphs', viewport: 'phone', theme: 'dark', isReducedMotion: true })],
  slider: async (browser: Browser) => [await proveSlider(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light' }), await proveSlider(browser, { lesson: 'shot', viewport: 'phone', theme: 'dark' })],
  arc: async (browser: Browser) => [await proveArc(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light' }), await proveArc(browser, { lesson: 'shot', viewport: 'phone', theme: 'dark' })],
  freeze: async (browser: Browser) => [await proveFreeze(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light' }), await proveFreeze(browser, { lesson: 'shot', viewport: 'phone', theme: 'dark' })],
  hostile: async (browser: Browser) => [await proveHostile(browser, { lesson: 'figure-hostile', viewport: 'laptop', theme: 'light' }), await proveHostile(browser, { lesson: 'figure-hostile', viewport: 'phone', theme: 'dark' })],
  'late-words': async (browser: Browser) => [await proveLateWords(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light', label: 'late-words' }), await proveLateWords(browser, { lesson: 'shot', viewport: 'phone', theme: 'dark', label: 'late-words' }), await proveLateWords(browser, { lesson: 'graphs', viewport: 'laptop', theme: 'light', label: 'late-words' })],
  'angle-slider': async (browser: Browser) => [await proveAngleSlider(browser, { lesson: 'launch', viewport: 'laptop', theme: 'light' }), await proveAngleSlider(browser, { lesson: 'launch', viewport: 'phone', theme: 'dark' })],
  moves: async (browser: Browser) => [await proveMoves(browser, { lesson: 'rapid-moves', viewport: 'laptop', theme: 'light' }), await proveMoves(browser, { lesson: 'algebra', viewport: 'laptop', theme: 'light' })],
  stored: async (browser: Browser) => [await proveLesson(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light', label: 'stored' }), await proveLesson(browser, { lesson: 'shot', viewport: 'phone', theme: 'dark', label: 'stored' }), await proveLesson(browser, { lesson: 'graphs', viewport: 'laptop', theme: 'dark', label: 'stored' }), await proveFreeze(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light', label: 'stored-freeze' })],
  resize: async (browser: Browser) => [await proveResize(browser, { lesson: 'launch', viewport: 'laptop', theme: 'light' }), await proveResize(browser, { lesson: 'free-body', viewport: 'laptop', theme: 'dark' })],
} as const;

mkdirSync(args.out as string, { recursive: true });
const stack = await startLabStack();
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain', '--mute-audio'] });
try {
  for (const name of (args.only ?? Object.keys(PROOFS).join(',')).split(',')) {
    const results = await PROOFS[name as keyof typeof PROOFS](browser);
    writeFileSync(join(args.out as string, `${name}.json`), `${JSON.stringify(results, null, 1)}\n`);
    console.log(name, 'done');
  }
} finally {
  await browser.close();
  stack.stop();
}
process.exit(0);
