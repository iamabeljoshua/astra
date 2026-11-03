/// <reference lib="dom" />
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright';
import { type Beat, getBeatText } from '@astra/contracts';
import { LESSON } from '../lesson.ts';
import { AGENT_ROOT, delay, LIVEKIT_UDP_PORT, LIVEKIT_URL, NETWORKS, type NetworkProfile, RELAY_PORT, routeThroughRelay, startLabStack, startRelay, WEB_URL } from './lab-stack.ts';
import { type BoardDescription, type PageRecords, summariseRun } from './summarise-run.ts';

declare global {
  interface Window {
    sceneLab?: {
      records: PageRecords;
      pcm: { take(point: 'arriving' | 'output'): { firstFrame: number; base64: string } } | null;
      player: { getCaption(): string; getNowMs(): number; getOperations(): { kind: string; atMs: number }[] };
      command(command: object): void;
      describeLive(atMs: number): BoardDescription;
      describeReplay(atMs: number): BoardDescription;
    };
  }
}

const TAP_RATE = 24000;
const CREDITS_PER_CHARACTER = 0.22;
const CREDIT_LIMIT = 6000;

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    out: { type: 'string', default: '/tmp/m3-2-proof' },
    fake: { type: 'boolean', default: false },
    model: { type: 'string', default: 'eleven_flash_v2_5' },
    screencast: { type: 'boolean', default: false },
  },
});

interface Scenario {
  network?: NetworkProfile;
  throttle?: number;
  phone?: boolean;
  drive(run: RunContext): Promise<void>;
  stalls?: { atAudioMs: number; ms: number }[];
  textPace?: { msPerWord: number; flushBeforeCues: boolean };
  usesStoredPhrase?: boolean;
}

interface RunContext {
  page: Page;
  command(command: object): Promise<void>;
  waitForPlayedBeats(count: number, limitMs?: number): Promise<void>;
  scenario: Scenario;
}

const beatsOf = (lessonTurn: number) => LESSON[lessonTurn]?.length ?? 0;

async function playWholeLesson({ command, waitForPlayedBeats, scenario }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0, textPace: scenario.textPace, stalls: scenario.stalls });
  await waitForPlayedBeats(beatsOf(0));
  await delay(1500);
  await command({ type: 'play', lessonTurn: 1, textPace: scenario.textPace });
  await waitForPlayedBeats(beatsOf(0) + beatsOf(1));
  await delay(600);
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

async function interruptFiveTimes({ page, command }: RunContext): Promise<void> {
  await command({ type: 'play', lessonTurn: 0 });
  for (const afterMs of INTERRUPT_AFTER_MS) {
    await waitForFirstSoundOfNewTurn(page);
    await delay(afterMs);
    await command({ type: 'interrupt' });
    await delay(1400);
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

async function waitForAudioSent(page: Page, turnCount: number): Promise<void> {
  await page.waitForFunction((count) => (window.sceneLab?.records.turnsSent.length ?? 0) >= count, turnCount, { timeout: 60_000 });
}

const WORDS_LATE_MS = 300;

const SCENARIOS: Record<string, Scenario> = {
  clean: { drive: playWholeLesson },
  uneven: { drive: playWholeLesson, network: NETWORKS.uneven },
  poor: { drive: playWholeLesson, network: NETWORKS.poor },
  phone: { drive: playWholeLesson, throttle: 4, phone: true },
  'stall-500': { drive: playWholeLesson, stalls: [{ atAudioMs: 2000, ms: 500 }, { atAudioMs: 7000, ms: 500 }] },
  'stall-90': { drive: playWholeLesson, stalls: [{ atAudioMs: 2000, ms: 90 + 200 }, { atAudioMs: 7000, ms: 90 + 200 }] },
  model: { drive: playWholeLesson, textPace: { msPerWord: 120, flushBeforeCues: true } },
  'words-late-300': { drive: playWithWordsLate },
  stored: { drive: playStockPhraseThreeTimes, usesStoredPhrase: true },
  interrupt: { drive: interruptFiveTimes },
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

function getVoiceFlags(scenario: Scenario): string[] {
  if (scenario.usesStoredPhrase) return ['--stored', join(args.out as string, 'stock-phrase.json')];
  return args.fake ? ['--fake'] : ['--model', args.model as string, '--tap'];
}

function startAgent(room: string, folder: string, scenario: Scenario): Promise<{ child: ChildProcess; openUrl: string }> {
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
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('page error', error.message));
  if (scenario.network) await page.addInitScript(routeThroughRelay, { serverPort: LIVEKIT_UDP_PORT, relayPort: RELAY_PORT });
  const cdp = await context.newCDPSession(page);
  const screencastFrames: { epochMs: number; data: string }[] = [];
  if (args.screencast) {
    cdp.on('Page.screencastFrame', (frame) => {
      screencastFrames.push({ epochMs: (frame.metadata.timestamp ?? 0) * 1000, data: frame.data });
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    });
  }
  if (scenario.throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.throttle });
  await page.goto(`${openUrl}&record=1`);
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('button', { name: 'Play the lesson' }).and(page.locator(':enabled')).waitFor({ timeout: 30_000 });
  if (args.screencast) await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  const run: RunContext = {
    page,
    scenario,
    command: (command) => page.evaluate((labCommand) => window.sceneLab?.command(labCommand), command),
    waitForPlayedBeats: async (count, limitMs = 60_000) => {
      await page.waitForFunction((expected) => (window.sceneLab?.records.browserMessages.filter((message) => message.type === 'played').length ?? 0) >= expected, count, { timeout: limitMs });
    },
  };
  await scenario.drive(run);
  // On a poor link the agent's copy of the log lands after the browser's last report, and replay reads that copy.
  await page.waitForFunction(() => {
    const records = window.sceneLab?.records;
    return records !== undefined && records.log.length >= records.browserMessages.filter((message) => message.type === 'played' || message.type === 'boardFrozen').length;
  }, undefined, { timeout: 15_000 });
  if (args.screencast) await cdp.send('Page.stopScreencast');
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
    const logStart = (log[0] as { atMs: number } | undefined)?.atMs ?? 0;
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
  if (!args.fake && !scenario.usesStoredPhrase) noteCredits(getCharactersSent(folder));
  await context.close();
  relay?.close();
  const summary = summariseRun(folder, { name, network: scenario.network ?? null, throttle: scenario.throttle ?? 1, phone: scenario.phone ?? false });
  writeFileSync(join(folder, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(JSON.stringify({ run: runLabel, ...summary.brief }));
  return summary;
}

mkdirSync(args.out as string, { recursive: true });
const stack = await startLabStack();
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain', '--mute-audio'] });
try {
  const names = (args.only ?? Object.keys(SCENARIOS).join(',')).split(',');
  for (const name of names) {
    const scenario = SCENARIOS[name];
    if (!scenario) throw new Error(`No scenario named ${name}`);
    for (let index = 0; index < Number(args.repeat); index++) await runScenario(name, scenario, browser, `${name}-${args.fake ? 'fake' : (args.model as string).replace('eleven_', '').replace('_v2_5', '')}-${Date.now()}`);
  }
} finally {
  await browser.close();
  stack.stop();
}
process.exit(0);
