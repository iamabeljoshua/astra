/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { saveRecording } from './voice/join-recording.ts';
import { installSpeechInPage } from './voice/speech-in-page.ts';

const VIEWPORT = { width: 1440, height: 900 };

const { values: args } = parseArgs({
  options: {
    web: { type: 'string', default: `http://127.0.0.1:${process.env.WEB_PORT ?? 6320}` },
    out: { type: 'string', default: 'tutor-proof' },
    email: { type: 'string', default: 'maya@astra.test' },
    question: { type: 'string', default: 'Why does a ball slow down as it goes up?' },
    ask: { type: 'string', multiple: true, default: [] },
    answerMs: { type: 'string', default: '12000' },
    record: { type: 'boolean', default: false },
    theme: { type: 'string', default: 'light' },
    width: { type: 'string', default: String(VIEWPORT.width) },
    height: { type: 'string', default: String(VIEWPORT.height) },
  },
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getEpochMs = () => performance.timeOrigin + performance.now();

async function signIn(page: Page): Promise<void> {
  await page.goto(`${args.web}/sign-in`);
  await page.getByRole('button', { name: 'Development sign-in' }).click();
  await page.getByRole('button', { name: args.email }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

async function askOnHome(page: Page, text: string): Promise<number> {
  const box = page.getByRole('textbox').first();
  await box.fill(text);
  await box.press('Enter');
  const sentAtMs = getEpochMs();
  await page.waitForURL(/\/sessions\/[^/]+$/);
  return sentAtMs;
}

async function askInLesson(page: Page, text: string): Promise<number> {
  const box = page.getByRole('textbox', { name: 'Your reply' });
  await box.fill(text);
  await box.press('Enter');
  return getEpochMs();
}

interface PageRecords {
  firstAudioEpochMs: Record<string, number>;
  heardEpochMs: number[];
  fired: { turnId: string; firedEpochMs: number; atWord: number }[];
  refused: string[];
}

// Drives a real lesson the way a student does, from the question on Home, and reads what the page heard and when. The agent's trace says which turn was which.
async function main(): Promise<void> {
  mkdirSync(args.out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-mock-keychain', '--mute-audio', '--use-fake-ui-for-media-stream'] });
  const viewport = { width: Number(args.width), height: Number(args.height) };
  const context = await browser.newContext({ viewport, recordVideo: args.record ? { dir: args.out, size: viewport } : undefined, colorScheme: args.theme === 'dark' ? 'dark' : 'light' });
  const videoStartedEpochMs = Date.now();
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.addInitScript(installSpeechInPage);
  await signIn(page);
  const sends: { text: string; sentEpochMs: number }[] = [{ text: args.question, sentEpochMs: await askOnHome(page, args.question) }];
  if (args.record) await page.waitForFunction(() => window.speechInPage !== undefined).then(() => page.evaluate(() => window.speechInPage.startRecording()));
  const answerMs = Number(args.answerMs);
  await delay(answerMs);
  await page.screenshot({ path: join(args.out, 'lesson-0.png') });
  for (const [index, asked] of args.ask.entries()) {
    const [, waitMs, text = asked] = /^(\d+):(.*)$/.exec(asked) ?? [];
    sends.push({ text, sentEpochMs: await askInLesson(page, text) });
    await delay(waitMs ? Number(waitMs) : answerMs);
    await page.screenshot({ path: join(args.out, `lesson-${index + 1}.png`) });
  }
  const seen = await page.evaluate(() => {
    const voice = (window as unknown as { astraVoice?: { records: PageRecords; getView(): { tutorHeard: string[] } } }).astraVoice;
    return voice ? { records: voice.records, caption: voice.getView().tutorHeard.join(' ') } : null;
  });
  writeFileSync(join(args.out, 'lesson.json'), JSON.stringify({ sends, seen, problems }, null, 1));
  const turns = Object.values(seen?.records.firstAudioEpochMs ?? {}).sort((a, b) => a - b);
  const timed = sends.map(({ text, sentEpochMs }, index) => ({ text, soundsMs: turns.filter((ms) => ms > sentEpochMs && ms < (sends[index + 1]?.sentEpochMs ?? Infinity)).map((ms) => Math.round(ms - sentEpochMs)) }));
  console.log(JSON.stringify({ timed, caption: seen?.caption, refused: seen?.records.refused, cues: seen?.records.fired.length, problems: problems.slice(0, 5) }, null, 1));
  if (args.record) await saveRecording({ page, videoStartedEpochMs, outputPath: join(args.out, 'lesson.mp4') });
  await browser.close();
}

await main();
