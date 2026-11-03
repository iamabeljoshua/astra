import { Room, RoomEvent, Track } from 'livekit-client';
import { createGuessingClock, getIsLostByRtp, getIsLostBySequence } from './clock-rejected.mjs';
import { createWordClock } from './clock-rule.mjs';

const POLL_MS = 10;
const STATS_POLL_MS = 50;
const TICK_MS = 4;
const RTP_CLOCK_HZ = 48000;
const RECENT_SOUND_MS = 300;

// Sends WebRTC through the local relay that delays and drops packets, by rewriting what the server offers.
function routeThroughRelay(serverPort, relayPort) {
  const isIpv4Udp = (line) => / udp /.test(line) && /\d+\.\d+\.\d+\.\d+ /.test(line) && line.includes(' typ host');
  const rewriteLine = (line) => line.replace(` ${serverPort} typ host`, ` ${relayPort} typ host`);
  const rewriteSdp = (sdp) =>
    sdp
      .split('\r\n')
      .filter((line) => !line.startsWith('a=candidate') || isIpv4Udp(line))
      .map((line) => (line.startsWith('a=candidate') ? rewriteLine(line) : line))
      .join('\r\n');
  // Hide the browser's own address from the server, or the two find a direct path around the relay.
  const onIceCandidate = Object.getOwnPropertyDescriptor(RTCPeerConnection.prototype, 'onicecandidate');
  Object.defineProperty(RTCPeerConnection.prototype, 'onicecandidate', {
    get() {
      return onIceCandidate.get.call(this);
    },
    set(handler) {
      onIceCandidate.set.call(this, (event) => {
        if (!event.candidate) handler(event);
      });
    },
  });
  const addIceCandidate = RTCPeerConnection.prototype.addIceCandidate;
  RTCPeerConnection.prototype.addIceCandidate = function (candidate, ...rest) {
    if (!candidate?.candidate) return addIceCandidate.call(this, candidate, ...rest);
    if (!isIpv4Udp(candidate.candidate)) return Promise.resolve();
    const init = candidate.toJSON?.() ?? candidate;
    return addIceCandidate.call(this, { ...init, candidate: rewriteLine(candidate.candidate) }, ...rest);
  };
  const setRemoteDescription = RTCPeerConnection.prototype.setRemoteDescription;
  RTCPeerConnection.prototype.setRemoteDescription = function (description, ...rest) {
    return setRemoteDescription.call(this, { type: description.type, sdp: rewriteSdp(description.sdp) }, ...rest);
  };
}

const records = { worklet: [], data: [], clockMap: [], rtp: [], stats: [], fired: [], decisions: [], firstSounds: [] };
window.clockRecords = records;
let audioContext;
let receiver;
let segment = null;
let isBlockAudible = false;
let isSounding = false;
let lastOnsetMs = null;
let lastEndMs = null;
let rtpAtLastOnset = null;
let lostAtSilenceStart = 0;

const nowMs = () => audioContext.currentTime * 1000;
const toEpochMs = (contextMs) => performance.timeOrigin + performance.now() - (nowMs() - contextMs);
const readRtp = () => receiver?.getSynchronizationSources()[0]?.rtpTimestamp;
const rtpPolls = () => records.rtp.map((poll) => ({ atMs: poll.pollEpochMs, rtpTimestamp: poll.rtpTimestamp }));
const statsNow = async () => {
  let inbound = null;
  (await receiver.getStats()).forEach((entry) => {
    if (entry.type === 'inbound-rtp') inbound = entry;
  });
  return inbound;
};

function firstWordStartMs() {
  return segment.wordStartsMs[0] ?? 0;
}

function createMethods(wordStartsMs) {
  const chosen = createWordClock();
  const guessBySequence = createGuessingClock(wordStartsMs);
  const guessByRtp = createGuessingClock(wordStartsMs);
  const guessByRtpOldGate = createGuessingClock(wordStartsMs);
  const countOnly = createWordClock();
  return {
    chosen: { clock: chosen, next: 0, position: (at) => chosen.getPositionMs(at, firstWordStartMs()), isOpen: () => isBlockAudible },
    guessBySequence: { clock: guessBySequence, next: 0, position: (at) => guessBySequence.getPositionMs(at), isPending: false, isOpen() { return isBlockAudible && !this.isPending; } },
    guessByRtp: { clock: guessByRtp, next: 0, position: (at) => guessByRtp.getPositionMs(at), isOpen: () => isBlockAudible },
    guessByRtpOldGate: { clock: guessByRtpOldGate, next: 0, position: (at) => guessByRtpOldGate.getPositionMs(at), isOpen: () => isSounding },
    countOnly: { clock: countOnly, next: 0, position: (at) => countOnly.getPositionMs(at, firstWordStartMs()), isOpen: () => isBlockAudible },
    rtpOnly: { next: 0, position: () => (segment.rtpAtFirstSound === undefined || readRtp() === undefined ? null : ((readRtp() - segment.rtpAtFirstSound) / RTP_CLOCK_HZ) * 1000), isOpen: () => isBlockAudible },
  };
}

function startSegment(message) {
  segment = { ...message, methods: createMethods(message.wordStartsMs) };
  // A late message can land in a pause in this turn's speech, and the last turn's audio ended long before.
  const isSoundRecent = isSounding || (lastEndMs !== null && nowMs() - lastEndMs <= RECENT_SOUND_MS);
  if (isSoundRecent && lastOnsetMs !== null) startClocks(lastOnsetMs);
}

function startClocks(atMs) {
  for (const name of ['chosen', 'countOnly']) segment.methods[name].clock.onFirstSound(atMs);
  for (const name of ['guessBySequence', 'guessByRtp', 'guessByRtpOldGate']) segment.methods[name].clock.onOnset(atMs);
  segment.hasFirstSound = true;
  segment.rtpAtFirstSound = rtpAtLastOnset ?? undefined;
  records.firstSounds.push({ segmentId: segment.segmentId, contextSeconds: atMs / 1000 });
}

function onSilenceOver(atMs) {
  if (!segment) return;
  if (!segment.hasFirstSound) {
    startClocks(atMs);
    return;
  }
  const silenceMs = atMs - lastEndMs;
  const isLostByRtp = getIsLostByRtp({ silenceStartMs: toEpochMs(lastEndMs), silenceEndMs: toEpochMs(atMs), rtpPolls: rtpPolls(), rtpClockHz: RTP_CLOCK_HZ });
  segment.methods.guessByRtp.clock.onOnset(atMs, { isAudioLost: isLostByRtp });
  segment.methods.guessByRtpOldGate.clock.onOnset(atMs, { isAudioLost: isLostByRtp });
  const bySequence = segment.methods.guessBySequence;
  bySequence.isPending = true;
  const lostBefore = lostAtSilenceStart;
  const segmentThen = segment;
  statsNow().then((inbound) => {
    const packetsLostDuringSilence = (inbound?.packetsLost ?? 0) - lostBefore;
    const isLostBySequence = getIsLostBySequence({ packetsLostDuringSilence, silenceMs });
    bySequence.clock.onOnset(atMs, { isAudioLost: isLostBySequence });
    bySequence.isPending = false;
    records.decisions.push({ segmentId: segmentThen.segmentId, atMs, silenceMs, isLostByRtp, isLostBySequence, packetsLostDuringSilence });
  });
}

function onWorkletEvent(event) {
  if (event.kind === 'onset') {
    isSounding = true;
    lastOnsetMs = event.atMs;
    rtpAtLastOnset = readRtp() ?? null;
    onSilenceOver(event.atMs);
  } else if (event.kind === 'end') {
    isSounding = false;
    lastEndMs = event.atMs;
    if (segment) for (const name of ['guessBySequence', 'guessByRtp', 'guessByRtpOldGate']) segment.methods[name].clock.onEnd(event.atMs);
  } else if (event.kind === 'sound') {
    isBlockAudible = true;
  } else if (event.kind === 'quiet') {
    isBlockAudible = false;
  }
}

function tick() {
  if (!segment) return;
  const at = nowMs();
  for (const [name, method] of Object.entries(segment.methods)) {
    if (!method.isOpen()) continue;
    const position = method.position(at);
    while (position !== null && method.next < segment.wordStartsMs.length && position >= segment.wordStartsMs[method.next]) {
      records.fired.push({ method: name, segmentId: segment.segmentId, wordIndex: method.next, contextSeconds: at / 1000 });
      method.next += 1;
    }
  }
}

function watchReceiver() {
  setInterval(() => {
    const [source] = receiver.getSynchronizationSources();
    if (source) records.rtp.push({ rtpTimestamp: source.rtpTimestamp, timestamp: source.timestamp, pollEpochMs: performance.timeOrigin + performance.now() });
    records.clockMap.push({ contextTime: audioContext.currentTime, epochMs: performance.timeOrigin + performance.now() });
  }, POLL_MS);
  setInterval(async () => {
    const entry = await statsNow();
    if (!entry) return;
    if (isSounding) lostAtSilenceStart = entry.packetsLost;
    records.stats.push({
      at: performance.timeOrigin + performance.now(),
      packetsReceived: entry.packetsReceived,
      packetsLost: entry.packetsLost,
      packetsDiscarded: entry.packetsDiscarded,
      jitter: entry.jitter,
      jitterBufferDelay: entry.jitterBufferDelay,
      jitterBufferEmittedCount: entry.jitterBufferEmittedCount,
      concealedSamples: entry.concealedSamples,
      silentConcealedSamples: entry.silentConcealedSamples,
      insertedSamplesForDeceleration: entry.insertedSamplesForDeceleration,
      removedSamplesForAcceleration: entry.removedSamplesForAcceleration,
      totalSamplesReceived: entry.totalSamplesReceived,
    });
  }, STATS_POLL_MS);
}

async function listenToTrack(track) {
  receiver = track.receiver;
  const element = track.attach();
  element.muted = true;
  document.body.append(element);
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const probe = new AudioWorkletNode(audioContext, 'clock-probe');
  probe.port.onmessage = ({ data }) => {
    const atMs = (data.frame / audioContext.sampleRate) * 1000;
    if (data.kind !== 'sound' && data.kind !== 'quiet') records.worklet.push({ ...data, contextSeconds: atMs / 1000 });
    onWorkletEvent({ ...data, atMs });
  };
  source.connect(probe);
  watchReceiver();
  setInterval(tick, TICK_MS);
}

function onMessage(message) {
  records.data.push({ ...message, contextSeconds: audioContext.currentTime, epochMs: performance.timeOrigin + performance.now() });
  if (message.type === 'segment') startSegment(message);
  if (message.type === 'audioGap' && segment?.segmentId === message.segmentId) segment.methods.chosen.clock.addGap(message);
  if (message.type === 'word') records.fired.push({ method: 'dataMessage', segmentId: message.segmentId, wordIndex: message.wordIndex, contextSeconds: audioContext.currentTime });
}

window.startClockProof = async ({ url, token, relay }) => {
  if (relay) routeThroughRelay(relay.serverPort, relay.relayPort);
  audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  await audioContext.audioWorklet.addModule('/clock-worklet.js');
  await audioContext.resume();
  const room = new Room({ adaptiveStream: false, dynacast: false });
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) listenToTrack(track);
  });
  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    if (topic === 'clock') onMessage(JSON.parse(new TextDecoder().decode(payload)));
  });
  await room.connect(url, token);
  return { sampleRate: audioContext.sampleRate, baseLatency: audioContext.baseLatency, outputLatency: audioContext.outputLatency };
};
