import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import type { CDPSession, Page } from 'playwright';
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
/** A 60 Hz display reports 59 and a little, so this is what "60 fps" reads as. */
const LAPTOP_FLOOR_FPS = 58;
const PHONE_FLOOR_FPS = 30;
const BASELINE_SCENE = 'physics-jump-shot';
const HEAVY_SCENES = ['mixed-every-kind', 'mixed-phone-heavy', 'hostile-many-at-once', 'hostile-widest-table', 'code-forty-lines', 'hostile-handwritten-diagram'];
const SLOWEST_THROTTLE = 12;
const LAST_SECONDS_SHARE = 0.5;
const THROTTLE_SEEN_SHARE = 0.5;

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

const setThrottle = (throttle: CDPSession, rate: number) => throttle.send('Emulation.setCPUThrottlingRate', { rate });

function timeFixedTask(page: Page): Promise<number> {
  return page.evaluate(() => {
    const startedAtMs = performance.now();
    let total = 0;
    for (let step = 0; step < 30_000_000; step += 1) total += step % 7;
    return total >= 0 ? performance.now() - startedAtMs : 0;
  });
}

async function proveThrottleReached(page: Page, throttle: CDPSession, verdict: Verdict): Promise<void> {
  const fullSpeedMs = await timeFixedTask(page);
  await setThrottle(throttle, PHONE_THROTTLE);
  const slowedMs = await timeFixedTask(page);
  await setThrottle(throttle, NO_THROTTLE);
  verdict.lines.push(`A fixed task took ${Math.round(fullSpeedMs)} ms at full speed and ${Math.round(slowedMs)} ms at ${PHONE_THROTTLE}x slower`);
  if (slowedMs < fullSpeedMs * THROTTLE_SEEN_SHARE * PHONE_THROTTLE) verdict.failures.push('the CPU throttle did not reach the page, so these rates say nothing about a phone');
}

const play = (page: Page, request: PlayRequest): Promise<PlayResult> => page.evaluate((asked) => (window.boardDeck as NonNullable<Window['boardDeck']>).play(asked), request);

function getRate({ frameTimesMs }: PlayResult): { fps: number; worstFrameMs: number } {
  const gaps = frameTimesMs.slice(1).map((atMs, index) => atMs - (frameTimesMs[index] as number));
  const spanMs = (frameTimesMs.at(-1) as number) - (frameTimesMs[0] as number);
  return { fps: Number(((gaps.length * 1000) / spanMs).toFixed(1)), worstFrameMs: Math.round(Math.max(...gaps)) };
}

async function playAt(page: Page, shared: CDPSession, { scene, size, throttle, tier, board }: { scene: string; size: { width: number; height: number }; throttle: number; tier: 0 | 1 | 2; board: string }): Promise<RateRow> {
  await setThrottle(shared, throttle);
  const result = await play(page, { scene, size, limitMs: LIMIT_MS, tier });
  await setThrottle(shared, NO_THROTTLE);
  return { scene, board, throttle, tier, ...getRate(result), loadAverage: Number((loadavg()[0] as number).toFixed(1)) };
}

async function runInterleaved(page: Page, throttle: CDPSession, scenes: readonly string[]): Promise<RateRow[]> {
  const rows: RateRow[] = [];
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    for (const scene of scenes) {
      rows.push(await playAt(page, throttle, { scene, size: LAPTOP, throttle: NO_THROTTLE, tier: 0, board: 'laptop' }));
      rows.push(await playAt(page, throttle, { scene, size: PHONE, throttle: PHONE_THROTTLE, tier: 2, board: 'phone' }));
    }
  }
  return rows;
}

const describeRuns = (rates: readonly number[]) => `${Math.min(...rates)} to ${Math.max(...rates)} fps`;

function judgeRows(rows: readonly RateRow[], verdict: Verdict): void {
  for (const scene of new Set(rows.map((row) => row.scene))) {
    const laptop = rows.filter((row) => row.scene === scene && row.board === 'laptop').map((row) => row.fps);
    const phone = rows.filter((row) => row.scene === scene && row.board === 'phone').map((row) => row.fps);
    verdict.lines.push(`${scene}: laptop ${describeRuns(laptop)}, phone at ${PHONE_THROTTLE}x slower on its lowest tier ${describeRuns(phone)}`);
    if (Math.max(...laptop) < LAPTOP_FLOOR_FPS) verdict.failures.push(`${scene} never reached ${LAPTOP_FLOOR_FPS} fps on the laptop board`);
    if (Math.max(...phone) < PHONE_FLOOR_FPS) verdict.failures.push(`${scene} never reached ${PHONE_FLOOR_FPS} fps on the phone board at its lowest tier`);
  }
  const loads = rows.map((row) => row.loadAverage);
  verdict.lines.push(`Load average during these runs: ${Math.min(...loads)} to ${Math.max(...loads)}`);
}

async function proveTierDrop(page: Page, throttle: CDPSession, outFolder: string, verdict: Verdict): Promise<object> {
  await setThrottle(throttle, SLOWEST_THROTTLE);
  const result = await play(page, { scene: 'mixed-phone-heavy', size: PHONE, limitMs: LIMIT_MS * 2, tier: null });
  await page.locator(BOARD).screenshot({ path: join(outFolder, PHONE_SHOT_NAME) });
  await setThrottle(throttle, NO_THROTTLE);
  const lastShare = result.frameTimesMs.slice(Math.floor(result.frameTimesMs.length * (1 - LAST_SECONDS_SHARE)));
  const proof = { throttle: SLOWEST_THROTTLE, tierChanges: result.tierChanges, fpsOverall: getRate(result).fps, fpsLastHalf: getRate({ frameTimesMs: lastShare, tierChanges: [] }).fps };
  verdict.lines.push(`Tier watch at ${SLOWEST_THROTTLE}x slower: ${JSON.stringify(result.tierChanges)}, ${proof.fpsOverall} fps over all and ${proof.fpsLastHalf} fps in the last half`);
  if (result.tierChanges.length === 0) verdict.failures.push(`the board held its tier at ${SLOWEST_THROTTLE}x slower`);
  return proof;
}

export async function runFrameRates(browser: DeckBrowser, url: string, { outFolder, scenes }: { outFolder: string; scenes?: readonly string[] }, verdict: Verdict): Promise<void> {
  mkdirSync(outFolder, { recursive: true });
  const page = await browser.openDeck(url);
  const throttle = await page.context().newCDPSession(page);
  await proveThrottleReached(page, throttle, verdict);
  const rows = await runInterleaved(page, throttle, [BASELINE_SCENE, ...(scenes ?? HEAVY_SCENES)]);
  judgeRows(rows, verdict);
  const tierDrop = await proveTierDrop(page, throttle, outFolder, verdict);
  await throttle.detach();
  writeFileSync(join(outFolder, 'frame-rates.json'), JSON.stringify({ rows, tierDrop }, null, 1));
}
