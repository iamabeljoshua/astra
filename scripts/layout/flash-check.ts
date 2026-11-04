/// <reference lib="dom" />
import type { CDPSession, Page } from 'playwright';
import { getMostFlashesInASecond, getSmallestFlashChange, type LuminanceSample } from '../../apps/web/src/lab/deck/flashes.ts';

const SIZE = { width: 760, height: 752 };
const VIEWPORT = { width: 1366, height: 800 };
const MOST_FLASHES_IN_A_SECOND = 3;
const FRAME_MS = 50;
/** A quarter of each side, which keeps the mean and takes a tenth of the time. */
const SHOT_SCALE = 0.25;
const SHOT_QUALITY = 60;
const AFTER_LAST_COMMAND_MS = 900;
/** The fastest a tutor can go, which is what a flash needs. */
const STROBES = /strobe/;
const MOST_CONTRAST = 'dark';
const THEMES = [MOST_CONTRAST, 'light'] as const;

interface Verdict {
  failures: string[];
  lines: string[];
}

// Decodes on the page, because that is the only image decoder the check has.
async function readMeanLuminance(page: Page, shots: CDPSession): Promise<number> {
  const { data: base64 } = await shots.send('Page.captureScreenshot', { format: 'jpeg', quality: SHOT_QUALITY, clip: { x: 0, y: 0, ...SIZE, scale: SHOT_SCALE } });
  return page.evaluate(async (image) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${image}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const toLinear = (level: number) => (level <= 10 ? level / 3295 : ((level / 255 + 0.055) / 1.055) ** 2.4);
    let total = 0;
    for (let index = 0; index < data.length; index += 4) total += 0.2126 * toLinear(data[index] as number) + 0.7152 * toLinear(data[index + 1] as number) + 0.0722 * toLinear(data[index + 2] as number);
    return total / (data.length / 4);
  }, base64);
}

export async function getFlashesInScene(page: Page, shots: CDPSession, { scene, lastCommandMs }: { scene: string; lastCommandMs: number }): Promise<{ flashes: number; frames: number }> {
  const samples: LuminanceSample[] = [];
  for (let atMs = 0; atMs <= lastCommandMs + AFTER_LAST_COMMAND_MS; atMs += FRAME_MS) {
    await page.evaluate((request) => window.boardDeck?.show(request), { scene, size: SIZE, atMs, mount: `flash|${scene}` });
    samples.push({ atMs, mean: await readMeanLuminance(page, shots) });
  }
  return { flashes: getMostFlashesInASecond(samples, getSmallestFlashChange(SIZE.width * SIZE.height)), frames: samples.length };
}

/** Plays each scene frame by frame on the real pixels, and counts what WCAG calls a flash. A strobe scene runs in both themes, and the rest in the one with the most contrast. */
export async function runFlashCheck(page: Page, { isQuick }: { isQuick: boolean }, verdict: Verdict): Promise<void> {
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
      const seen = await getFlashesInScene(page, shots, { scene: name, lastCommandMs: Math.max(...moments.slice(0, -1)) });
      frames += seen.frames;
      if (seen.flashes > worst.flashes) worst = { flashes: seen.flashes, scene: name, theme };
      if (seen.flashes > MOST_FLASHES_IN_A_SECOND) verdict.failures.push(`${name} in ${theme} flashes ${seen.flashes} times in one second, and the limit is ${MOST_FLASHES_IN_A_SECOND}`);
    }
  }
  await shots.detach();
  verdict.lines.push(`Flash check: ${frames} frames across ${scenes.length} scenes in ${Math.round((Date.now() - startedAtMs) / 1000)} s. Most flashes in a second: ${worst.flashes}, in ${worst.scene} ${worst.theme}`);
}
