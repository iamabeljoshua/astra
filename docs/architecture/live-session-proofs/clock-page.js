import { Room, RoomEvent, Track } from 'livekit-client';

const POLL_MS = 10;

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

const records = { worklet: [], data: [], clockMap: [], rtp: [], stats: [] };
window.clockRecords = records;
let audioContext;

function noteClockMap() {
  records.clockMap.push({ contextTime: audioContext.currentTime, epochMs: performance.timeOrigin + performance.now() });
}

function watchReceiver(receiver) {
  setInterval(() => {
    const [source] = receiver.getSynchronizationSources();
    if (source) records.rtp.push({ rtpTimestamp: source.rtpTimestamp, timestamp: source.timestamp, pollEpochMs: performance.timeOrigin + performance.now() });
    noteClockMap();
  }, POLL_MS);
  setInterval(async () => {
    const report = await receiver.getStats();
    report.forEach((entry) => {
      if (entry.type !== 'inbound-rtp') return;
      records.stats.push({
        at: performance.timeOrigin + performance.now(),
        packetsReceived: entry.packetsReceived,
        packetsLost: entry.packetsLost,
        jitter: entry.jitter,
        jitterBufferDelay: entry.jitterBufferDelay,
        jitterBufferEmittedCount: entry.jitterBufferEmittedCount,
        concealedSamples: entry.concealedSamples,
        insertedSamplesForDeceleration: entry.insertedSamplesForDeceleration,
        removedSamplesForAcceleration: entry.removedSamplesForAcceleration,
        totalSamplesReceived: entry.totalSamplesReceived,
        estimatedPlayoutTimestamp: entry.estimatedPlayoutTimestamp,
      });
    });
  }, 1000);
}

async function listenToTrack(track) {
  const element = track.attach();
  element.muted = true;
  document.body.append(element);
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const probe = new AudioWorkletNode(audioContext, 'clock-probe');
  probe.port.onmessage = ({ data }) => records.worklet.push({ ...data, contextSeconds: data.frame / audioContext.sampleRate });
  source.connect(probe);
  watchReceiver(track.receiver);
  window.clockReady = true;
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
    if (topic !== 'clock') return;
    records.data.push({ ...JSON.parse(new TextDecoder().decode(payload)), contextSeconds: audioContext.currentTime, epochMs: performance.timeOrigin + performance.now() });
  });
  await room.connect(url, token);
  return { sampleRate: audioContext.sampleRate, baseLatency: audioContext.baseLatency, outputLatency: audioContext.outputLatency };
};
