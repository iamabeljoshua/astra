/// <reference lib="dom" />
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import type { LessonName } from '../lesson.ts';
import { AGENT_ROOT, LIVEKIT_URL, WEB_URL } from './lab-stack.ts';

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
  process.once('exit', () => child.kill());
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
  /** Flags that pick the tutor's voice for the lab agent. */
  voice?: readonly string[];
  isRecording?: boolean;
}

export async function openLabPage({ browser, name, lesson, viewport, theme, isReducedMotion, prepare, outFolder, checksPath, voice = ['--fake'] }: OpenOptions): Promise<LabPage> {
  const folder = join(outFolder, name);
  mkdirSync(folder, { recursive: true });
  const { child, openUrl } = await startAgent(`board-${name}-${Date.now()}`, folder, voice);
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
    (window as unknown as { pageChecks: unknown }).pageChecks = await import(/* @vite-ignore */ path);
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
