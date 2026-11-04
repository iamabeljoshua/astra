/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { makeRecording } from './make-recording.ts';

const TAP_RATE = 24000;
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
    shot: { type: 'string', multiple: true, default: [] },
    interruptAfterMs: { type: 'string' },
    headed: { type: 'boolean', default: false },
  },
});

interface Note {
  name: string;
  epochMs: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn(page: Page): Promise<void> {
  await page.goto(`${args.web}/sign-in`);
  await page.getByRole('button', { name: 'Development sign-in' }).click();
  await page.getByRole('button', { name: args.email }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

async function startLesson(page: Page): Promise<void> {
  const box = page.getByRole('textbox').first();
  await box.fill(args.question);
  await box.press('Enter');
  await page.waitForURL(/\/sessions\/[^/]+$/);
  await page.getByTestId('tutor-words').waitFor({ state: 'attached' });
}

async function askInLesson(page: Page, text: string, waitMs: number): Promise<void> {
  const box = page.getByRole('textbox', { name: 'Your reply' });
  await box.fill(text);
  await box.press('Enter');
  await delay(waitMs);
}

function summarise(notes: readonly Note[]) {
  const typed = notes.filter((note) => note.name === 'typedSent');
  return typed.map((send, index) => {
    const nextSendMs = typed[index + 1]?.epochMs ?? Infinity;
    const during = notes.filter((note) => note.epochMs > send.epochMs && note.epochMs < nextSendMs);
    const onsets = during.filter((note) => note.name === 'audioOnset').map((note) => Math.round(note.epochMs - send.epochMs));
    const firstCue = during.find((note) => note.name === 'cueFired');
    return { onsetsMs: onsets, firstCueMs: firstCue ? Math.round(firstCue.epochMs - send.epochMs) : null, cues: during.filter((note) => note.name === 'cueFired').length };
  });
}

// Drives a real lesson the way a student does: sign in, ask on Home, and type in the session, then reads what the page heard and when.
async function main(): Promise<void> {
  mkdirSync(args.out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: !args.headed, args: ['--use-mock-keychain', '--mute-audio'] });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  if (args.record) await page.addInitScript('window.astraRecordLesson = true');
  const cdp = await context.newCDPSession(page);
  const frames: { epochMs: number; data: string }[] = [];
  if (args.record) {
    cdp.on('Page.screencastFrame', (frame) => {
      frames.push({ epochMs: (frame.metadata.timestamp ?? 0) * 1000, data: frame.data });
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    });
  }
  await signIn(page);
  if (args.record) await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  await startLesson(page);
  const answerMs = Number(args.answerMs);
  await delay(answerMs);
  await page.screenshot({ path: join(args.out, 'lesson-0.png') });
  const caption0 = await page.getByTestId('tutor-words').textContent();
  const captions = [caption0];
  for (const [index, text] of args.ask.entries()) {
    await askInLesson(page, text, answerMs);
    await page.screenshot({ path: join(args.out, `lesson-${index + 1}.png`) });
    captions.push(await page.getByTestId('tutor-words').textContent());
  }
  if (args.record) await cdp.send('Page.stopScreencast');
  const notes = await page.evaluate(() => (window as unknown as { astraLesson: { notes: Note[] } }).astraLesson.notes);
  writeFileSync(join(args.out, 'lesson.json'), JSON.stringify({ turns: summarise(notes), captions, problems, notes }, null, 1));
  console.log(JSON.stringify({ turns: summarise(notes), captions, problems: problems.slice(0, 5) }, null, 1));
  if (args.record) {
    const taps = await page.evaluate(() => {
      const lesson = (window as unknown as { astraLesson: { pcm: { take(point: string): { firstFrame: number; base64: string } }; getGraphEpochZeroMs(): number } }).astraLesson;
      return { output: lesson.pcm.take('output'), epochAtGraphZeroMs: lesson.getGraphEpochZeroMs() };
    });
    writeFileSync(join(args.out, 'output.pcm'), Buffer.from(taps.output.base64, 'base64'));
    writeFileSync(join(args.out, 'taps.json'), JSON.stringify({ rate: TAP_RATE, outputFirstFrame: taps.output.firstFrame }));
    writeFileSync(join(args.out, 'page.json'), JSON.stringify({ clockMap: { epochAtGraphZeroMs: taps.epochAtGraphZeroMs } }));
    writeFileSync(join(args.out, 'screencast.json'), JSON.stringify(frames));
    makeRecording(args.out, join(args.out, 'lesson.mp4'));
  }
  await browser.close();
}

await main();
