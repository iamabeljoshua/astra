/// <reference lib="dom" />
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import type { LessonName } from '../lesson.ts';
import { AGENT_ROOT, delay, LIVEKIT_URL, WEB_URL } from './lab-stack.ts';

export const HIDE_DEV_BUTTON = '.tsqd-parent-container { display: none !important; }';
export const BOARD_SELECTOR = '[data-testid="board"]';
const QUIET_MS = 3000;

declare global {
  interface Window {
    pageChecks: typeof import('./graph-page-checks.ts');
  }
}

export const VIEWPORTS = { laptop: { width: 1366, height: 800 }, phone: { width: 390, height: 844 } } as const;

export type ViewportName = keyof typeof VIEWPORTS;
export type Theme = 'light' | 'dark';

export interface LabPage {
  page: Page;
  folder: string;
  command(command: object): Promise<void>;
  waitForPlayedBeats(count: number, limitMs?: number): Promise<void>;
  finish(): Promise<void>;
}

function startAgent(room: string, folder: string, voice: readonly string[]): Promise<{ child: ChildProcess; openUrl: string }> {
  const flags = ['src/lab/start-lab.ts', '--room', room, '--url', LIVEKIT_URL, '--webUrl', WEB_URL, '--out', folder, ...voice];
  const child = spawn(process.execPath, flags, { cwd: AGENT_ROOT, stdio: ['ignore', 'pipe', openSync(join(folder, 'agent.log'), 'a')] });
  const stopAgent = () => child.kill();
  process.once('exit', stopAgent);
  child.once('exit', () => process.off('exit', stopAgent));
  return new Promise((resolve, reject) => {
    child.stdout?.on('data', (data: Buffer) => {
      const match = /OPEN (\S+)/.exec(data.toString());
      if (match?.[1]) resolve({ child, openUrl: match[1] });
    });
    child.on('exit', (code) => reject(new Error(`the lab agent exited with ${code}`)));
  });
}

export interface OpenOptions {
  browser: Browser;
  name: string;
  lesson: LessonName;
  viewport: ViewportName;
  theme: Theme;
  isReducedMotion?: boolean;
  prepare?(page: Page): Promise<void>;
  outFolder: string;
  checksPath: string;
  voiceFlags?: readonly string[];
}

export async function openLabPage({ browser, name, lesson, viewport, theme, isReducedMotion, prepare, outFolder, checksPath, voiceFlags = ['--fake'] }: OpenOptions): Promise<LabPage> {
  const folder = join(outFolder, name);
  mkdirSync(folder, { recursive: true });
  const { child, openUrl } = await startAgent(`board-${name}-${Date.now()}`, folder, voiceFlags);
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
    window.pageChecks = (await import(path)) as typeof window.pageChecks;
  }, checksPath);
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

export function holdFrame(lab: LabPage, frame: { atMs: number; source: 'live' | 'replay' } | null): Promise<void> {
  return lab.page.evaluate(async (held) => {
    const page = window as unknown as { __proofIsHolding?: boolean };
    page.__proofIsHolding = true;
    window.holdBoardFrame?.(held);
    for (let frames = 0; frames < 2; frames += 1) await new Promise(requestAnimationFrame);
    page.__proofIsHolding = held !== null;
  }, frame);
}

export async function shoot(lab: LabPage, name: string): Promise<Buffer> {
  await delay(60);
  return lab.page.locator(BOARD_SELECTOR).screenshot({ path: join(lab.folder, `${name}.png`) });
}

export async function getCommandTimes(lab: LabPage): Promise<number[]> {
  return lab.page.evaluate(() => window.sceneLab?.player.getOperations().filter((operation) => operation.kind === 'command').map((operation) => operation.atMs) ?? []);
}

export interface ReplayPixels {
  moments: number;
  differing: number[];
  settledOnSecondLook: number;
  describedDifferently: number;
}

/** A repaint with no write to the page has moved 140 pixels by up to 36 levels, so a browser's raster alone can break this. The limit stays strict, and a larger difference fails until a person looks. */
const LARGEST_SETTLING_LEVELS = 2;

// Evidence for a settle rule on the page and not on the pixels, which the gate does not use yet.
async function getIsSamePage(lab: LabPage, atMs: number, shiftMs: number): Promise<boolean> {
  const readPage = () => lab.page.evaluate((selector) => document.querySelector(selector)?.outerHTML, BOARD_SELECTOR);
  await holdFrame(lab, { atMs, source: 'live' });
  const live = await readPage();
  await holdFrame(lab, { atMs: atMs + shiftMs, source: 'replay' });
  return live === (await readPage());
}

/** Compares a live moment with its replay, and looks a second time at any difference before calling it real. */
export async function lookAtMoment(lab: LabPage, atMs: number, shiftMs: number): Promise<'same' | 'settled' | 'different'> {
  const shootBoth = async () => {
    await holdFrame(lab, { atMs, source: 'live' });
    const live = await shoot(lab, 'replay-compare');
    await holdFrame(lab, { atMs: atMs + shiftMs, source: 'replay' });
    return { live, replay: await shoot(lab, 'replay-compare') };
  };
  const { live, replay } = await shootBoth();
  if (live.equals(replay)) return 'same';
  const pair: [string, string] = [live.toString('base64'), replay.toString('base64')];
  const pixels = await lab.page.evaluate(([first, second]) => window.pageChecks.countDifferentPixels([first, second, 0]), pair);
  const levels = await lab.page.evaluate((images) => window.pageChecks.getLargestChannelDifference(images), pair);
  const again = await shootBoth();
  const isSettled = again.live.equals(again.replay) && levels <= LARGEST_SETTLING_LEVELS;
  console.log(`${lab.folder} differs from its replay at ${Math.round(atMs)}: ${pixels} pixels by up to ${levels} levels, the page ${await getIsSamePage(lab, atMs, shiftMs) ? 'the same' : 'different'}, second look ${again.live.equals(again.replay) ? 'clean' : 'not clean'}, ${isSettled ? 'settled' : 'a real difference'}`);
  return isSettled ? 'settled' : 'different';
}

export async function checkReplayPixels(lab: LabPage): Promise<ReplayPixels> {
  const times = await getCommandTimes(lab);
  const { shiftMs, firstLive } = await lab.page.evaluate(() => {
    const operations = window.sceneLab?.player.getOperations() ?? [];
    const liveStart = operations.find((operation) => operation.kind === 'beatStarted')?.atMs ?? 0;
    const logStart = (window.sceneLab?.records.log[0] as { atMs: number } | undefined)?.atMs ?? 0;
    return { shiftMs: logStart - liveStart, firstLive: liveStart };
  });
  const moments = times.flatMap((atMs) => [atMs + 30, atMs + 200, atMs + 450, atMs + 800]).filter((atMs) => atMs >= firstLive);
  const differing: number[] = [];
  let settledOnSecondLook = 0;
  let describedDifferently = 0;
  for (const atMs of moments) {
    const look = await lookAtMoment(lab, atMs, shiftMs);
    if (look === 'settled') settledOnSecondLook += 1;
    if (look === 'different') differing.push(Math.round(atMs));
    const isSame = await lab.page.evaluate(([liveMs, replayMs]) => JSON.stringify(window.sceneLab?.describeLive(liveMs as number)) === JSON.stringify(window.sceneLab?.describeReplay(replayMs as number)), [atMs, atMs + shiftMs]);
    if (!isSame) describedDifferently += 1;
  }
  await holdFrame(lab, null);
  return { moments: moments.length, differing, settledOnSecondLook, describedDifferently };
}

export const getReplaySummary = ({ moments, differing, settledOnSecondLook, describedDifferently }: ReplayPixels) => ({ moments, differing: differing.length, settledOnSecondLook, described: describedDifferently });

export async function checkStillness(lab: LabPage): Promise<{ writes: number; animations: number; imagesMatch: boolean }> {
  await delay(600);
  const before = await shoot(lab, 'still-start');
  const { writes, animations } = await lab.page.evaluate((ms) => window.pageChecks.countWritesOver(ms), QUIET_MS);
  const after = await shoot(lab, 'still-end');
  if (before.equals(after)) return { writes, animations, imagesMatch: true };
  const levels = await lab.page.evaluate((images) => window.pageChecks.getLargestChannelDifference(images), [before.toString('base64'), after.toString('base64')] as [string, string]);
  const again = await shoot(lab, 'still-again');
  console.log(`${lab.folder} changed while still: up to ${levels} levels, ${writes} writes, second look ${after.equals(again) ? 'clean' : 'not clean'}`);
  return { writes, animations, imagesMatch: levels <= LARGEST_SETTLING_LEVELS && after.equals(again) };
}
