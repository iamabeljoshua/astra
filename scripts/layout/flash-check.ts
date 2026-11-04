/// <reference lib="dom" />
import type { CDPSession, Page } from 'playwright';
import type { DeckSurface } from './sweeps.ts';
import { DARKER_SIDE_LIMIT, FLASH_AREA_PX, FLASH_LUMINANCE_CHANGE, getMostFlashesInASecond, type LuminanceChange } from '../../apps/web/src/lab/deck/flashes.ts';

const SIZE = { width: 760, height: 752 };
const VIEWPORT = { width: 1366, height: 800 };
const MOST_FLASHES_IN_A_SECOND = 3;
const STROBE_FRAME_MS = 50;
/** A scene at a speaking pace needs a turn every 167 ms to pass 3 flashes a second, and this sees that. */
const SPEAKING_PACE_FRAME_MS = 100;
const SHOT_SCALE = 0.25;
const SHOT_QUALITY = 60;
const AFTER_LAST_COMMAND_MS = 900;
const STROBES = /strobe/;
/** A smooth scroll runs on the real clock and this check steps a simulated one, so its frames would catch the page at unrelated places. The real scroll is measured on its own clock below. */
const INSTANT_SCROLL = '.board-scroll { scroll-behavior: auto !important; }';
/** The boards that fill up and scroll furthest, and ordinary lessons that fill one, played on the real clock with the real scroll. */
const LONG_BOARDS = ['hostile-widest-diagram', 'hostile-widest-timeline', 'hostile-many-at-once', 'math-board-fills-up', 'mixed-board-fills-and-moves-on', 'mixed-phone-heavy', 'mixed-every-kind', 'mixed-live-whole-board'];
const THEMES = ['dark', 'light'] as const;
/** A stalled browser never answers, so a frame this late names itself and ends the run. */
const FRAME_LIMIT_MS = 60_000;

async function withinLimit<Answer>(work: Promise<Answer>, moment: string): Promise<Answer> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, refuse) => {
    timer = setTimeout(() => refuse(new Error(`the flash check got no answer in ${FRAME_LIMIT_MS} ms at ${moment}`)), FRAME_LIMIT_MS);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

interface Verdict {
  failures: string[];
  lines: string[];
}

interface ChangeLimits {
  pixelsNeeded: number;
  depth: number;
  darkerSideLimit: number;
}

async function readChange(page: Page, shots: CDPSession, limits: ChangeLimits): Promise<1 | -1 | 0> {
  const box = await page.locator('[data-testid="board"]').boundingBox();
  const { data: base64 } = await shots.send('Page.captureScreenshot', { format: 'jpeg', quality: SHOT_QUALITY, clip: { x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? SIZE.width, height: box?.height ?? SIZE.height, scale: SHOT_SCALE } });
  return page.evaluate(async ({ image, pixelsNeeded, depth, darkerSideLimit }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${image}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const toLinear = (level: number) => (level <= 10 ? level / 3295 : ((level / 255 + 0.055) / 1.055) ** 2.4);
    const luminance = Float32Array.from({ length: data.length / 4 }, (_, pixel) => 0.2126 * toLinear(data[pixel * 4] as number) + 0.7152 * toLinear(data[pixel * 4 + 1] as number) + 0.0722 * toLinear(data[pixel * 4 + 2] as number));
    const held = window as unknown as { flashTurn?: Float32Array | null };
    const turn = held.flashTurn;
    if (!turn) {
      held.flashTurn = luminance;
      return 0;
    }
    let brighter = 0;
    let darker = 0;
    luminance.forEach((now, pixel) => {
      const before = turn[pixel] as number;
      if (Math.min(now, before) >= darkerSideLimit) return;
      if (now - before >= depth) brighter += 1;
      if (before - now >= depth) darker += 1;
    });
    if (Math.max(brighter, darker) < pixelsNeeded) return 0;
    held.flashTurn = luminance;
    return brighter >= darker ? 1 : -1;
  }, { image: base64, ...limits });
}

export async function getFlashesInScene(page: Page, shots: CDPSession, { scene, lastCommandMs, frameMs = STROBE_FRAME_MS, size = SIZE }: { scene: string; lastCommandMs: number; frameMs?: number; size?: { width: number; height: number } }): Promise<{ flashes: number; frames: number }> {
  const changes: LuminanceChange[] = [];
  const limits = { pixelsNeeded: Math.ceil(FLASH_AREA_PX * SHOT_SCALE * SHOT_SCALE), depth: FLASH_LUMINANCE_CHANGE, darkerSideLimit: DARKER_SIDE_LIMIT };
  let frames = 0;
  await page.evaluate(() => {
    (window as unknown as { flashTurn?: null }).flashTurn = null;
  });
  for (let atMs = 0; atMs <= lastCommandMs + AFTER_LAST_COMMAND_MS; atMs += frameMs) {
    const moment = `${scene} ${atMs} ms`;
    await withinLimit(page.evaluate((request) => window.boardDeck?.show(request), { scene, size, atMs, mount: `flash|${scene}` }), moment);
    const direction = await withinLimit(readChange(page, shots, limits), moment);
    frames += 1;
    if (direction !== 0) changes.push({ atMs, direction });
  }
  return { flashes: getMostFlashesInASecond(changes), frames };
}

async function getFlashesOnTheRealClock(page: Page, shots: CDPSession, { scene, lastCommandMs, size }: { scene: string; lastCommandMs: number; size: { width: number; height: number } }): Promise<{ flashes: number; frames: number; furthestPxInASecond: number }> {
  const changes: LuminanceChange[] = [];
  const limits = { pixelsNeeded: Math.ceil(FLASH_AREA_PX * SHOT_SCALE * SHOT_SCALE), depth: FLASH_LUMINANCE_CHANGE, darkerSideLimit: DARKER_SIDE_LIMIT };
  const scrolls: { atMs: number; top: number }[] = [];
  await page.evaluate(() => {
    (window as unknown as { flashTurn?: null }).flashTurn = null;
  });
  const startedAtMs = Date.now();
  let frames = 0;
  for (let atMs = 0; atMs <= lastCommandMs + AFTER_LAST_COMMAND_MS; atMs = Date.now() - startedAtMs) {
    const moment = `${scene} ${atMs} ms on the real clock`;
    const top = await withinLimit(page.evaluate(async (request) => {
      await window.boardDeck?.show(request);
      return document.querySelector('.board-scroll')?.scrollTop ?? 0;
    }, { scene, size, atMs, mount: `real|${scene}` }), moment);
    const direction = await withinLimit(readChange(page, shots, limits), moment);
    frames += 1;
    scrolls.push({ atMs, top });
    if (direction !== 0) changes.push({ atMs, direction });
  }
  const furthestPxInASecond = Math.max(0, ...scrolls.map(({ atMs, top }) => Math.max(...scrolls.filter((other) => other.atMs >= atMs && other.atMs < atMs + 1000).map((other) => Math.abs(other.top - top)))));
  return { flashes: getMostFlashesInASecond(changes), frames, furthestPxInASecond };
}

async function runRealClockScrolls(page: Page, shots: CDPSession, scenes: readonly { name: string; moments: readonly number[] }[], verdict: Verdict): Promise<void> {
  let worst = { flashes: 0, scene: 'none', theme: 'none', furthestPxInASecond: 0 };
  let frames = 0;
  let ms = 0;
  for (const theme of THEMES) {
    await page.evaluate((chosen) => {
      document.documentElement.dataset.theme = chosen;
    }, theme);
    for (const { name, moments } of scenes.filter(({ name }) => LONG_BOARDS.includes(name))) {
      const startedAtMs = Date.now();
      const seen = await getFlashesOnTheRealClock(page, shots, { scene: name, lastCommandMs: Math.max(...moments.slice(0, -1)), size: VIEWPORT });
      frames += seen.frames;
      ms += Date.now() - startedAtMs;
      if (seen.flashes >= worst.flashes) worst = { flashes: seen.flashes, scene: name, theme, furthestPxInASecond: seen.furthestPxInASecond };
      if (seen.flashes > MOST_FLASHES_IN_A_SECOND) verdict.failures.push(`${name} in ${theme} flashes ${seen.flashes} times in one second on the real clock with its real scroll, and the limit is ${MOST_FLASHES_IN_A_SECOND}`);
    }
  }
  verdict.lines.push(`Real clock: ${LONG_BOARDS.length} long boards in both themes with the real scroll, ${frames} frames at ${Math.round((frames * 1000) / Math.max(ms, 1))} a second. Most flashes in a second: ${worst.flashes}, in ${worst.scene} ${worst.theme}, which scrolled ${Math.round(worst.furthestPxInASecond)} px in its fastest second`);
}

export async function runFlashCheck(page: Page, { isQuick, surface, only }: { isQuick: boolean; surface: DeckSurface; only?: readonly string[] }, verdict: Verdict): Promise<void> {
  const startedAtMs = Date.now();
  await page.setViewportSize(VIEWPORT);
  const shots = await page.context().newCDPSession(page);
  const instantScroll = await page.addStyleTag({ content: INSTANT_SCROLL });
  const scenes = (await page.evaluate(() => window.boardDeck?.listScenes() ?? [])).filter(({ name }) => (only ? only.includes(name) : !isQuick || STROBES.test(name)));
  let frames = 0;
  let worst = { flashes: 0, scene: 'none', theme: 'none' };
  for (const theme of THEMES) {
    await page.evaluate((chosen) => {
      document.documentElement.dataset.theme = chosen;
    }, theme);
    for (const { name, moments } of scenes) {
      const seen = await getFlashesInScene(page, shots, { scene: name, lastCommandMs: Math.max(...moments.slice(0, -1)), frameMs: STROBES.test(name) ? STROBE_FRAME_MS : SPEAKING_PACE_FRAME_MS, size: surface === 'rows' ? VIEWPORT : SIZE });
      frames += seen.frames;
      if (seen.flashes > worst.flashes) worst = { flashes: seen.flashes, scene: name, theme };
      if (seen.flashes > MOST_FLASHES_IN_A_SECOND) verdict.failures.push(`${name} in ${theme} flashes ${seen.flashes} times in one second, and the limit is ${MOST_FLASHES_IN_A_SECOND}`);
    }
  }
  verdict.lines.push(`Flash check: ${frames} frames across ${scenes.length} scenes in both themes in ${Math.round((Date.now() - startedAtMs) / 1000)} s. Most flashes in a second: ${worst.flashes}, in ${worst.scene} ${worst.theme}`);
  await instantScroll.evaluate((style) => style.remove());
  if (!isQuick && surface === 'rows') await runRealClockScrolls(page, shots, scenes, verdict);
  await shots.detach();
}
