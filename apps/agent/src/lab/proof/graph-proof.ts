/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from 'playwright';
import { type LessonName, LESSONS } from '../lesson.ts';
import { BOARD_SELECTOR, checkReplayPixels, checkStillness, getReplaySummary, HIDE_DEV_BUTTON, holdFrame, type LabPage, openLabPage, shoot, type Theme, type ViewportName, VIEWPORTS } from './lab-page.ts';
import { delay, REPO_ROOT, startLabStack } from './lab-stack.ts';
import { exitWithVerdict, getProofFailures } from './proof-verdict.ts';

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
  return { label: getLabel(run), ...watched, still, replay: getReplaySummary(replay), colors, refused, pwned };
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

async function checkDragReplay(lab: LabPage, everySample = 4) {
  const { times, shiftMs } = await lab.page.evaluate(() => {
    const operations = window.sceneLab?.player.getOperations() ?? [];
    const samples = operations.filter((operation) => operation.kind === 'parameterSample').map((operation) => operation.atMs);
    const liveStart = operations.find((operation) => operation.kind === 'beatStarted')?.atMs ?? 0;
    const logStart = (window.sceneLab?.records.log[0] as { atMs: number } | undefined)?.atMs ?? 0;
    return { times: samples, shiftMs: logStart - liveStart };
  });
  const moments = [...times.filter((_, index) => index % everySample === 0).flatMap((atMs) => (everySample === 1 ? [atMs + 3, atMs + 37] : [atMs + 5])), (times.at(-1) ?? 0) + 300, (times.at(-1) ?? 0) + 900];
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
  return { label: getLabel(run), frozen, identical: first.equals(later), ...writes, cut: report?.frozen ?? null, resumed, replay: getReplaySummary(replay) };
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
  return { label: getLabel(run), sent: REFUSED_COMMANDS.length, refused: refused.length, frames, figures, summary, replay: getReplaySummary(replay) };
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
  return { label: getLabel(run), figures: { ...figures, ballPlaces: figures.ballPlaces.length }, landing, replay: getReplaySummary(replay) };
}

const readCurve = (lab: LabPage) =>
  lab.page.evaluate(() => {
    const curve = document.querySelector('[data-mark^="curve-"]')?.getAttribute('d') ?? '';
    const axes = (document.querySelector('[data-mark="axes"]')?.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const pieces = curve.split('M').filter((piece) => piece !== '').map((piece) => piece.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []);
    const covered = pieces.reduce((sum, numbers) => sum + (numbers.at(-2) as number) - (numbers[0] as number), 0);
    return { pieces: pieces.length, coveredShare: Number((covered / ((axes[2] as number) - (axes[0] as number))).toFixed(4)), bytes: curve.length, value: document.querySelector('.board-slider-value')?.textContent ?? null };
  });

const SLIDER_WAVES = [1, 2, 3, 4, 5, 7, 10];
const CURVE_DRAWN_MS = 950;

async function proveWaves(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.command({ type: 'play', lesson: 'figure-waves', lessonTurn: 0 });
  await lab.waitForPlayedBeats(1, 60_000);
  await delay(600);
  const dragged = [];
  for (const [index, a] of SLIDER_WAVES.entries()) {
    await dragSliderTo(lab, { from: SLIDER_WAVES[Math.max(0, index - 1)] as number, to: a, min: 1, max: 10 });
    await nudgeSliderTo(lab, a);
    await delay(120);
    await shoot(lab, `wave-a-${a}`);
    dragged.push({ a, ...(await readCurve(lab)) });
  }
  await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).player.finishSliderDrag());
  await lab.command({ type: 'play', lesson: 'figure-waves', lessonTurn: 1 });
  await lab.waitForPlayedBeats(1 + (LESSONS['figure-waves'][1]?.length ?? 0), 120_000);
  await delay(1200);
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  const placed = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { atMs: number; command?: { kind: string; id?: string } }[]).filter((operation) => operation.command?.kind === 'plot').map(({ atMs, command }) => ({ atMs, id: command?.id as string })));
  const named = [];
  for (const { atMs, id } of placed.slice(1)) {
    await holdFrame(lab, { atMs: atMs + CURVE_DRAWN_MS, source: 'live' });
    await shoot(lab, `curve-${id}`);
    named.push({ id, ...(await readCurve(lab)) });
  }
  await holdFrame(lab, null);
  await lab.finish();
  return { label: getLabel(run), dragged, named, figures: { frames: figures.frames, notFinite: figures.notFiniteFrames, overlap: figures.textOverlapFrames, gapP95: figures.frameGapP95 } };
}

const readSlider = (lab: LabPage) =>
  lab.page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('.board-slider input');
    return input && { min: input.min, max: input.max, value: input.value, name: input.labels?.[0]?.textContent, text: input.getAttribute('aria-valuetext'), disabled: input.disabled, figure: document.querySelector('svg.board-figure')?.getAttribute('aria-label') };
  });

async function proveReuse(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  const turns = [];
  for (const lessonTurn of [0, 1]) {
    await lab.command({ type: 'play', lesson: 'figure-reuse', lessonTurn });
    await lab.waitForPlayedBeats(lessonTurn + 1, 60_000);
    await delay(500);
    const before = await lab.page.evaluate(() => document.querySelector('[data-mark^="curve-"]')?.getAttribute('d'));
    const shown = await readSlider(lab);
    await lab.page.locator('.board-slider input').first().focus();
    for (let press = 0; press < 5; press += 1) await lab.page.keyboard.press('ArrowRight');
    await delay(300);
    const after = await lab.page.evaluate(() => document.querySelector('[data-mark^="curve-"]')?.getAttribute('d'));
    await shoot(lab, `reuse-${lessonTurn}`);
    turns.push({ shown, afterKeys: await readSlider(lab), curveMoved: before !== after });
  }
  await lab.command({ type: 'play', lesson: 'figure-reuse', lessonTurn: 2 });
  await lab.waitForPlayedBeats(3, 60_000);
  await delay(1100);
  const afterItsCurveWasReplaced = await readSlider(lab);
  await shoot(lab, 'reuse-2');
  await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).player.finishSliderDrag());
  await delay(300);
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  return { label: getLabel(run), turns, afterItsCurveWasReplaced, replay: getReplaySummary(replay) };
}

async function proveMarks(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: 'figure-marks' });
  await lab.waitForPlayedBeats(beatsOf('figure-marks'), 60_000);
  await delay(600);
  await shoot(lab, 'marks');
  const problems = await lab.page.evaluate(() => window.sceneLab?.records.boardProblems);
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  return { label: getLabel(run), problems, replay: getReplaySummary(replay) };
}

async function proveLabels(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.command({ type: 'play', lesson: 'figure-labels' });
  await lab.waitForPlayedBeats(beatsOf('figure-labels'), 60_000);
  await delay(1200);
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  await shoot(lab, 'labels');
  const problems = await lab.page.evaluate(() => window.sceneLab?.records.boardProblems);
  await lab.finish();
  return { label: getLabel(run), frames: figures.frames, overlap: figures.textOverlapFrames, outside: figures.textOutsideFrames, examples: [...new Set(figures.examples)].slice(0, 6), problems };
}

const TOO_NARROW_SLIDERS = [{ kind: 'slider', id: 'tiny', target: 'small', constant: 'a', min: 0, max: 1e-110 }, { kind: 'slider', id: 'tiny-speed', target: 'small', parameter: 'horizontalSpeed', min: 0, max: 1e-110 }];

async function proveExtremes(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  const errors: string[] = [];
  lab.page.on('pageerror', (error) => errors.push(error.message));
  lab.page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  const turns = LESSONS['figure-extremes'].length;
  let sliderMoves = 0;
  for (let lessonTurn = 0; lessonTurn < turns; lessonTurn += 1) {
    await lab.command({ type: 'play', lesson: 'figure-extremes', lessonTurn });
    await lab.waitForPlayedBeats(lessonTurn + 1, 60_000);
    await delay(500);
    await shoot(lab, `extreme-${lessonTurn}`);
    const sliders = lab.page.locator('.board-slider input');
    for (let index = 0; index < (await sliders.count()); index += 1) {
      await sliders.nth(index).focus();
      for (const key of ['End', 'Home', 'ArrowRight', 'ArrowRight', 'PageUp', 'End']) {
        await lab.page.keyboard.press(key);
        sliderMoves += 1;
      }
    }
    await delay(150);
    await shoot(lab, `extreme-${lessonTurn}-moved`);
  }
  await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).player.finishSliderDrag());
  const turnId = await lab.page.evaluate(() => window.sceneLab?.records.fired.at(-1)?.turnId);
  await lab.command({ type: 'sendRaw', messages: TOO_NARROW_SLIDERS.map((command) => ({ type: 'cue', turnId, beatId: 'backward-flight', atWord: 1, command })) });
  await delay(600);
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []);
  const stopped = await lab.page.getByText('This page stopped working').count();
  const replay = await checkReplayPixels(lab);
  const sliderReplay = await checkDragReplay(lab, 3);
  await lab.finish();
  return { label: getLabel(run), turns, sliderMoves, errors: errors.slice(0, 5), errorCount: errors.length, stopped, refused: refused.length, frames: figures.frames, notFinite: figures.notFiniteFrames, overlap: figures.textOverlapFrames, outside: figures.textOutsideFrames, examples: [...new Set(figures.examples)].slice(0, 6), liveFramesDifferingFromLog: figures.liveSamplesDifferingFromReplay, replay: getReplaySummary(replay), sliderReplay: { moments: sliderReplay.moments, differing: sliderReplay.differing.length } };
}

const readFigureWords = (lab: LabPage) => lab.page.evaluate(() => [...document.querySelectorAll('svg.board-figure text')].map((text) => text.textContent ?? '').filter((text) => /[a-z]/i.test(text)));

const OLD_WORDS = /minimum|bends up/;

/** The review's lesson: marks on one curve, then a new curve under the same id. */
async function proveReplaced(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: 'figure-replaced', lessonTurn: 0 });
  await lab.waitForPlayedBeats(1, 60_000);
  await delay(800);
  const before = await readFigureWords(lab);
  await shoot(lab, 'marks-on-first-curve');
  await lab.command({ type: 'play', lesson: 'figure-replaced', lessonTurn: 1 });
  await lab.waitForPlayedBeats(2, 60_000);
  await delay(1100);
  const after = await readFigureWords(lab);
  await shoot(lab, 'new-curve-no-old-marks');
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  const oldWordsSeen = before.filter((word) => OLD_WORDS.test(word));
  return { label: getLabel(run), oldWordsSeen, oldWordsLeft: after.filter((word) => OLD_WORDS.test(word)), wordsAfter: after, replay: getReplaySummary(replay) };
}

const readSliders = (lab: LabPage) => lab.page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('.board-slider input')].map((input) => input.getAttribute('aria-valuetext') ?? ''));

const OVERLAPPING_SLIDER = { kind: 'slider', id: 'also-angle', target: 'polar', parameter: 'launchAngle', min: 10, max: 80 };
const GRAVITY_THROUGH_A_CONSTANT = { kind: 'slider', id: 'gravity-way', target: 'polar', constant: 'gravity', min: -5, max: 5 };
const PAIR_STEPS = [['Home'], ['ArrowLeft', 'ArrowLeft', 'ArrowLeft'], ['ArrowRight']];

/** One slider's key presses must leave the other slider's number exactly where the student left it. */
async function provePair(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  const numbersMoved: string[] = [];
  const steps = [];
  for (const lessonTurn of [0, 1]) {
    await lab.command({ type: 'play', lesson: 'figure-pair', lessonTurn });
    await lab.waitForPlayedBeats(lessonTurn + 1, 60_000);
    await delay(700);
    const sliders = lab.page.locator('.board-slider input');
    for (const [stepIndex, keys] of PAIR_STEPS.entries()) {
      const moving = stepIndex % 2;
      const before = await readSliders(lab);
      await sliders.nth(moving).focus();
      for (const key of keys) await lab.page.keyboard.press(key);
      await delay(150);
      const after = await readSliders(lab);
      if (before[1 - moving] !== after[1 - moving]) numbersMoved.push(`turn ${lessonTurn} step ${stepIndex}: ${before.join(' ')} to ${after.join(' ')}`);
      steps.push({ lessonTurn, stepIndex, before, after, words: await readFigureWords(lab) });
    }
    await shoot(lab, `pair-${lessonTurn}`);
    await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).player.finishSliderDrag());
  }
  const turnId = await lab.page.evaluate(() => window.sceneLab?.records.fired.at(-1)?.turnId);
  const refusedBefore = await lab.page.evaluate(() => window.sceneLab?.records.refused.length ?? 0);
  await lab.command({ type: 'sendRaw', messages: [OVERLAPPING_SLIDER, GRAVITY_THROUGH_A_CONSTANT].map((command) => ({ type: 'cue', turnId, beatId: 'cartesian', atWord: 1, command })) });
  await delay(600);
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  const problems = (await lab.page.evaluate(() => window.sceneLab?.records.boardProblems ?? [])) as { kind: string }[];
  const refusedByParser = (await lab.page.evaluate(() => window.sceneLab?.records.refused.length ?? 0)) - refusedBefore;
  const sliderCount = await lab.page.locator('.board-slider input').count();
  const dragReplay = await checkDragReplay(lab, 1);
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  const refusalsMissed = [...(problems.some(({ kind }) => kind === 'sliderOverlaps') ? [] : ['an overlapping slider']), ...(refusedByParser > 0 ? [] : ['gravity through a constant'])];
  return { label: getLabel(run), numbersMoved, steps, sliderCount, refusalsMissed, refusedByParser, problems, frames: figures.frames, notFinite: figures.notFiniteFrames, overlap: figures.textOverlapFrames, dragReplay, replay: getReplaySummary(replay) };
}

const FINE_CURVES: Readonly<Record<string, boolean>> = { 'square-100': true, 'poles-100': true, 'tan-100': true, 'band-300': true, 'whole-150': false, bump: false, sinc: false };

/** Each curve as a student sees it, and what the board told the tutor. */
async function proveFine(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.page.evaluate(() => window.pageChecks.startFigureWatch());
  await lab.command({ type: 'play', lesson: 'figure-fine' });
  await lab.waitForPlayedBeats(beatsOf('figure-fine'), 120_000);
  await delay(1200);
  const figures = await lab.page.evaluate(() => window.pageChecks.stopFigureWatch());
  const placed = await lab.page.evaluate(() => (window.sceneLab?.player.getOperations() as { atMs: number; command?: { kind: string; id?: string } }[]).filter((operation) => operation.command?.kind === 'plot').map(({ atMs, command }) => ({ atMs, id: command?.id as string })));
  const told = ((await lab.page.evaluate(() => window.sceneLab?.records.boardProblems ?? [])) as { kind: string; target?: string }[]).filter(({ kind }) => kind === 'curveTooFine').map(({ target }) => target);
  const curves = [];
  for (const { atMs, id } of placed) {
    await holdFrame(lab, { atMs: atMs + CURVE_DRAWN_MS, source: 'live' });
    await shoot(lab, `fine-${id}`);
    curves.push({ id, ...(await readCurve(lab)), note: await lab.page.evaluate(() => document.querySelector('[data-mark="too-fine"]')?.textContent ?? null), yTicks: await lab.page.evaluate(() => [...document.querySelectorAll('[data-mark^="tick-y-"]')].map((tick) => tick.textContent)) });
  }
  await holdFrame(lab, null);
  const replay = await checkReplayPixels(lab);
  await lab.finish();
  const curvesMisjudged = curves.filter(({ id, note }) => (note !== null) !== FINE_CURVES[id] || told.includes(id) !== FINE_CURVES[id]).map(({ id }) => id);
  return { label: getLabel(run), curves, told, curvesMisjudged, frames: figures.frames, notFinite: figures.notFiniteFrames, overlap: figures.textOverlapFrames, outside: figures.textOutsideFrames, replay: getReplaySummary(replay) };
}

const KEY_PRESSES = 8;

/** A key press sends its drag in the same millisecond, which is where a live board and the log can disagree. */
async function proveKeyPressReplay(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: 'shot' });
  await lab.waitForPlayedBeats(beatsOf('shot'), 120_000);
  await delay(1200);
  await lab.page.locator('.board-slider input').first().focus();
  for (let press = 0; press < KEY_PRESSES; press += 1) {
    await lab.page.keyboard.press(press % 3 === 2 ? 'ArrowLeft' : 'ArrowRight');
    await delay(137 + press * 37);
  }
  await delay(300);
  await lab.page.evaluate(() => (window.sceneLab as unknown as LabLog).player.finishSliderDrag());
  await lab.page.waitForFunction((count) => ((window.sceneLab as unknown as { records: { log: { kind: string }[] } }).records.log.filter((event) => event.kind === 'studentActed').length) >= count, KEY_PRESSES, { timeout: 10_000 });
  const deltas = await lab.page.evaluate(() => {
    const operations = window.sceneLab?.player.getOperations() ?? [];
    const liveStart = operations.find((operation) => operation.kind === 'beatStarted')?.atMs ?? 0;
    const logStart = (window.sceneLab?.records.log[0] as { atMs: number } | undefined)?.atMs ?? 0;
    const live = operations.filter((operation) => operation.kind === 'parameterSample').map((operation) => operation.atMs + logStart - liveStart);
    const logged = (window.sceneLab?.records.log as unknown as { kind: string; atMs: number; action?: { samples?: { afterMs: number }[] } }[]).filter((event) => event.kind === 'studentActed').flatMap((event) => event.action?.samples?.map(({ afterMs }) => event.atMs + afterMs) ?? []);
    return live.map((atMs, index) => Math.round((logged[index] ?? Number.NaN) - atMs));
  });
  const moments = await checkDragReplay(lab, 1);
  await lab.finish();
  return { label: getLabel(run), presses: KEY_PRESSES, deltas, ...moments };
}

async function proveSliderName(browser: Browser, run: LessonRun) {
  const lab = await open(browser, run);
  await lab.command({ type: 'play', lesson: 'shot' });
  await lab.waitForPlayedBeats(beatsOf('shot'), 120_000);
  await delay(800);
  const session = await lab.page.context().newCDPSession(lab.page);
  await session.send('Accessibility.enable');
  const { nodes } = await session.send('Accessibility.getFullAXTree');
  const slider = nodes.filter((node) => node.role?.value === 'slider').map((node) => ({ name: node.name?.value, value: node.value?.value, valueText: node.properties?.find((property) => property.name === 'valuetext')?.value?.value, live: node.properties?.find((property) => property.name === 'live')?.value?.value, attribute: null as string | null }));
  for (const entry of slider) entry.attribute = await lab.page.locator('.board-slider input').first().getAttribute('aria-valuetext');
  const liveRegions = nodes.filter((node) => !node.ignored && ['status', 'log', 'alert'].includes(node.role?.value as string)).length;
  const boardLive = await lab.page.evaluate(() => document.querySelectorAll('[data-testid="board"] output, [data-testid="board"] [aria-live], [data-testid="board"] [role="status"]').length);
  await lab.finish();
  return { label: getLabel(run), slider, liveRegions, boardLive };
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
  waves: async (browser: Browser) => [await proveWaves(browser, { lesson: 'figure-waves', viewport: 'laptop', theme: 'light' }), await proveWaves(browser, { lesson: 'figure-waves', viewport: 'phone', theme: 'dark' })],
  reuse: async (browser: Browser) => [await proveReuse(browser, { lesson: 'figure-reuse', viewport: 'laptop', theme: 'light' })],
  marks: async (browser: Browser) => [await proveMarks(browser, { lesson: 'figure-marks', viewport: 'laptop', theme: 'light' })],
  labels: async (browser: Browser) => [await proveLabels(browser, { lesson: 'figure-labels', viewport: 'laptop', theme: 'light' }), await proveLabels(browser, { lesson: 'figure-labels', viewport: 'phone', theme: 'dark' })],
  extremes: async (browser: Browser) => [await proveExtremes(browser, { lesson: 'figure-extremes', viewport: 'laptop', theme: 'light' }), await proveExtremes(browser, { lesson: 'figure-extremes', viewport: 'phone', theme: 'dark' })],
  keyboard: async (browser: Browser) => [await proveKeyPressReplay(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light' }), await proveKeyPressReplay(browser, { lesson: 'shot', viewport: 'phone', theme: 'dark' })],
  'slider-name': async (browser: Browser) => [await proveSliderName(browser, { lesson: 'shot', viewport: 'laptop', theme: 'light' })],
  resize: async (browser: Browser) => [await proveResize(browser, { lesson: 'launch', viewport: 'laptop', theme: 'light' }), await proveResize(browser, { lesson: 'free-body', viewport: 'laptop', theme: 'dark' })],
  replaced: async (browser: Browser) => [await proveReplaced(browser, { lesson: 'figure-replaced', viewport: 'laptop', theme: 'light' }), await proveReplaced(browser, { lesson: 'figure-replaced', viewport: 'phone', theme: 'dark' })],
  pair: async (browser: Browser) => [await provePair(browser, { lesson: 'figure-pair', viewport: 'laptop', theme: 'light' }), await provePair(browser, { lesson: 'figure-pair', viewport: 'phone', theme: 'dark' })],
  fine: async (browser: Browser) => [await proveFine(browser, { lesson: 'figure-fine', viewport: 'laptop', theme: 'light' }), await proveFine(browser, { lesson: 'figure-fine', viewport: 'phone', theme: 'dark' })],
} as const;

mkdirSync(args.out as string, { recursive: true });
const stack = await startLabStack();
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain', '--mute-audio'] });
const failures: string[] = [];
try {
  for (const name of (args.only ?? Object.keys(PROOFS).join(',')).split(',')) {
    const results = await PROOFS[name as keyof typeof PROOFS](browser);
    writeFileSync(join(args.out as string, `${name}.json`), `${JSON.stringify(results, null, 1)}\n`);
    failures.push(...getProofFailures(name, results));
    console.log(name, 'done');
  }
} finally {
  await browser.close();
  stack.stop();
}
exitWithVerdict(failures);
