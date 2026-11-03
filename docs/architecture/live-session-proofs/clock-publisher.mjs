import { AudioFrame, AudioSource, dispose, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { createPlayoutTracker } from './clock-rule.mjs';

const SAMPLE_RATE = 24000;
const FRAME_MS = 20;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const AGENT_OUTPUT_QUEUE_MS = 200;
const BETWEEN_SEGMENTS_MS = 1500;
const SHORTEST_WORD_MS = 180;
const LONGEST_WORD_MS = 520;
const BURST_MS = 60;
const BURST_AMPLITUDE = 0.5;
const HUM_AMPLITUDE = 0.05;
const TONE_HZ = 1000;
const STOP_EVERY_SEGMENTS = 2;
const PROBE_EVERY_MS = 100;

const options = JSON.parse(process.env.CLOCK_OPTIONS ?? '{}');
const SEGMENT_MS = options.segmentMs ?? 6000;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function makeWords() {
  const wordStartsMs = [0];
  const pauses = [];
  while (wordStartsMs.at(-1) < SEGMENT_MS - LONGEST_WORD_MS) {
    let nextMs = wordStartsMs.at(-1) + SHORTEST_WORD_MS + Math.random() * (LONGEST_WORD_MS - SHORTEST_WORD_MS);
    if (options.pause && wordStartsMs.length % options.pause.everyWords === 0) {
      pauses.push({ fromMs: nextMs, toMs: nextMs + options.pause.ms });
      nextMs += options.pause.ms;
    }
    wordStartsMs.push(nextMs);
  }
  return { wordStartsMs, pauses };
}

function renderSegment({ wordStartsMs, pauses }) {
  const pcm = new Int16Array(Math.round((SEGMENT_MS / 1000) * SAMPLE_RATE));
  const burstStarts = wordStartsMs.map((milliseconds) => Math.round((milliseconds / 1000) * SAMPLE_RATE));
  const burstSamples = Math.round((BURST_MS / 1000) * SAMPLE_RATE);
  let nextBurst = 0;
  for (let index = 0; index < pcm.length; index++) {
    while (nextBurst + 1 < burstStarts.length && index >= burstStarts[nextBurst + 1]) nextBurst += 1;
    const atMs = (index / SAMPLE_RATE) * 1000;
    if (pauses.some((pause) => atMs >= pause.fromMs && atMs < pause.toMs)) continue;
    const isBurst = index - burstStarts[nextBurst] < burstSamples;
    pcm[index] = Math.round((isBurst ? BURST_AMPLITUDE : HUM_AMPLITUDE) * 32767 * Math.sin((2 * Math.PI * TONE_HZ * index) / SAMPLE_RATE));
  }
  return pcm;
}

async function send(room, message, reliable = true) {
  await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable, topic: 'clock' });
}

function sendOnBothChannels(room, message) {
  return Promise.all([send(room, { ...message, via: 'reliable' }), send(room, { ...message, via: 'lossy' }, false)]);
}

function placeStalls(wordStartsMs) {
  return (options.stalls ?? []).map((stall) => {
    const wordIndex = Math.min(wordStartsMs.length - 1, Math.floor(wordStartsMs.length * stall.wordFraction));
    return { ms: stall.ms, wordIndex, atMs: wordStartsMs[wordIndex] + (stall.intoWordMs ?? 0), isDone: false };
  });
}

async function playSegment({ room, source, segmentId, shouldStopEarly }) {
  const words = makeWords();
  const { wordStartsMs } = words;
  const pcm = renderSegment(words);
  const stalls = placeStalls(wordStartsMs);
  const tracker = createPlayoutTracker({ onRanDry: ({ atMs }) => send(room, { type: 'audioGap', segmentId, atMs, sentAt: Date.now() }) });
  const stopAfterMs = shouldStopEarly ? 2000 + Math.random() * 2500 : Infinity;
  const segmentMessage = { type: 'segment', segmentId, wordStartsMs, stalls: stalls.map(({ ms, wordIndex, atMs }) => ({ ms, wordIndex, atMs })), sentAt: Date.now() };
  if (!options.wordTimesLateMs) await send(room, segmentMessage);
  else setTimeout(() => send(room, segmentMessage), options.wordTimesLateMs);
  const startedAt = Date.now();
  const timers = wordStartsMs.filter((milliseconds) => milliseconds < stopAfterMs).map((milliseconds, wordIndex) => setTimeout(() => send(room, { type: 'word', segmentId, wordIndex, sentAt: Date.now() }), milliseconds));
  const measuredGaps = [];
  for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES) {
    const stall = stalls.find((item) => !item.isDone && (offset / SAMPLE_RATE) * 1000 + FRAME_MS > item.atMs);
    if (stall) {
      stall.isDone = true;
      // The voice sends nothing, so the queue drains first and then the audio really runs dry for this long.
      await delay(AGENT_OUTPUT_QUEUE_MS + stall.ms);
    }
    if (Date.now() - startedAt >= stopAfterMs) {
      source.clearQueue();
      await sendOnBothChannels(room, { type: 'stop', segmentId, sentAt: Date.now() });
      break;
    }
    const piece = pcm.slice(offset, offset + FRAME_SAMPLES);
    if (piece.length < FRAME_SAMPLES) break;
    const gap = tracker.onFrame(Date.now(), FRAME_MS);
    if (gap) {
      measuredGaps.push(gap);
      await send(room, { type: 'audioGap', segmentId, ...gap, sentAt: Date.now() });
    }
    await source.captureFrame(new AudioFrame(piece, SAMPLE_RATE, 1, FRAME_SAMPLES));
  }
  tracker.close();
  timers.forEach(clearTimeout);
  await delay(AGENT_OUTPUT_QUEUE_MS);
  return measuredGaps;
}

const token = new AccessToken('devkey', process.env.LIVEKIT_API_SECRET ?? 'secret', { identity: 'tutor', ttl: '20m' });
token.addGrant({ room: process.env.CLOCK_ROOM, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
const room = new Room();
await room.connect(process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880', await token.toJwt(), { autoSubscribe: false, dynacast: false });
const source = new AudioSource(SAMPLE_RATE, 1, AGENT_OUTPUT_QUEUE_MS);
const publishOptions = new TrackPublishOptions();
publishOptions.source = TrackSource.SOURCE_MICROPHONE;
await room.localParticipant.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), publishOptions);
await delay(Number(process.env.CLOCK_START_DELAY_MS ?? 4000));
let probeSeq = 0;
const probeTimer = setInterval(() => sendOnBothChannels(room, { type: 'probe', seq: probeSeq++, sentAt: Date.now() }), PROBE_EVERY_MS);
for (let segmentId = 0; segmentId < (options.segments ?? 12); segmentId++) {
  await playSegment({ room, source, segmentId, shouldStopEarly: Boolean(options.stopsEarly) && segmentId % STOP_EVERY_SEGMENTS === 1 });
  await delay(BETWEEN_SEGMENTS_MS);
}
clearInterval(probeTimer);
await send(room, { type: 'finished', sentAt: Date.now() });
await delay(1500);
await room.disconnect();
await dispose();
process.exit(0);
