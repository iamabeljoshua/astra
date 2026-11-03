import { AudioFrame, AudioSource, dispose, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';

const SAMPLE_RATE = 24000;
const FRAME_MS = 20;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const AGENT_OUTPUT_QUEUE_MS = 200;
const SEGMENT_MS = Number(process.env.CLOCK_SEGMENT_MS ?? 6000);
const BETWEEN_SEGMENTS_MS = 1500;
const SHORTEST_WORD_MS = 180;
const LONGEST_WORD_MS = 520;
const BURST_MS = 60;
const BURST_AMPLITUDE = 0.5;
const HUM_AMPLITUDE = 0.05;
const TONE_HZ = 1000;
const STOP_EVERY_SEGMENTS = 2;
const PROBE_EVERY_MS = 100;

const GAP_MS = Number(process.env.CLOCK_GAP_MS ?? 0);
const roomName = process.env.CLOCK_ROOM;
const segmentCount = Number(process.env.CLOCK_SEGMENTS ?? 10);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function makeWordStarts() {
  const wordStartsMs = [0];
  while (wordStartsMs.at(-1) < SEGMENT_MS - LONGEST_WORD_MS) {
    wordStartsMs.push(wordStartsMs.at(-1) + SHORTEST_WORD_MS + Math.random() * (LONGEST_WORD_MS - SHORTEST_WORD_MS));
  }
  return wordStartsMs;
}

function renderSegment(wordStartsMs) {
  const pcm = new Int16Array(Math.round((SEGMENT_MS / 1000) * SAMPLE_RATE));
  const burstStarts = wordStartsMs.map((milliseconds) => Math.round((milliseconds / 1000) * SAMPLE_RATE));
  const burstSamples = Math.round((BURST_MS / 1000) * SAMPLE_RATE);
  let nextBurst = 0;
  for (let index = 0; index < pcm.length; index++) {
    while (nextBurst + 1 < burstStarts.length && index >= burstStarts[nextBurst + 1]) nextBurst += 1;
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

async function playSegment({ room, source, segmentId, shouldStopEarly }) {
  const wordStartsMs = makeWordStarts();
  const pcm = renderSegment(wordStartsMs);
  const stopAfterMs = shouldStopEarly ? 2000 + Math.random() * 2500 : Infinity;
  await send(room, { type: 'segment', segmentId, wordStartsMs, sentAt: Date.now() });
  const startedAt = Date.now();
  const gapAtSample = GAP_MS > 0 ? Math.round((wordStartsMs[Math.floor(wordStartsMs.length / 2)] / 1000) * SAMPLE_RATE) : Infinity;
  const timers = wordStartsMs.filter((milliseconds) => milliseconds < stopAfterMs).map((milliseconds, wordIndex) => setTimeout(() => send(room, { type: 'word', segmentId, wordIndex, sentAt: Date.now() }), milliseconds));
  let hasGapped = false;
  for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES) {
    if (!hasGapped && offset + FRAME_SAMPLES > gapAtSample) {
      hasGapped = true;
      await source.waitForPlayout();
      await delay(GAP_MS);
    }
    if (Date.now() - startedAt >= stopAfterMs) {
      source.clearQueue();
      await sendOnBothChannels(room, { type: 'stop', segmentId, sentAt: Date.now() });
      break;
    }
    const piece = pcm.slice(offset, offset + FRAME_SAMPLES);
    if (piece.length < FRAME_SAMPLES) break;
    await source.captureFrame(new AudioFrame(piece, SAMPLE_RATE, 1, FRAME_SAMPLES));
  }
  timers.forEach(clearTimeout);
  await delay(AGENT_OUTPUT_QUEUE_MS);
}

const token = new AccessToken('devkey', process.env.LIVEKIT_API_SECRET ?? 'secret', { identity: 'tutor', ttl: '10m' });
token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
const room = new Room();
await room.connect(process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880', await token.toJwt(), { autoSubscribe: false, dynacast: false });
const source = new AudioSource(SAMPLE_RATE, 1, AGENT_OUTPUT_QUEUE_MS);
const options = new TrackPublishOptions();
options.source = TrackSource.SOURCE_MICROPHONE;
await room.localParticipant.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), options);
await delay(Number(process.env.CLOCK_START_DELAY_MS ?? 4000));
let probeSeq = 0;
const probeTimer = setInterval(() => sendOnBothChannels(room, { type: 'probe', seq: probeSeq++, sentAt: Date.now() }), PROBE_EVERY_MS);
for (let segmentId = 0; segmentId < segmentCount; segmentId++) {
  await playSegment({ room, source, segmentId, shouldStopEarly: GAP_MS === 0 && segmentId % STOP_EVERY_SEGMENTS === 1 });
  await delay(BETWEEN_SEGMENTS_MS);
}
clearInterval(probeTimer);
await send(room, { type: 'finished', sentAt: Date.now() });
await delay(1500);
await room.disconnect();
await dispose();
process.exit(0);
