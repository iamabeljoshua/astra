import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';
import { loadavg, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AccessToken } from 'livekit-server-sdk';
import { chromium } from 'playwright-core';
import { createWordClock, getIsAudioLost } from './clock-rule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, 'runs', 'clock');
mkdirSync(RUNS, { recursive: true });
const { values: args } = parseArgs({ options: { segments: { type: 'string', default: '10' }, only: { type: 'string' }, reanalyse: { type: 'boolean', default: false } } });

const LIVEKIT_URL = process.env.CLOCK_LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
const PAGE_PORT = Number(process.env.CLOCK_PAGE_PORT ?? 17811);
const RTP_CLOCK_HZ = 48000;
const SERVER_UDP_PORT = Number(process.env.CLOCK_SERVER_UDP_PORT ?? 7882);
const RELAY_PORT = Number(process.env.CLOCK_RELAY_PORT ?? 17982);
const LAN_ADDRESS = Object.values(networkInterfaces()).flat().find((entry) => entry.family === 'IPv4' && !entry.internal)?.address;
const PROFILES = {
  clean: null,
  uneven: { delayMs: 40, jitterMs: 30, lossPercent: 1 },
  poor: { delayMs: 100, jitterMs: 70, lossPercent: 4 },
  gap: null,
  shortGap: null,
  lost: { delayMs: 20, jitterMs: 5, lossPercent: 0, blackoutEveryMs: 8000, blackoutMs: 1000 },
};
const GAP_PROFILE_MS = { gap: 500, shortGap: 200 };
const LOST_PROFILE_SEGMENT_MS = 30000;
const LOST_PROFILE_SEGMENTS = 4;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function describeSeries(values) {
  if (values.length === 0) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const absolute = values.map(Math.abs).sort((a, b) => a - b);
  const at = (list, fraction) => Math.round(list[Math.min(list.length - 1, Math.floor(fraction * list.length))]);
  return { count: values.length, p50: at(sorted, 0.5), p95: at(sorted, 0.95), absP50: at(absolute, 0.5), absP95: at(absolute, 0.95), absMax: Math.round(absolute.at(-1)) };
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

// Pairs each burst with its nearest expected word, or by order when `isInOrder`, because a deliberate gap shifts every later word.
function matchWords({ onset, bursts, wordStartsMs, isInOrder }) {
  return bursts.map((burst, burstIndex) => {
    const elapsedMs = (burst.contextSeconds - onset.contextSeconds) * 1000;
    if (isInOrder) return { wordIndex: Math.min(burstIndex, wordStartsMs.length - 1), burst, elapsedMs };
    let bestIndex = 0;
    for (let index = 1; index < wordStartsMs.length; index++) {
      if (Math.abs(wordStartsMs[index] - elapsedMs) < Math.abs(wordStartsMs[bestIndex] - elapsedMs)) bestIndex = index;
    }
    return { wordIndex: bestIndex, burst, elapsedMs };
  });
}

function getEpochMs(records, contextSeconds) {
  return interpolate(records.clockMap, contextSeconds, (point) => point.contextTime, (point) => point.epochMs);
}

function getIsLostAtOnset({ records, onset }) {
  const silenceStart = records.worklet.filter((event) => event.kind === 'end' && event.contextSeconds < onset.contextSeconds).at(-1);
  if (!silenceStart) return false;
  const rtpPolls = records.rtp.map((poll) => ({ atMs: poll.pollEpochMs, rtpTimestamp: poll.rtpTimestamp }));
  return getIsAudioLost({ silenceStartMs: getEpochMs(records, silenceStart.contextSeconds), silenceEndMs: getEpochMs(records, onset.contextSeconds), rtpPolls, rtpClockHz: RTP_CLOCK_HZ });
}

function analyse(records, isInOrder) {
  const segments = records.data.filter((message) => message.type === 'segment');
  const onsets = records.worklet.filter((event) => event.kind === 'onset');
  const ends = records.worklet.filter((event) => event.kind === 'end');
  const errors = { sampleCount: [], chosenClock: [], arrival: [], rtp: [] };
  const leads = [];
  const stops = [];
  const drift = [];
  const getNearestOnset = (segment) => onsets.reduce((nearest, event) => (!nearest || Math.abs(event.contextSeconds - segment.contextSeconds) < Math.abs(nearest.contextSeconds - segment.contextSeconds) ? event : nearest), null);
  segments.forEach((segment) => {
    // The word times can land just after the audio starts on a bad link, so take the nearest onset, not the next one.
    const onset = getNearestOnset(segment);
    if (!onset) return;
    leads.push((onset.contextSeconds - segment.contextSeconds) * 1000);
    const nextSegment = segments.find((other) => other.segmentId === segment.segmentId + 1);
    const limit = nextSegment ? getNearestOnset(nextSegment).contextSeconds - 0.02 : Infinity;
    const bursts = records.worklet.filter((event) => event.kind === 'burst' && event.contextSeconds >= onset.contextSeconds - 0.02 && event.contextSeconds < limit);
    const matches = matchWords({ onset, bursts, wordStartsMs: segment.wordStartsMs, isInOrder });
    const onsetEpochMs = interpolate(records.clockMap, onset.contextSeconds, (point) => point.contextTime, (point) => point.epochMs);
    const rtpAtOnset = interpolate(records.rtp, onsetEpochMs, (point) => point.timestamp, (point) => point.rtpTimestamp);
    const clock = createWordClock(segment.wordStartsMs);
    const clockEvents = records.worklet.filter((event) => event.kind !== 'burst' && event.contextSeconds >= onset.contextSeconds && event.contextSeconds < limit);
    for (const { wordIndex, burst, elapsedMs } of matches) {
      errors.sampleCount.push(elapsedMs - segment.wordStartsMs[wordIndex]);
      while (clockEvents.length > 0 && clockEvents[0].contextSeconds <= burst.contextSeconds + 0.003) {
        const event = clockEvents.shift();
        if (event.kind === 'onset') clock.onOnset(event.contextSeconds * 1000, { isAudioLost: getIsLostAtOnset({ records, onset: event }) });
        else clock.onEnd(event.contextSeconds * 1000);
      }
      errors.chosenClock.push(clock.getPositionMs(burst.contextSeconds * 1000) - segment.wordStartsMs[wordIndex]);
      const arrival = records.data.find((message) => message.type === 'word' && message.segmentId === segment.segmentId && message.wordIndex === wordIndex);
      if (arrival) errors.arrival.push((burst.contextSeconds - arrival.contextSeconds) * 1000);
      const burstEpochMs = interpolate(records.clockMap, burst.contextSeconds, (point) => point.contextTime, (point) => point.epochMs);
      const rtpAtBurst = interpolate(records.rtp, burstEpochMs, (point) => point.timestamp, (point) => point.rtpTimestamp);
      errors.rtp.push(((rtpAtBurst - rtpAtOnset) / RTP_CLOCK_HZ) * 1000 - segment.wordStartsMs[wordIndex]);
    }
    const lastMatch = matches.at(-1);
    if (lastMatch) drift.push(lastMatch.elapsedMs - segment.wordStartsMs[lastMatch.wordIndex]);
    const stop = records.data.find((message) => message.type === 'stop' && message.segmentId === segment.segmentId);
    if (stop) {
      const end = ends.find((event) => event.contextSeconds >= onset.contextSeconds);
      if (end) stops.push((end.contextSeconds - stop.contextSeconds) * 1000);
    }
  });
  const lastStats = records.stats.at(-1) ?? {};
  return {
    messageDeliveryMs: analyseProbes(records.data),
    wordError: {
      sampleCountFromOnsetMs: describeSeries(errors.sampleCount),
      chosenClockMs: describeSeries(errors.chosenClock),
      dataMessageArrivalMs: describeSeries(errors.arrival),
      rtpTimestampFromOnsetMs: describeSeries(errors.rtp),
    },
    driftAtSegmentEndMs: describeSeries(drift),
    wordTimesArriveBeforeAudioMs: describeSeries(leads),
    audioKeepsPlayingAfterStopMessageMs: describeSeries(stops),
    wordTimesLateCount: leads.filter((lead) => lead < 0).length,
    network: {
      packetsReceived: lastStats.packetsReceived,
      packetsLost: lastStats.packetsLost,
      jitterSeconds: lastStats.jitter,
      meanJitterBufferMs: lastStats.jitterBufferEmittedCount ? Math.round((lastStats.jitterBufferDelay / lastStats.jitterBufferEmittedCount) * 1000) : null,
      concealedSamples: lastStats.concealedSamples,
      insertedSamples: lastStats.insertedSamplesForDeceleration,
      removedSamples: lastStats.removedSamplesForAcceleration,
    },
  };
}

function analyseProbes(messages) {
  const bySeq = new Map();
  for (const message of messages.filter((item) => item.type === 'probe')) {
    bySeq.set(message.seq, { ...bySeq.get(message.seq), [message.via]: message.epochMs - message.sentAt });
  }
  const probes = [...bySeq.values()];
  const round = (values) => values.map((value) => Math.round(value));
  return {
    reliable: describeSeries(round(probes.flatMap((probe) => probe.reliable ?? []))),
    lossy: describeSeries(round(probes.flatMap((probe) => probe.lossy ?? []))),
    firstOfBoth: describeSeries(round(probes.map((probe) => Math.min(probe.reliable ?? Infinity, probe.lossy ?? Infinity)))),
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
  const token = new AccessToken('devkey', process.env.LIVEKIT_API_SECRET ?? 'secret', { identity: 'student-browser', ttl: '10m' });
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

async function runProfile(name, impairment) {
  const roomName = `clock-${name}-${Date.now()}`;
  const launchArgs = ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  const relay = impairment ? startRelay(impairment) : null;
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error('page error', error.message));
  await page.goto(`http://127.0.0.1:${PAGE_PORT}/`);
  const audioInfo = await page.evaluate((options) => window.startClockProof(options), { url: LIVEKIT_URL, token: await makeToken(roomName), relay: impairment ? { serverPort: SERVER_UDP_PORT, relayPort: RELAY_PORT } : null });
  const publisher = spawn('node', [join(HERE, 'clock-publisher.mjs')], { env: { ...process.env, CLOCK_ROOM: roomName, CLOCK_SEGMENTS: name === 'lost' ? String(LOST_PROFILE_SEGMENTS) : args.segments, LIVEKIT_URL, CLOCK_GAP_MS: String(GAP_PROFILE_MS[name] ?? 0), CLOCK_SEGMENT_MS: name === 'lost' ? String(LOST_PROFILE_SEGMENT_MS) : '6000' }, stdio: 'inherit' });
  await new Promise((resolve) => publisher.on('exit', resolve));
  await delay(500);
  const records = await page.evaluate(() => window.clockRecords);
  await browser.close();
  relay?.close();
  const summary = { profile: name, machineLoadAtEnd: Math.round(loadavg()[0]), impairment, relayed: relay?.counts, audioInfo, ranAt: new Date().toISOString(), ...analyse(records, name in GAP_PROFILE_MS) };
  writeFileSync(join(RUNS, `${name}.json`), `${JSON.stringify({ summary, worklet: records.worklet, data: records.data, stats: records.stats, rtp: records.rtp, clockMap: records.clockMap }, null, 0)}\n`);
  console.log(JSON.stringify(summary));
  return summary;
}

// Runs the current clock rule over the browser events already recorded, without a browser.
function reanalyse() {
  const names = Object.keys(PROFILES).filter((name) => !args.only || args.only.split(',').includes(name));
  const summaries = Object.fromEntries(names.map((name) => {
    const run = JSON.parse(readFileSync(join(RUNS, `${name}.json`), 'utf8'));
    const summary = { ...run.summary, ...analyse(run, name in GAP_PROFILE_MS) };
    writeFileSync(join(RUNS, `${name}.json`), `${JSON.stringify({ ...run, summary }, null, 0)}\n`);
    return [name, summary];
  }));
  writeFileSync(join(RUNS, 'summary.json'), `${JSON.stringify(summaries, null, 1)}\n`);
  for (const [name, summary] of Object.entries(summaries)) console.log(name, JSON.stringify(Object.fromEntries(Object.entries(summary.wordError).map(([method, errors]) => [method, errors.absP95]))));
  process.exit(0);
}

if (args.reanalyse) reanalyse();

const server = await servePage(await bundlePage());
const summaries = {};
for (const [name, trial] of Object.entries(PROFILES)) {
  if (args.only && !args.only.split(',').includes(name)) continue;
  summaries[name] = await runProfile(name, trial);
}
writeFileSync(join(RUNS, 'summary.json'), `${JSON.stringify(summaries, null, 1)}\n`);
server.close();
process.exit(0);
