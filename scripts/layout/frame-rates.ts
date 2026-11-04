import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { PlayRequest, PlayResult } from '../../apps/web/src/lab/deck/deckSweep.ts';
import type { DeckBrowser } from './deck-server.ts';

const BOARD = '[data-testid="board"]';
const LAPTOP = { width: 760, height: 752 };
const PHONE = { width: 358, height: 506 };
const PHONE_SHOT_NAME = 'm3-5-tier.png';
const NO_THROTTLE = 1;
/** A mid-range phone against this laptop, which is what Lighthouse uses for its mobile runs. */
const PHONE_THROTTLE = 4;
const REPEATS = 3;
const LIMIT_MS = 6000;
const LAPTOP_FLOOR_FPS = 58;
const PHONE_FLOOR_FPS = 30;
/** M3.2's own board content, the scene its frame rate came from. It leads each pair as the baseline. */
const BASELINE_SCENE = 'physics-jump-shot';
const HEAVY_SCENES = ['mixed-every-kind', 'mixed-phone-heavy', 'hostile-many-at-once', 'hostile-widest-table', 'code-forty-lines', 'hostile-handwritten-diagram'];
/** Far past any phone, so the watch has something to answer however quiet the laptop is. */
const SLOWEST_THROTTLE = 12;
const LAST_SECONDS_SHARE = 0.5;

interface Verdict {
  failures: string[];
  lines: string[];
}

interface RateRow {
  scene: string;
  board: string;
  throttle: number;
  tier: number;
  fps: number;
  worstFrameMs: number;
  loadAverage: number;
}

async function setThrottle(page: Page, context: BrowserContext, rate: number): Promise<void> {
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
  await session.detach();
}

const play = (page: Page, request: PlayRequest): Promise<PlayResult> => page.evaluate((asked) => (window.boardDeck as NonNullable<Window['boardDeck']>).play(asked), request);

function getRate({ frameTimesMs }: PlayResult): { fps: number; worstFrameMs: number } {
  const gaps = frameTimesMs.slice(1).map((atMs, index) => atMs - (frameTimesMs[index] as number));
  const spanMs = (frameTimesMs.at(-1) as number) - (frameTimesMs[0] as number);
  return { fps: Number(((gaps.length * 1000) / spanMs).toFixed(1)), worstFrameMs: Math.round(Math.max(...gaps)) };
}

async function playAt(page: Page, context: BrowserContext, { scene, size, throttle, tier, board }: { scene: string; size: { width: number; height: number }; throttle: number; tier: 0 | 1 | 2; board: string }): Promise<RateRow> {
  await setThrottle(page, context, throttle);
  const result = await play(page, { scene, size, limitMs: LIMIT_MS, tier });
  await setThrottle(page, context, NO_THROTTLE);
  return { scene, board, throttle, tier, ...getRate(result), loadAverage: Number((loadavg()[0] as number).toFixed(1)) };
}

async function runInterleaved(page: Page, context: BrowserContext, scenes: readonly string[]): Promise<RateRow[]> {
  const rows: RateRow[] = [];
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    for (const scene of scenes) {
      rows.push(await playAt(page, context, { scene, size: LAPTOP, throttle: NO_THROTTLE, tier: 0, board: 'laptop' }));
      rows.push(await playAt(page, context, { scene, size: PHONE, throttle: PHONE_THROTTLE, tier: 2, board: 'phone' }));
    }
  }
  return rows;
}

const getMedian = (values: readonly number[]) => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)] as number;

function judgeRows(rows: readonly RateRow[], verdict: Verdict): void {
  for (const scene of new Set(rows.map((row) => row.scene))) {
    const laptop = getMedian(rows.filter((row) => row.scene === scene && row.board === 'laptop').map((row) => row.fps));
    const phone = getMedian(rows.filter((row) => row.scene === scene && row.board === 'phone').map((row) => row.fps));
    verdict.lines.push(`${scene}: laptop ${laptop} fps, phone at ${PHONE_THROTTLE}x slower on its lowest tier ${phone} fps`);
    if (laptop < LAPTOP_FLOOR_FPS) verdict.failures.push(`${scene} ran at ${laptop} fps on the laptop board, under ${LAPTOP_FLOOR_FPS}`);
    if (phone < PHONE_FLOOR_FPS) verdict.failures.push(`${scene} ran at ${phone} fps on the phone board at its lowest tier, under ${PHONE_FLOOR_FPS}`);
  }
}

// Played on a measured tier so the board has to choose, with the frame rate before and after each drop.
async function proveTierDrop(page: Page, context: BrowserContext, outFolder: string, verdict: Verdict): Promise<object> {
  await setThrottle(page, context, SLOWEST_THROTTLE);
  const result = await play(page, { scene: 'mixed-phone-heavy', size: PHONE, limitMs: LIMIT_MS * 2, tier: null });
  await page.locator(BOARD).screenshot({ path: join(outFolder, PHONE_SHOT_NAME) });
  await setThrottle(page, context, NO_THROTTLE);
  const lastShare = result.frameTimesMs.slice(Math.floor(result.frameTimesMs.length * (1 - LAST_SECONDS_SHARE)));
  const proof = { throttle: SLOWEST_THROTTLE, tierChanges: result.tierChanges, fpsOverall: getRate(result).fps, fpsLastHalf: getRate({ frameTimesMs: lastShare, tierChanges: [] }).fps };
  verdict.lines.push(`Tier watch at ${SLOWEST_THROTTLE}x slower: ${JSON.stringify(result.tierChanges)}, ${proof.fpsOverall} fps over all and ${proof.fpsLastHalf} fps in the last half`);
  if (result.tierChanges.length === 0) verdict.failures.push(`the board held its tier at ${SLOWEST_THROTTLE}x slower`);
  return proof;
}

/** Plays the deck's heaviest scenes against the real clock, with each scene's phone run right after its laptop run, so load on this machine falls on both. */
export async function runFrameRates(browser: DeckBrowser, url: string, { outFolder, scenes }: { outFolder: string; scenes?: readonly string[] }, verdict: Verdict): Promise<void> {
  mkdirSync(outFolder, { recursive: true });
  const page = await browser.openDeck(url);
  const context = page.context();
  const rows = await runInterleaved(page, context, [BASELINE_SCENE, ...(scenes ?? HEAVY_SCENES)]);
  judgeRows(rows, verdict);
  const tierDrop = await proveTierDrop(page, context, outFolder, verdict);
  writeFileSync(join(outFolder, 'frame-rates.json'), JSON.stringify({ rows, tierDrop }, null, 1));
}
