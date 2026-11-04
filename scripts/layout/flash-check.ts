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
/** A quarter of each side takes a tenth of the time, and a thin line of ink blends away, which WCAG's contiguous area asks for. */
const SHOT_SCALE = 0.25;
const SHOT_QUALITY = 60;
const AFTER_LAST_COMMAND_MS = 900;
const STROBES = /strobe/;
const MOST_CONTRAST = 'dark';
const THEMES = [MOST_CONTRAST, 'light'] as const;
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

// Decodes on the page, because that is the only image decoder the check has. Holds the last turning point there, and says when enough pixels have moved one way from it.
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

/** Plays each scene frame by frame and counts what WCAG calls a flash, in both themes only for a strobe scene. */
export async function runFlashCheck(page: Page, { isQuick, surface }: { isQuick: boolean; surface: DeckSurface }, verdict: Verdict): Promise<void> {
  const startedAtMs = Date.now();
  await page.setViewportSize(VIEWPORT);
  const shots = await page.context().newCDPSession(page);
  const scenes = (await page.evaluate(() => window.boardDeck?.listScenes() ?? [])).filter(({ name }) => !isQuick || STROBES.test(name));
  let frames = 0;
  let worst = { flashes: 0, scene: 'none', theme: 'none' };
  for (const theme of THEMES) {
    await page.evaluate((chosen) => {
      document.documentElement.dataset.theme = chosen;
    }, theme);
    for (const { name, moments } of scenes) {
      if (theme !== MOST_CONTRAST && !STROBES.test(name)) continue;
      const seen = await getFlashesInScene(page, shots, { scene: name, lastCommandMs: Math.max(...moments.slice(0, -1)), frameMs: STROBES.test(name) ? STROBE_FRAME_MS : SPEAKING_PACE_FRAME_MS, size: surface === 'rows' ? VIEWPORT : SIZE });
      frames += seen.frames;
      if (seen.flashes > worst.flashes) worst = { flashes: seen.flashes, scene: name, theme };
      if (seen.flashes > MOST_FLASHES_IN_A_SECOND) verdict.failures.push(`${name} in ${theme} flashes ${seen.flashes} times in one second, and the limit is ${MOST_FLASHES_IN_A_SECOND}`);
    }
  }
  await shots.detach();
  verdict.lines.push(`Flash check: ${frames} frames across ${scenes.length} scenes in ${Math.round((Date.now() - startedAtMs) / 1000)} s. Most flashes in a second: ${worst.flashes}, in ${worst.scene} ${worst.theme}`);
}
