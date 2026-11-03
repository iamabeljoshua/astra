import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadavg, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AccessToken } from 'livekit-server-sdk';
import { chromium } from 'playwright-core';
import { createGuessingClock, getIsLostByRtp } from './clock-rejected.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, 'runs', 'clock');
mkdirSync(RUNS, { recursive: true });
const { values: args } = parseArgs({ options: { only: { type: 'string' }, repeat: { type: 'string', default: '1' } } });

const LIVEKIT_URL = process.env.CLOCK_LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
const PAGE_PORT = Number(process.env.CLOCK_PAGE_PORT ?? 17811);
const SERVER_UDP_PORT = Number(process.env.CLOCK_SERVER_UDP_PORT ?? 7882);
const RELAY_PORT = Number(process.env.CLOCK_RELAY_PORT ?? 17982);
const RTP_CLOCK_HZ = 48000;
const WORD_MATCH_MS = 150;
const BETWEEN_TURNS_SECONDS = 1.4;
const EARLY_MS = 40;
const LAN_ADDRESS = Object.values(networkInterfaces()).flat().find((entry) => entry.family === 'IPv4' && !entry.internal)?.address;

const UNEVEN = { delayMs: 40, jitterMs: 30, lossPercent: 1 };
const POOR = { delayMs: 100, jitterMs: 70, lossPercent: 4 };
const BLACKOUT = { delayMs: 20, jitterMs: 5, lossPercent: 0, blackoutEveryMs: 8000, blackoutMs: 1000 };
const MIDDLE = 0.5;
const INTO_WORD_MS = 90;
const PAUSES = { everyWords: 4, ms: 250 };
const LONG_TURNS = { segmentMs: 30000, segments: 3 };
const stallOf = (ms, intoWordMs = 0) => [{ wordFraction: MIDDLE, ms, intoWordMs }];

const SCENARIOS = {
  clean: { options: { stopsEarly: true } },
  uneven: { impair: UNEVEN, options: { stopsEarly: true } },
  poor: { impair: POOR, options: { stopsEarly: true } },
  'stall-120': { options: { stalls: stallOf(120) } },
  'stall-200': { options: { stalls: stallOf(200) } },
  'stall-500': { options: { stalls: stallOf(500) } },
  'stall-90': { options: { stalls: stallOf(90) } },
  'stall-200-mid-word': { options: { stalls: stallOf(200, INTO_WORD_MS) } },
  'stall-500-mid-word': { options: { stalls: stallOf(500, INTO_WORD_MS) } },
  'stall-200-uneven': { impair: UNEVEN, options: { stalls: stallOf(200) } },
  'stall-500-poor': { impair: POOR, options: { stalls: stallOf(500) } },
  pauses: { options: { pause: PAUSES } },
  'pauses-stall-300': { options: { pause: PAUSES, stalls: stallOf(300) } },
  lost: { impair: BLACKOUT, options: LONG_TURNS },
  'pauses-lost': { impair: BLACKOUT, options: { ...LONG_TURNS, pause: PAUSES } },
  'words-late-300': { options: { wordTimesLateMs: 300 } },
  'words-late-300-poor': { impair: POOR, options: { wordTimesLateMs: 300 } },
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function describeSeries(values) {
  if (values.length === 0) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const absolute = values.map(Math.abs).sort((a, b) => a - b);
  const at = (list, fraction) => Math.round(list[Math.min(list.length - 1, Math.floor(fraction * list.length))]);
  return { count: values.length, p50: at(sorted, 0.5), p95: at(sorted, 0.95), absP50: at(absolute, 0.5), absP95: at(absolute, 0.95), absMax: Math.round(absolute.at(-1)), earlyOver40: values.filter((value) => value < -EARLY_MS).length, lateOver100: values.filter((value) => value > 100).length };
}

function interpolate(points, x, getX, getY) {
  let previous = points[0];
  for (const point of points) {
    if (getX(point) >= x) {
      const span = getX(point) - getX(previous);
      if (span === 0) return getY(point);
      return getY(previous) + ((x - getX(previous)) / span) * (getY(point) - getY(previous));
    }
    previous = point;
  }
  return getY(previous);
}

function getSegmentAudio(records) {
  const segments = records.data.filter((message) => message.type === 'segment');
  const onsets = records.worklet.filter((event) => event.kind === 'onset');
  const ends = records.worklet.filter((event) => event.kind === 'end');
  // Turns sit further apart than any silence inside one, so this finds a turn's first sound without trusting when its message arrived.
  const turnOnsets = onsets.filter((onset) => {
    const lastEnd = ends.filter((end) => end.contextSeconds < onset.contextSeconds).at(-1);
    return !lastEnd || onset.contextSeconds - lastEnd.contextSeconds >= BETWEEN_TURNS_SECONDS;
  });
  const firstOnsets = segments.map((segment) => turnOnsets.filter((onset) => onset.contextSeconds <= segment.contextSeconds + BETWEEN_TURNS_SECONDS).at(-1));
  return segments.flatMap((segment, index) => {
    const onset = firstOnsets[index];
    if (!onset) return [];
    const limit = firstOnsets[index + 1]?.contextSeconds ?? Infinity;
    const bursts = records.worklet.filter((event) => event.kind === 'burst' && event.contextSeconds >= onset.contextSeconds - 0.02 && event.contextSeconds < limit - 0.02);
    return [{ segment, onset, limit, bursts }];
  });
}

function matchWordsToBursts({ segment, onset, bursts }) {
  return segment.wordStartsMs.flatMap((startMs, wordIndex) => {
    const stallMs = segment.stalls.filter((stall) => stall.atMs <= startMs).reduce((sum, stall) => sum + stall.ms, 0);
    const expectedSeconds = onset.contextSeconds + (startMs + stallMs) / 1000;
    const nearest = bursts.reduce((best, burst) => (!best || Math.abs(burst.contextSeconds - expectedSeconds) < Math.abs(best.contextSeconds - expectedSeconds) ? burst : best), null);
    if (!nearest || Math.abs(nearest.contextSeconds - expectedSeconds) * 1000 > WORD_MATCH_MS) return [];
    return [{ wordIndex, burst: nearest, startMs }];
  });
}

function getReanalysedErrors({ records, segment, onset, limit, matches }) {
  const clock = createGuessingClock(segment.wordStartsMs);
  const events = records.worklet.filter((event) => (event.kind === 'onset' || event.kind === 'end') && event.contextSeconds >= onset.contextSeconds && event.contextSeconds < limit);
  const rtpPolls = records.rtp.map((poll) => ({ atMs: poll.pollEpochMs, rtpTimestamp: poll.rtpTimestamp }));
  const toEpochMs = (seconds) => interpolate(records.clockMap, seconds, (point) => point.contextTime, (point) => point.epochMs);
  let lastEnd = null;
  return matches.map(({ burst, startMs }) => {
    while (events.length > 0 && events[0].contextSeconds <= burst.contextSeconds + 0.003) {
      const event = events.shift();
      if (event.kind === 'end') {
        clock.onEnd(event.contextSeconds * 1000);
        lastEnd = event.contextSeconds;
      } else {
        const isAudioLost = lastEnd !== null && getIsLostByRtp({ silenceStartMs: toEpochMs(lastEnd), silenceEndMs: toEpochMs(event.contextSeconds), rtpPolls, rtpClockHz: RTP_CLOCK_HZ });
        clock.onOnset(event.contextSeconds * 1000, { isAudioLost });
      }
    }
    return clock.getPositionMs(burst.contextSeconds * 1000) - startMs;
  });
}

function analyse(records) {
  const methods = {};
  const reanalysed = [];
  const leads = [];
  const stops = [];
  const ends = records.worklet.filter((event) => event.kind === 'end');
  let wordsSent = 0;
  let wordsHeard = 0;
  for (const audio of getSegmentAudio(records)) {
    const { segment, onset } = audio;
    wordsSent += segment.wordStartsMs.length;
    leads.push((onset.contextSeconds - segment.contextSeconds) * 1000);
    const matches = matchWordsToBursts(audio);
    wordsHeard += matches.length;
    reanalysed.push(...getReanalysedErrors({ records, ...audio, matches }));
    for (const { wordIndex, burst } of matches) {
      for (const fired of records.fired.filter((item) => item.segmentId === segment.segmentId && item.wordIndex === wordIndex)) {
        (methods[fired.method] ??= []).push((fired.contextSeconds - burst.contextSeconds) * 1000);
      }
    }
    const stop = records.data.find((message) => message.type === 'stop' && message.segmentId === segment.segmentId);
    const end = stop && ends.find((event) => event.contextSeconds >= onset.contextSeconds);
    if (end) stops.push((end.contextSeconds - stop.contextSeconds) * 1000);
  }
  const lastStats = records.stats.at(-1) ?? {};
  const gaps = records.data.filter((message) => message.type === 'audioGap' && message.ms !== undefined && message.via === 'reliable');
  const decisions = records.decisions.filter((decision) => decision.silenceMs > 150);
  return {
    wordsSent,
    wordsHeard,
    liveFiredErrorMs: Object.fromEntries(Object.entries(methods).map(([name, values]) => [name, describeSeries(values)])),
    reanalysedRejectedRuleMs: describeSeries(reanalysed),
    wordTimesLeadAudioMs: describeSeries(leads),
    wordTimesLateCount: leads.filter((lead) => lead < 0).length,
    audioKeepsPlayingAfterStopMessageMs: describeSeries(stops),
    messageDeliveryMs: analyseProbes(records.data),
    gapsReported: { count: gaps.length, ms: describeSeries(gaps.map((gap) => gap.ms)) },
    silences: { count: decisions.length, calledLostByRtp: decisions.filter((decision) => decision.isLostByRtp).length, calledLostBySequence: decisions.filter((decision) => decision.isLostBySequence).length, sample: decisions.slice(0, 40).map(({ silenceMs, isLostByRtp, isLostBySequence, packetsLostDuringSilence }) => ({ silenceMs: Math.round(silenceMs), isLostByRtp, isLostBySequence, packetsLostDuringSilence })) },
    network: { packetsReceived: lastStats.packetsReceived, packetsLost: lastStats.packetsLost, concealedSamples: lastStats.concealedSamples, meanJitterBufferMs: lastStats.jitterBufferEmittedCount ? Math.round((lastStats.jitterBufferDelay / lastStats.jitterBufferEmittedCount) * 1000) : null },
  };
}

function analyseProbes(messages) {
  const bySeq = new Map();
  for (const message of messages.filter((item) => item.type === 'probe')) {
    bySeq.set(message.seq, { ...bySeq.get(message.seq), [message.via]: message.epochMs - message.sentAt });
  }
  const probes = [...bySeq.values()];
  return {
    reliable: describeSeries(probes.flatMap((probe) => probe.reliable ?? [])),
    firstOfBoth: describeSeries(probes.map((probe) => Math.min(probe.reliable ?? Infinity, probe.lossy ?? Infinity))),
    lossyNeverArrived: probes.filter((probe) => probe.lossy === undefined).length,
  };
}

// Normally distributed jitter, by the Box-Muller method.
function getJitterMs(jitterMs) {
  return jitterMs * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

function startRelay({ delayMs, jitterMs, lossPercent, blackoutEveryMs = 0, blackoutMs = 0 }) {
  const toBrowser = createSocket('udp4');
  const toServer = createSocket('udp4');
  const counts = { forwarded: 0, dropped: 0 };
  let browserAddress = null;
  let isClosed = false;
  const forward = (socket, message, port, address) => {
    const isBlackedOut = blackoutEveryMs > 0 && Date.now() % blackoutEveryMs < blackoutMs;
    if (isBlackedOut || Math.random() * 100 < lossPercent) {
      counts.dropped += 1;
      return;
    }
    counts.forwarded += 1;
    setTimeout(() => {
      if (!isClosed) socket.send(message, port, address);
    }, Math.max(0, delayMs + getJitterMs(jitterMs)));
  };
  toBrowser.on('message', (message, remote) => {
    browserAddress = remote;
    forward(toServer, message, SERVER_UDP_PORT, LAN_ADDRESS);
  });
  toServer.on('message', (message) => {
    if (browserAddress) forward(toBrowser, message, browserAddress.port, browserAddress.address);
  });
  toBrowser.bind(RELAY_PORT, '0.0.0.0');
  toServer.bind(0, '0.0.0.0');
  return {
    counts,
    close() {
      isClosed = true;
      toBrowser.close();
      toServer.close();
    },
  };
}

async function makeToken(roomName) {
  const token = new AccessToken('devkey', process.env.LIVEKIT_API_SECRET ?? 'secret', { identity: 'student-browser', ttl: '20m' });
  token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return token.toJwt();
}

async function bundlePage() {
  const result = await build({ entryPoints: [join(HERE, 'clock-page.js')], bundle: true, write: false, format: 'iife', platform: 'browser' });
  return result.outputFiles[0].text;
}

function servePage(bundle) {
  const worklet = readFileSync(join(HERE, 'clock-worklet.js'), 'utf8');
  const server = createServer((request, response) => {
    if (request.url === '/clock-worklet.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(worklet);
    } else if (request.url === '/clock-page.bundle.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(bundle);
    } else {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><title>clock</title><script src="/clock-page.bundle.js"></script>');
    }
  });
  return new Promise((resolve) => server.listen(PAGE_PORT, '127.0.0.1', () => resolve(server)));
}

async function runScenario(name, { impair, options }, runLabel) {
  const roomName = `clock-${name}-${Date.now()}`;
  const relay = impair ? startRelay(impair) : null;
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-mock-keychain'] });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error('page error', error.message));
  await page.goto(`http://127.0.0.1:${PAGE_PORT}/`);
  const audioInfo = await page.evaluate((proof) => window.startClockProof(proof), { url: LIVEKIT_URL, token: await makeToken(roomName), relay: impair ? { serverPort: SERVER_UDP_PORT, relayPort: RELAY_PORT } : null });
  const publisher = spawn('node', [join(HERE, 'clock-publisher.mjs')], { env: { ...process.env, CLOCK_ROOM: roomName, LIVEKIT_URL, CLOCK_OPTIONS: JSON.stringify(options) }, stdio: 'inherit' });
  await new Promise((resolve) => publisher.on('exit', resolve));
  await delay(500);
  const records = await page.evaluate(() => window.clockRecords);
  await browser.close();
  relay?.close();
  const summary = { scenario: name, machineLoadAtEnd: Math.round(loadavg()[0]), impair: impair ?? null, options, relayed: relay?.counts, audioInfo, ranAt: new Date().toISOString(), ...analyse(records) };
  writeFileSync(join(RUNS, `${runLabel}.json`), `${JSON.stringify({ summary, records })}\n`);
  const { silences, ...brief } = summary;
  console.log(JSON.stringify({ ...brief, silences: { count: silences.count, calledLostByRtp: silences.calledLostByRtp, calledLostBySequence: silences.calledLostBySequence } }));
  return summary;
}

const server = await servePage(await bundlePage());
const names = args.only ? args.only.split(',') : Object.keys(SCENARIOS);
for (const name of names) {
  for (let run = 0; run < Number(args.repeat); run++) {
    await runScenario(name, SCENARIOS[name], Number(args.repeat) === 1 ? name : `${name}-run${run + 1}`);
  }
}
server.close();
process.exit(0);
