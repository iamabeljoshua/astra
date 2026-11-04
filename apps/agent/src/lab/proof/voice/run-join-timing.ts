/// <reference lib="dom" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readTrace, summarise } from './read-trace.ts';
import { startVoiceStack } from './stack.ts';
import { launchProofBrowser, openStudentPage } from './student-page.ts';

// From pressing Talk to the tutor's first sound, split at every step a clock can see, in ms from the press. A negative figure happened before the press. Run the same file on two commits to compare them.
const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '/tmp/m3-6-join' },
    joins: { type: 'string', default: '8' },
    pressAfterMs: { type: 'string', default: '0' },
  },
});

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const out = args.out as string;
mkdirSync(out, { recursive: true });

function getJobRequestsAtMs(): number[] {
  return readFileSync(join(out, 'agent.log'), 'utf8')
    .split('\n')
    .flatMap((line) => {
      if (!line.includes('received job request')) return [];
      try {
        return [(JSON.parse(line) as { time: number }).time];
      } catch {
        return [];
      }
    });
}

const stack = await startVoiceStack({ out, agentEnv: { ASTRA_VOICE: 'fake' } });
const browser = await launchProofBrowser();
const rows: Record<string, number | string | null>[] = [];
try {
  for (let run = 0; run < Number(args.joins); run += 1) {
    const openedAtMs = Date.now();
    const student = await openStudentPage(browser, { email: 'maya@astra.test', title: `Join ${run}` });
    const seen: Record<string, number> = {};
    student.page.on('response', (response) => {
      if (response.url().includes('/live-room')) seen.apiAnswered ??= Date.now();
    });
    student.page.on('console', (message) => {
      const text = message.text();
      if (text.startsWith('signal connected')) seen.signalConnected ??= Date.now();
      if (text.includes('connecting -> connected')) seen.roomConnected ??= Date.now();
    });
    await delay(Number(args.pressAfterMs));
    const pressedAtMs = Date.now();
    await student.pressTalk();
    const prefix = `session-${student.sessionId}`;
    const deadline = Date.now() + 30_000;
    while (!readTrace(stack.traceFolder, prefix).some((row) => row.name === 'turnFinished') && Date.now() < deadline) await delay(50);
    await delay(300);
    const trace = readTrace(stack.traceFolder, prefix);
    const after = await student.getTrace();
    const firstAudio = Object.values(after.firstAudioEpochMs)[0];
    const fromPress = (atMs: number | undefined) => (atMs === undefined ? null : Math.round(atMs - pressedAtMs));
    const at = (name: string, kind?: string) => trace.find((row) => row.name === name && (kind === undefined || row.kind === kind))?.atMs;
    const live = Object.values(after.turnStartedEpochMs)[0];
    rows.push({
      apiAnswered: fromPress(seen.apiAnswered),
      signalConnected: fromPress(seen.signalConnected),
      roomConnected: fromPress(seen.roomConnected),
      jobRequest: fromPress(getJobRequestsAtMs().filter((atMs) => atMs >= openedAtMs).at(0)),
      jobStarted: fromPress(at('jobStarted')),
      trackUp: fromPress(at('voiceTrackUp')),
      helloAtAgent: fromPress(at('audioState')),
      greetingDecided: fromPress(at('turnStarted', 'greeting')),
      greetingCaptured: fromPress(at('firstFrameCaptured', 'greeting')),
      turnAtPage: fromPress(live),
      firstSound: fromPress(firstAudio),
      roundTripMs: Math.round((await student.getRoundTripMs()) ?? -1),
    });
    console.log(JSON.stringify(rows.at(-1)));
    await student.context.close();
    await delay(3000);
  }
} finally {
  const names = Object.keys(rows[0] ?? {});
  const summary = Object.fromEntries(names.map((name) => [name, summarise(rows.flatMap((row) => (typeof row[name] === 'number' ? [row[name]] : [])))]));
  writeFileSync(join(out, 'join-timing.json'), `${JSON.stringify({ rows, summary }, null, 1)}\n`);
  for (const name of names) console.log(name, JSON.stringify(summary[name]));
  await browser.close();
  await stack.stop();
}
process.exit(0);
