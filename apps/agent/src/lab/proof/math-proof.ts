/// <reference lib="dom" />
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium, type Page } from 'playwright';
import { type LessonName, LESSONS } from '../lesson.ts';
import { AGENT_ROOT, delay, LIVEKIT_URL, startLabStack, WEB_URL } from './lab-stack.ts';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '/tmp/m3-3-proof' },
    only: { type: 'string' },
    look: { type: 'boolean', default: false },
    viewport: { type: 'string', default: 'laptop' },
    theme: { type: 'string', default: 'light' },
  },
});

const lessonBeats = (lesson: LessonName) => LESSONS[lesson][0]?.length ?? 0;

const VIEWPORTS = { laptop: { width: 1366, height: 800 }, phone: { width: 390, height: 844 } } as const;

type ViewportName = keyof typeof VIEWPORTS;
type Theme = 'light' | 'dark';

interface LabPage {
  page: Page;
  folder: string;
  command(command: object): Promise<void>;
  waitForPlayedBeats(count: number, limitMs?: number): Promise<void>;
  finish(): Promise<void>;
}

function startAgent(room: string, folder: string): Promise<{ child: ChildProcess; openUrl: string }> {
  const flags = ['src/lab/start-lab.ts', '--room', room, '--url', LIVEKIT_URL, '--webUrl', WEB_URL, '--out', folder, '--fake'];
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

interface OpenOptions {
  browser: Browser;
  name: string;
  lesson: LessonName;
  viewport: ViewportName;
  theme: Theme;
  isReducedMotion?: boolean;
}

async function openLab({ browser, name, lesson, viewport, theme, isReducedMotion }: OpenOptions): Promise<LabPage> {
  const folder = join(args.out as string, name);
  mkdirSync(folder, { recursive: true });
  const { child, openUrl } = await startAgent(`math-${name}-${Date.now()}`, folder);
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], reducedMotion: isReducedMotion ? 'reduce' : 'no-preference' });
  await context.addInitScript((chosen) => localStorage.setItem('theme', chosen), theme);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(name, 'page error', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(name, 'console error', message.text());
  });
  await page.goto(`${openUrl}&lesson=${lesson}`);
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('button', { name: 'Play the lesson' }).and(page.locator(':enabled')).waitFor({ timeout: 30_000 });
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

const HIDE_DEV_BUTTON = '.tsqd-parent-container { display: none !important; }';

async function holdAndShoot(lab: LabPage, atMs: number, path: string): Promise<void> {
  await lab.page.evaluate((frame) => window.holdBoardFrame?.(frame), { atMs, source: 'live' as const });
  await delay(90);
  await lab.page.screenshot({ path });
}

async function lookAtLesson(browser: Browser, lesson: LessonName, viewport: ViewportName, theme: Theme): Promise<void> {
  const lab = await openLab({ browser, name: `look-${lesson}-${viewport}-${theme}`, lesson, viewport, theme });
  await lab.page.addStyleTag({ content: HIDE_DEV_BUTTON });
  await lab.command({ type: 'play', lesson });
  await lab.waitForPlayedBeats(lessonBeats(lesson));
  await delay(800);
  const cueTimes = await lab.page.evaluate(() => window.sceneLab?.player.getOperations().filter((operation) => operation.kind === 'command').map((operation) => operation.atMs) ?? []);
  const shots = cueTimes.flatMap((atMs) => [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.1, 1.3, 1.6].map((seconds) => atMs + seconds * 1000));
  let index = 0;
  for (const atMs of shots) {
    await holdAndShoot(lab, atMs, join(lab.folder, `frame-${String(index).padStart(3, '0')}.png`));
    index += 1;
  }
  const refused = await lab.page.evaluate(() => window.sceneLab?.records.refused);
  writeFileSync(join(lab.folder, 'refused.json'), JSON.stringify(refused, null, 1));
  console.log(lesson, viewport, theme, 'cues', cueTimes.length, 'refused', JSON.stringify(refused));
  await lab.finish();
}

mkdirSync(args.out as string, { recursive: true });
const stack = await startLabStack();
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain', '--mute-audio'] });
try {
  if (args.look) await lookAtLesson(browser, (args.only ?? 'algebra') as LessonName, args.viewport as ViewportName, args.theme as Theme);
} finally {
  await browser.close();
  stack.stop();
}
process.exit(0);
