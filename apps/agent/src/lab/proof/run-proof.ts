/// <reference lib="dom" />
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, firefox, webkit, type Browser, type CDPSession, type Page } from 'playwright';
import { type Beat, getBeatText } from '@astra/contracts';
import { LESSON, type LessonName, LESSONS } from '../lesson.ts';
import { getPercentiles } from './analyse-run.ts';
import { AGENT_ROOT, delay, LIVEKIT_UDP_PORT, LIVEKIT_URL, NETWORKS, type NetworkProfile, RELAY_PORT, routeThroughRelay, startLabStack, startRelay, WEB_URL } from './lab-stack.ts';
import { type BoardDescription, type PageRecords, summariseRun } from './summarise-run.ts';

declare global {
  interface Window {
    sceneLab?: {
      records: PageRecords & { clockKind: string; boardProblems: object[] };
      pcm: { take(point: 'arriving' | 'output'): { firstFrame: number; base64: string } } | null;
      player: { getCaption(): string; getNowMs(): number; getOperations(): { kind: string; atMs: number }[] };
      command(command: object): void;
      describeLive(atMs: number): BoardDescription;
      describeReplay(atMs: number): BoardDescription;
    };
  }
}

const TAP_RATE = 24000;
const READY_LIMIT_MS = 30_000;
const SAY_READY_LIMIT_MS = 180_000;
const CREDITS_PER_CHARACTER = 0.22;
const CREDIT_LIMIT = 6000;

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    out: { type: 'string', default: '/tmp/m3-2-proof' },
    fake: { type: 'boolean', default: false },
    say: { type: 'boolean', default: false },
    model: { type: 'string', default: 'eleven_flash_v2_5' },
    stored: { type: 'string' },
    screencast: { type: 'boolean', default: false },
    browser: { type: 'string', default: 'chromium' },
    theme: { type: 'string', default: 'light' },
  },
});

interface Scenario {
  network?: NetworkProfile;
  throttle?: number;
  phone?: boolean;
  drive(run: RunContext): Promise<void>;
  proofStalls?: { atAudioMs: number; ms: number }[];
  textPace?: { msPerWord: number; flushBeforeCues: boolean };
  cueEveryWords?: number;
  repeats?: number;
  resumeAfterMs?: number;
  usesStoredPhrase?: boolean;
  lesson?: LessonName;
  /** Placing every word of many cut turns takes minutes, and these runs measure only their stops. */
  onlyStops?: boolean;
}

interface RunContext {
  page: Page;
  folder: string;
  command(command: object): Promise<void>;
  waitForPlayedBeats(count: number, limitMs?: number): Promise<void>;
  scenario: Scenario;
}

const beatsOf = (lessonTurn: number) => LESSON[lessonTurn]?.length ?? 0;

async function playWholeLesson({ command, waitForPlayedBeats, scenario }: RunContext): Promise<void> {
  const { textPace, cueEveryWords, proofStalls } = scenario;
  await command({ type: 'play', lessonTurn: 0, textPace, cueEveryWords, proofStalls });
  await waitForPlayedBeats(beatsOf(0));
  await delay(1500);
  await command({ type: 'play', lessonTurn: 1, textPace, cueEveryWords });
  await waitForPlayedBeats(beatsOf(0) + beatsOf(1));
  await delay(600);
}

async function playMathLesson({ command, waitForPlayedBeats, scenario }: RunContext): Promise<void> {
  const lesson = scenario.lesson as LessonName;
  await command({ type: 'play', lesson, cueEveryWords: scenario.cueEveryWords });
  await waitForPlayedBeats(LESSONS[lesson][0]?.length ?? 0);
  await delay(1500);
}

const SLIDER_DRAG_STEPS = 24;
const SHOT_SLIDER = { start: 4.2, doubled: 8.4, max: 10, thumbWidth: 10 };

async function playShotAndDragSlider({ page, command, waitForPlayedBeats }: RunContext): Promise<void> {
  await command({ type: 'play', lesson: 'shot' });
  await waitForPlayedBeats(LESSONS.shot[0]?.length ?? 0, 120_000);
  await delay(1200);
  const slider = page.locator('.board-slider input');
  const box = (await slider.boundingBox()) as { x: number; y: number; width: number; height: number };
  const getThumbX = (value: number) => box.x + SHOT_SLIDER.thumbWidth / 2 + (value / SHOT_SLIDER.max) * (box.width - SHOT_SLIDER.thumbWidth);
  await page.mouse.move(getThumbX(SHOT_SLIDER.start), box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= SLIDER_DRAG_STEPS; step += 1) {
    await page.mouse.move(getThumbX(SHOT_SLIDER.start + ((SHOT_SLIDER.doubled - SHOT_SLIDER.start) * step) / SLIDER_DRAG_STEPS), box.y + box.height / 2);
    await delay(40);
  }
  await page.mouse.up();
  await delay(2500);
}

async function playStoredMathThreeTimes({ command, waitForPlayedBeats }: RunContext): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await command({ type: 'play', isStockMath: true });
    await waitForPlayedBeats(attempt);
    await delay(1600);
  }
}

async function playFirstTurn({ command, waitForPlayedBeats, scenario: { cueEveryWords, repeats = 1 } }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0, repeats, cueEveryWords });
  await waitForPlayedBeats(beatsOf(0) * repeats, 120_000);
  await delay(600);
}

async function playNextTurnOnFinished({ page, command }: RunContext): Promise<void> {
  await command({ type: 'play', isStockPhrase: true });
  await waitForAudioSent(page, 1);
  await command({ type: 'play', isStockPhrase: true });
  await waitForAudioSent(page, 2);
  await delay(1500);
}

async function resumeRightAfterStop({ page, command }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0 });
  await waitForFirstSoundOfNewTurn(page);
  await delay(1500);
  await command({ type: 'interrupt' });
  await delay(30);
  await command({ type: 'resume' });
  await waitForAudioSent(page, 2);
  await delay(1500);
}

const STOCK_STOPS = 2;

async function interruptStockPhrase({ page, command }: RunContext): Promise<void> {
  for (let attempt = 1; attempt <= STOCK_STOPS; attempt += 1) {
    await command({ type: 'play', isStockPhrase: true });
    await page.waitForFunction((count) => window.sceneLab?.records.agentMessages.filter((message) => message.type === 'turnStarted').length === count, attempt);
    await waitForFirstSoundOfNewTurn(page);
    await delay(500);
    await command({ type: 'interrupt' });
    await delay(1400);
  }
}

async function playStockPhraseThreeTimes({ command, waitForPlayedBeats }: RunContext): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await command({ type: 'play', isStockPhrase: true });
    await waitForPlayedBeats(attempt);
    await delay(800);
  }
}

async function playWithWordsLate({ command, waitForPlayedBeats }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0, wordsLateMs: WORDS_LATE_MS });
  await waitForPlayedBeats(beatsOf(0));
  await delay(600);
}

const INTERRUPT_AFTER_MS = [900, 1700, 2600, 3400, 4300];

async function interruptFiveTimes({ page, command, folder, scenario: { resumeAfterMs = 1400 } }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0 });
  for (const [index, afterMs] of INTERRUPT_AFTER_MS.entries()) {
    await waitForFirstSoundOfNewTurn(page);
    await delay(afterMs);
    await command({ type: 'interrupt' });
    await delay(resumeAfterMs);
    if (resumeAfterMs > 100) await page.screenshot({ path: join(folder, `interrupted-${index + 1}.png`) });
    await command({ type: 'resume' });
  }
  await waitForAudioSent(page, INTERRUPT_AFTER_MS.length + 1);
  await delay(1500);
}

async function waitForFirstSoundOfNewTurn(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const records = window.sceneLab?.records;
    if (!records) return false;
    const lastTurn = records.agentMessages.filter((message) => message.type === 'turnStarted').at(-1);
    return lastTurn !== undefined && records.probe.some((event) => event.where === 'arriving' && event.kind === 'onset' && event.atMs >= lastTurn.atMs - 300);
  }, undefined, { timeout: 15_000 });
}

// On a poor link the agent's copy of the log lands after the browser's last report, and replay reads that copy.
async function waitForLogToCatchUp(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const records = window.sceneLab?.records;
    return records !== undefined && records.log.length >= records.browserMessages.filter((message) => message.type === 'played' || message.type === 'boardFrozen').length;
  }, undefined, { timeout: 15_000 });
}

async function waitForAudioSent(page: Page, turnCount: number): Promise<void> {
  await page.waitForFunction((count) => (window.sceneLab?.records.turnsSent.length ?? 0) >= count, turnCount, { timeout: 60_000 });
}

// The steps that once opened a third turn over the first and killed the agent, because stopping the queued turn freed the line.
async function stopQueuedTurn({ page, command }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0 });
  await waitForFirstSoundOfNewTurn(page);
  await delay(800);
  await command({ type: 'play', isStockPhrase: true });
  await delay(200);
  await command({ type: 'interrupt' });
  await delay(50);
  await command({ type: 'play', isStockPhrase: true });
  await waitForAudioSent(page, 3);
  await delay(1500);
}

/** Aimed around a phrase start in Chris's stored take, where a word in the old audio is likeliest to arrive after its stop. */
const AIMED_STOPS_MS = [650, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100, 650, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100];

async function stopNearPhraseStarts({ page, command }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0 });
  for (const afterMs of AIMED_STOPS_MS) {
    await page.waitForFunction(() => {
      const records = window.sceneLab?.records;
      const lastTurn = records?.agentMessages.filter((message) => message.type === 'turnStarted').at(-1);
      return lastTurn !== undefined && records?.probe.some((event) => event.where === 'arriving' && event.kind === 'onset' && event.atMs >= lastTurn.atMs);
    }, undefined, { timeout: 15_000 });
    await delay(afterMs);
    await command({ type: 'interrupt' });
    await delay(30);
    await command({ type: 'play', lessonTurn: 0 });
    await delay(1000);
  }
  await delay(1500);
  await command({ type: 'interrupt' });
  await delay(1200);
}

const WORDS_LATE_MS = 300;

const SCENARIOS: Record<string, Scenario> = {
  clean: { drive: playWholeLesson },
  uneven: { drive: playWholeLesson, network: NETWORKS.uneven },
  poor: { drive: playWholeLesson, network: NETWORKS.poor },
  phone: { drive: playWholeLesson, throttle: 4, phone: true },
  'stall-500': { drive: playWholeLesson, proofStalls: [{ atAudioMs: 2000, ms: 500 }, { atAudioMs: 7000, ms: 500 }] },
  'stall-90': { drive: playWholeLesson, proofStalls: [{ atAudioMs: 2000, ms: 90 + 200 }, { atAudioMs: 7000, ms: 90 + 200 }] },
  model: { drive: playWholeLesson, textPace: { msPerWord: 120, flushBeforeCues: true } },
  'words-late-300': { drive: playWithWordsLate },
  stored: { drive: playStockPhraseThreeTimes, usesStoredPhrase: true },
  'math-stored': { drive: playStoredMathThreeTimes, usesStoredPhrase: true },
  'math-algebra': { drive: playMathLesson, lesson: 'algebra' },
  'math-dense': { drive: playMathLesson, lesson: 'dense' },
  'math-dense-phone': { drive: playMathLesson, lesson: 'dense', throttle: 4, phone: true },
  'math-every-word': { drive: playMathLesson, lesson: 'every-word' },
  'math-every-word-phone': { drive: playMathLesson, lesson: 'every-word', throttle: 4, phone: true },
  'math-uneven': { drive: playMathLesson, lesson: 'algebra', network: NETWORKS.uneven },
  'math-poor': { drive: playMathLesson, lesson: 'algebra', network: NETWORKS.poor },
  'math-hostile': { drive: playMathLesson, lesson: 'hostile' },
  'graph-shot': { drive: playMathLesson, lesson: 'shot' },
  'graph-shot-phone': { drive: playMathLesson, lesson: 'shot', throttle: 4, phone: true },
  'graph-shot-every-third': { drive: playMathLesson, lesson: 'shot', cueEveryWords: 3 },
  'graph-shot-every-third-phone': { drive: playMathLesson, lesson: 'shot', cueEveryWords: 3, throttle: 4, phone: true },
  'graph-shot-uneven': { drive: playMathLesson, lesson: 'shot', network: NETWORKS.uneven },
  'graph-shot-poor': { drive: playMathLesson, lesson: 'shot', network: NETWORKS.poor },
  'graph-curves': { drive: playMathLesson, lesson: 'graphs' },
  'graph-drag': { drive: playShotAndDragSlider },
  'clean-every-third': { drive: playWholeLesson, cueEveryWords: 3 },
  'uneven-every-third': { drive: playWholeLesson, cueEveryWords: 3, network: NETWORKS.uneven },
  'poor-every-third': { drive: playWholeLesson, cueEveryWords: 3, network: NETWORKS.poor },
  'long-every-third': { drive: playFirstTurn, cueEveryWords: 3, repeats: 4 },
  'next-on-finished': { drive: playNextTurnOnFinished },
  'next-on-finished-poor': { drive: playNextTurnOnFinished, network: NETWORKS.poor },
  'after-stop': { drive: resumeRightAfterStop },
  'after-stop-poor': { drive: resumeRightAfterStop, network: NETWORKS.poor },
  'stop-queued': { drive: stopQueuedTurn },
  'stop-queued-poor': { drive: stopQueuedTurn, network: NETWORKS.poor },
  'stop-near-phrase': { drive: stopNearPhraseStarts, onlyStops: true },
  'stop-near-phrase-uneven': { drive: stopNearPhraseStarts, network: NETWORKS.uneven, onlyStops: true },
  'stop-near-phrase-poor': { drive: stopNearPhraseStarts, network: NETWORKS.poor, onlyStops: true },
  'interrupt-stock': { drive: interruptStockPhrase },
  interrupt: { drive: interruptFiveTimes },
  'interrupt-tight': { drive: interruptFiveTimes, resumeAfterMs: 30 },
  'interrupt-poor': { drive: interruptFiveTimes, network: NETWORKS.poor },
  'interrupt-phone': { drive: interruptFiveTimes, throttle: 4, phone: true },
};

function readCreditsSpent(): number {
  try {
    return (JSON.parse(readFileSync(join(args.out as string, 'credits.json'), 'utf8')) as { credits: number }).credits;
  } catch {
    return 0;
  }
}

function noteCredits(characters: number): void {
  const credits = readCreditsSpent() + characters * CREDITS_PER_CHARACTER;
  writeFileSync(join(args.out as string, 'credits.json'), JSON.stringify({ credits }));
  if (credits > CREDIT_LIMIT) throw new Error(`Credit limit passed at about ${Math.round(credits)}`);
}

function getVoiceFlags(scenario: Pick<Scenario, 'usesStoredPhrase'>): string[] {
  if (args.stored) return ['--stored', args.stored];
  if (scenario.usesStoredPhrase) return ['--stored', join(args.out as string, 'stock-phrase.json')];
  if (args.say) return ['--say'];
  return args.fake ? ['--fake'] : ['--model', args.model as string, '--tap'];
}

function startAgent(room: string, folder: string, scenario: Pick<Scenario, 'usesStoredPhrase'>): Promise<{ child: ChildProcess; openUrl: string }> {
  const flags = ['src/lab/start-lab.ts', '--room', room, '--url', LIVEKIT_URL, '--webUrl', WEB_URL, '--out', folder, ...getVoiceFlags(scenario)];
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

async function collectAudio(page: Page, folder: string) {
  const taps = await page.evaluate(() => {
    const pcm = window.sceneLab?.pcm;
    return pcm ? { arriving: pcm.take('arriving'), output: pcm.take('output') } : null;
  });
  if (!taps) return;
  writeFileSync(join(folder, 'arriving.pcm'), Buffer.from(taps.arriving.base64, 'base64'));
  writeFileSync(join(folder, 'output.pcm'), Buffer.from(taps.output.base64, 'base64'));
  writeFileSync(join(folder, 'taps.json'), JSON.stringify({ rate: TAP_RATE, arrivingFirstFrame: taps.arriving.firstFrame, outputFirstFrame: taps.output.firstFrame }));
}

function getCharactersSent(folder: string): number {
  const { turns } = JSON.parse(readFileSync(join(folder, 'agent.json'), 'utf8')) as { turns: { beats: Beat[] }[] };
  return turns.flatMap((turn) => turn.beats).reduce((sum, beat) => sum + getBeatText(beat).length, 0);
}

async function runScenario(name: string, scenario: Scenario, browser: Browser, runLabel: string) {
  const folder = join(args.out as string, runLabel);
  mkdirSync(folder, { recursive: true });
  const room = `proof-${runLabel}-${Date.now()}`;
  const relay = scenario.network ? startRelay(scenario.network) : null;
  const { child, openUrl } = await startAgent(room, folder, scenario);
  const context = await browser.newContext({ viewport: scenario.phone ? { width: 390, height: 844 } : { width: 1366, height: 800 } });
  await context.addInitScript((theme) => localStorage.setItem('theme', theme), args.theme as string);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('page error', error.message));
  if (scenario.network) await page.addInitScript(routeThroughRelay, { serverPort: LIVEKIT_UDP_PORT, relayPort: RELAY_PORT });
  const cdp: CDPSession | null = args.browser === 'chromium' ? await context.newCDPSession(page) : null;
  const screencastFrames: { epochMs: number; data: string }[] = [];
  if (args.screencast) {
    cdp?.on('Page.screencastFrame', (frame) => {
      screencastFrames.push({ epochMs: (frame.metadata.timestamp ?? 0) * 1000, data: frame.data });
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    });
  }
  if (scenario.throttle) await cdp?.send('Emulation.setCPUThrottlingRate', { rate: scenario.throttle });
  await page.goto(`${openUrl}&record=1`);
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('button', { name: 'Play the lesson' }).and(page.locator(':enabled')).waitFor({ timeout: args.say ? SAY_READY_LIMIT_MS : READY_LIMIT_MS });
  await page.addStyleTag({ content: '.tsqd-parent-container { display: none !important; }' });
  if (args.screencast) await cdp?.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  const run: RunContext = {
    page,
    folder,
    scenario,
    command: (command) => page.evaluate((labCommand) => window.sceneLab?.command(labCommand), command),
    waitForPlayedBeats: async (count, limitMs = 60_000) => {
      await page.waitForFunction((expected) => (window.sceneLab?.records.browserMessages.filter((message) => message.type === 'played').length ?? 0) >= expected, count, { timeout: limitMs });
    },
  };
  await scenario.drive(run);
  await waitForLogToCatchUp(page);
  if (args.screencast) await cdp?.send('Page.stopScreencast');
  await page.screenshot({ path: join(folder, 'final.png') });
  const records = await page.evaluate(() => {
    const lab = window.sceneLab;
    if (!lab) return null;
    return { ...lab.records, caption: lab.player.getCaption() };
  });
  const clockMap = await page.evaluate(() => ({ epochAtGraphZeroMs: performance.timeOrigin + performance.now() - (window.sceneLab?.player.getNowMs() ?? 0) }));
  const replayCheck = await page.evaluate(() => {
    const lab = window.sceneLab;
    if (!lab) return null;
    const log = lab.records.log;
    const operations = lab.player.getOperations();
    const liveStart = operations.find((operation) => operation.kind === 'beatStarted')?.atMs ?? 0;
    const logStart = (log.find((event) => (event as { playedWords?: number }).playedWords) as { atMs: number } | undefined)?.atMs ?? 0;
    const shiftMs = logStart - liveStart;
    const liveEnd = operations.at(-1)?.atMs ?? liveStart;
    const samples = [];
    for (let liveMs = liveStart; liveMs <= liveEnd + 2000; liveMs += 50) {
      samples.push({ liveMs, live: lab.describeLive(liveMs), replay: lab.describeReplay(liveMs + shiftMs), replayAgain: lab.describeReplay(liveMs + shiftMs) });
    }
    return { shiftMs, samples, log };
  });
  await collectAudio(page, folder);
  await run.command({ type: 'finish' });
  await new Promise((done) => child.once('exit', done));
  writeFileSync(join(folder, 'page.json'), JSON.stringify({ records, clockMap, replayCheck }));
  if (screencastFrames.length > 0) writeFileSync(join(folder, 'screencast.json'), JSON.stringify(screencastFrames));
  if (!args.fake && !args.say && !args.stored && !scenario.usesStoredPhrase) noteCredits(getCharactersSent(folder));
  await context.close();
  relay?.close();
  const summary = summariseRun(folder, { name, network: scenario.network ?? null, throttle: scenario.throttle ?? 1, phone: scenario.phone ?? false, onlyStops: scenario.onlyStops ?? false });
  writeFileSync(join(folder, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(JSON.stringify({ run: runLabel, ...summary.brief }));
  return summary;
}

// With no user gesture the audio stays suspended, so this proves a timer started by the word times drives the board.
async function runBlockedAudioProof(): Promise<void> {
  const folder = join(args.out as string, `blocked-audio-${Date.now()}`);
  mkdirSync(folder, { recursive: true });
  const { child, openUrl } = await startAgent(`proof-blocked-${Date.now()}`, folder, {});
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-mock-keychain', '--mute-audio'] });
  const page = await browser.newPage();
  // Chromium under Playwright never blocks audio, even with its autoplay flag, so this reads as a browser that did.
  await page.addInitScript(() => Object.defineProperty(BaseAudioContext.prototype, 'state', { get: () => 'suspended' }));
  await page.goto(`${openUrl}&autoconnect=1`);
  await page.getByRole('button', { name: 'Play the lesson' }).and(page.locator(':enabled')).waitFor({ timeout: 30_000 });
  await page.evaluate(() => window.sceneLab?.command({ type: 'play', lessonTurn: 0 }));
  await page.waitForFunction((count) => (window.sceneLab?.records.browserMessages.filter((message) => message.type === 'played').length ?? 0) >= count, beatsOf(0), { timeout: 60_000 });
  const records = await page.evaluate(() => window.sceneLab?.records);
  await page.evaluate(() => window.sceneLab?.command({ type: 'finish' }));
  await new Promise((done) => child.once('exit', done));
  await browser.close();
  const firstWordsAtMs = records?.agentMessages.find((message) => message.type === 'words')?.atMs ?? 0;
  const lateness = (records?.fired ?? []).map((cue) => cue.firedAtMs - firstWordsAtMs - cue.wordStartMs);
  const result = { clockKind: records?.clockKind, cuesFired: records?.fired.length, playedReports: records?.browserMessages.filter((message) => message.type === 'played').length, firedAfterItsWordTimeMs: getPercentiles(lateness) };
  writeFileSync(join(folder, 'summary.json.blocked'), `${JSON.stringify(result, null, 1)}\n`);
  console.log(JSON.stringify(result));
}

mkdirSync(args.out as string, { recursive: true });
const stack = await startLabStack();
const launchers = {
  chromium: () => chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain', '--mute-audio'] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0, 'media.navigator.permission.disabled': true } }),
  webkit: () => webkit.launch(),
};
const browser = await launchers[args.browser as keyof typeof launchers]();
try {
  const names = (args.only ?? Object.keys(SCENARIOS).join(',')).split(',');
  for (const name of names) {
    if (name === 'blocked-audio') {
      await runBlockedAudioProof();
      continue;
    }
    const scenario = SCENARIOS[name];
    if (!scenario) throw new Error(`No scenario named ${name}`);
    for (let index = 0; index < Number(args.repeat); index++) await runScenario(name, scenario, browser, `${name}-${args.browser === 'chromium' ? '' : `${args.browser}-`}${args.say ? 'say' : args.fake ? 'fake' : (args.model as string).replace('eleven_', '').replace('_v2_5', '')}-${Date.now()}`);
  }
} finally {
  await browser.close();
  stack.stop();
}
process.exit(0);
