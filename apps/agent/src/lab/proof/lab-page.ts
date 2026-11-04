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
  return lab.page.evaluate((held) => window.holdBoardFrame?.(held), frame);
}

export async function shoot(lab: LabPage, name: string): Promise<Buffer> {
  await delay(60);
  return lab.page.locator(BOARD_SELECTOR).screenshot({ path: join(lab.folder, `${name}.png`) });
}

export async function getCommandTimes(lab: LabPage): Promise<number[]> {
  return lab.page.evaluate(() => window.sceneLab?.player.getOperations().filter((operation) => operation.kind === 'command').map((operation) => operation.atMs) ?? []);
}

export async function checkReplayPixels(lab: LabPage): Promise<{ moments: number; differing: number[]; describedDifferently: number }> {
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

export async function checkStillness(lab: LabPage): Promise<{ writes: number; animations: number; imagesMatch: boolean }> {
  await delay(600);
  const before = await shoot(lab, 'still-start');
  const { writes, animations } = await lab.page.evaluate((ms) => window.pageChecks.countWritesOver(ms), QUIET_MS);
  const after = await shoot(lab, 'still-end');
  return { writes, animations, imagesMatch: before.equals(after) };
}

