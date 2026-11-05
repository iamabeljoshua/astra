/// <reference lib="dom" />
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

// Runs a lesson on a real page in real Chrome, stops at a word limit so a proof cannot overspend, and saves the page's audio and when each thing was done, so the pauses and gaps can be measured on what really played.
const { values: args } = parseArgs({
  options: {
    web: { type: 'string' },
    out: { type: 'string' },
    trace: { type: 'string' },
    title: { type: 'string', default: 'How a rocket escapes Earth' },
    subject: { type: 'string', default: 'Physics' },
    topic: { type: 'string', default: 'rocket-escape' },
    'most-words': { type: 'string', default: '900' },
    seconds: { type: 'string', default: '600' },
    'cut-after': { type: 'string', default: '3' },
    answer: { type: 'string', default: 'not sure, about five?' },
  },
});
if (!args.web || !args.out || !args.trace) throw new Error('Give --web, --out, and --trace.');

const OUT = args.out;
const TRACE = args.trace;
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-mock-keychain', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion', '--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });

const tapOutput = () => {
  const connect = AudioNode.prototype.connect as (...values: unknown[]) => unknown;
  const tap = { chunks: [] as number[][], startedAtEpochMs: null as number | null, sampleRate: 0 };
  (window as unknown as { audioTap: typeof tap }).audioTap = tap;
  AudioNode.prototype.connect = function (this: AudioNode, destination: unknown, ...rest: unknown[]) {
    const result = connect.call(this, destination, ...rest);
    if (destination instanceof AudioDestinationNode && !(this instanceof ScriptProcessorNode) && !(this instanceof AnalyserNode)) {
      const context = this.context as AudioContext;
      const recorder = context.createScriptProcessor(4096, 1, 1);
      recorder.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0);
        tap.startedAtEpochMs ??= performance.timeOrigin + performance.now() - (data.length / context.sampleRate) * 1000;
        tap.sampleRate = context.sampleRate;
        const out: number[] = [];
        for (let index = 0; index < data.length; index += 2) out.push(Math.round(Math.max(-1, Math.min(1, data[index] as number)) * 32767));
        tap.chunks.push(out);
      };
      connect.call(this, recorder);
      connect.call(recorder, context.destination);
    }
    return result;
  } as typeof AudioNode.prototype.connect;
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: args.web, colorScheme: 'light', permissions: ['microphone'] });
const page = await context.newPage();
const problems: string[] = [];
page.on('pageerror', (error) => problems.push(error.message));
await page.addInitScript(tapOutput);
await page.goto('/');
await page.getByRole('button', { name: 'Development sign-in' }).click();
await page.getByRole('button', { name: 'maya@astra.test' }).click();
const box = page.getByRole('textbox', { name: 'What do you want to learn next' });
await box.waitFor({ timeout: 60_000 });
await delay(1000);
if (args.topic) {
  await page.route('**/api/sessions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.continue({ postData: JSON.stringify({ title: args.title, subject: args.subject, language: 'en', topicId: args.topic }) });
  });
}
const startedAtEpochMs = Date.now();
await box.fill(args.title as string);
await page.getByRole('button', { name: 'Start session' }).click();
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
if (args.topic) await page.unroute('**/api/sessions');
await page.screenshot({ path: join(OUT, 'start.png') });

const readRows = () =>
  readdirSync(TRACE)
    .filter((name) => name.endsWith('.jsonl') && statSync(join(TRACE, name)).mtimeMs >= startedAtEpochMs)
    .flatMap((name) => readFileSync(join(TRACE, name), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { name: string; words?: number; kind?: string }));

const getOpenTask = () =>
  page.evaluate(() => {
    const voice = (window as unknown as { astraVoice?: { getBoardNow(): { board: { elements: Map<string, { content: Record<string, unknown>; progress?: { isOpen?: boolean } }> } } } }).astraVoice;
    if (!voice) return null;
    const open = [...voice.getBoardNow().board.elements.values()].filter(({ content, progress }) => content.kind === 'task' && progress?.isOpen).at(-1);
    return open ? String(open.content.id) : null;
  }).catch(() => null);

const typeLine = async (words: string) => {
  await page.getByRole('textbox').first().fill(words).catch(() => {});
  await page.getByRole('textbox').first().press('Enter').catch(() => {});
};

// A hidden page lets the tutor finish its sentence and start nothing new, so a proof never pays for a reply nobody measures.
const hideThePage = () =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

const isReplyFinished = (row: { name: string; kind?: string }) => row.name === 'turnFinished' && row.kind === 'reply';

const waitForTheReplyToEnd = async (finishedBefore: number) => {
  const giveUpAtMs = Date.now() + 40_000;
  while (Date.now() < giveUpAtMs && readRows().filter(isReplyFinished).length <= finishedBefore) await delay(200);
  await delay(1500);
};

const said: { atEpochMs: number; words: string; why: string }[] = [];
const targetWords = Number(args['most-words']);
const cutAfter = Number(args['cut-after']);
const limitAtMs = startedAtEpochMs + Number(args.seconds) * 1000;
const tasksSeen = new Set<string>();
let wasCut = false;
let stoppedBecause = 'time';
while (Date.now() < limitAtMs) {
  await delay(300);
  const rows = readRows();
  const repliesStarted = rows.filter((row) => row.name === 'firstFrameCaptured').length;
  if (!wasCut && repliesStarted >= cutAfter + 2) {
    wasCut = true;
    await delay(9000);
    const atEpochMs = Date.now();
    await typeLine('hold on, why is that?');
    said.push({ atEpochMs, words: 'hold on, why is that?', why: 'a cut mid sentence' });
  }
  const task = await getOpenTask();
  if (task && !tasksSeen.has(task)) {
    tasksSeen.add(task);
    if (tasksSeen.size % 2 === 0) {
      await delay(7000);
      await typeLine(args.answer as string);
      said.push({ atEpochMs: Date.now(), words: args.answer as string, why: 'an answer' });
    }
    await page.screenshot({ path: join(OUT, `task-${tasksSeen.size}.png`) });
  }
  const words = rows.filter((row) => row.name === 'turnWritten').reduce((sum, row) => sum + (row.words ?? 0), 0);
  if (words >= targetWords) {
    stoppedBecause = `words ${words}`;
    await hideThePage();
    await waitForTheReplyToEnd(rows.filter(isReplyFinished).length);
    break;
  }
}
await page.screenshot({ path: join(OUT, 'end.png') });
const recording = await page.evaluate(() => {
  const tap = (window as unknown as { audioTap: { chunks: number[][]; startedAtEpochMs: number | null; sampleRate: number } }).audioTap;
  const samples = new Int16Array(tap.chunks.flat());
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
  return { base64: btoa(binary), startedAtEpochMs: tap.startedAtEpochMs, sampleRate: tap.sampleRate };
});
writeFileSync(join(OUT, 'page-output.pcm'), Buffer.from(recording.base64, 'base64'));
writeFileSync(join(OUT, 'page-facts.json'), JSON.stringify({ startedAtEpochMs, stoppedBecause, tapStartedAtEpochMs: recording.startedAtEpochMs, tapSampleRate: recording.sampleRate ? recording.sampleRate / 2 : 0, said, problems }));
await browser.close();
console.log('WARM_LESSON_DONE', stoppedBecause);
process.exit(0);
