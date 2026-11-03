import { Room, RoomEvent, Track } from 'livekit-client';
import { createWordClock } from './clock-rule.mjs';

const YIELD_GAIN = 0.25;
const TICK_MS = 4;
const records = { events: [], turns: [] };
window.boardRecords = records;
let audioContext;
let gain;
let room;
let turn = null;
const now = () => audioContext.currentTime * 1000;
const note = (kind, fields = {}) => records.events.push({ kind, atMs: now(), epochMs: performance.timeOrigin + performance.now(), turnId: turn?.turnId, ...fields });

function startTurn(turnId, reply) {
  const wordStartsMs = [];
  turn = { turnId, reply, wordStartsMs, clock: createWordClock(wordStartsMs), sounding: false, cues: [], fired: [], frozen: false, playedWords: 0, heardOnset: false };
  records.turns.push(turn);
  note('turnStarted', { reply });
}

function getPlayedWords(position) {
  let count = 0;
  while (count < turn.wordStartsMs.length && turn.wordStartsMs[count] <= position) count += 1;
  return count;
}

function tick() {
  if (!turn || turn.frozen || !turn.heardOnset) return;
  const position = turn.clock.getPositionMs(now());
  turn.playedWords = Math.max(turn.playedWords, getPlayedWords(position));
  if (!turn.sounding) return;
  for (const cue of turn.cues) {
    if (cue.firedAtMs !== undefined) continue;
    const startMs = turn.wordStartsMs[cue.atWord];
    if (startMs !== undefined && position >= startMs) {
      cue.firedAtMs = now();
      turn.fired.push({ atWord: cue.atWord, id: cue.command.id, kind: cue.command.kind });
      note('cueFired', { atWord: cue.atWord, id: cue.command.id, positionMs: position, wordStartMs: startMs });
    }
  }
}

function onStop(via, at) {
  note('stopReceived', { via, sentAt: at });
  if (!turn || turn.frozen) return;
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  turn.frozen = true;
  const positionMs = turn.clock.getPositionMs(now());
  turn.playedWords = Math.max(turn.playedWords, getPlayedWords(positionMs));
  turn.frozenAtMs = now();
  note('frozen', { via, positionMs, playedWords: turn.playedWords, firedCount: turn.fired.length });
  const report = { type: 'played', turnId: turn.turnId, playedWords: turn.playedWords, ending: 'interrupted', fired: turn.fired };
  room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(report)), { reliable: true, topic: 'astra.live' });
}

function onMessage(message) {
  if (message.type === 'turnStarted') {
    gain.gain.setValueAtTime(1, audioContext.currentTime);
    startTurn(message.turnId, message.reply);
    return;
  }
  if (message.type === 'stop') return onStop(message.via, message.at);
  if (message.type === 'yield') {
    note('yield', { isYielding: message.isYielding });
    if (!turn?.frozen) gain.gain.setValueAtTime(message.isYielding ? YIELD_GAIN : 1, audioContext.currentTime);
    return;
  }
  const target = records.turns.find((item) => item.turnId === message.turnId);
  if (!target) return;
  if (message.type === 'cue') {
    target.cues.push({ atWord: message.atWord, command: message.command, receivedAtMs: now(), receivedAfterFreeze: target.frozen });
    note('cueReceived', { atWord: message.atWord, id: message.command.id, afterFreeze: target.frozen });
  }
  if (message.type === 'wordTimes') {
    for (const word of message.words) target.wordStartsMs.push(word.startMs);
    note('wordTimes', { count: message.words.length, afterFreeze: target.frozen });
  }
}

async function listenToTrack(track) {
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const before = new AudioWorkletNode(audioContext, 'clock-probe');
  const after = new AudioWorkletNode(audioContext, 'clock-probe');
  gain = audioContext.createGain();
  const toMs = (frame) => (frame / audioContext.sampleRate) * 1000;
  before.port.onmessage = ({ data }) => {
    const atMs = toMs(data.frame);
    records.events.push({ kind: `arriving-${data.kind}`, atMs, turnId: turn?.turnId });
    if (!turn) return;
    if (data.kind === 'onset') {
      turn.heardOnset = true;
      turn.sounding = true;
      turn.clock.onOnset(atMs);
    }
    if (data.kind === 'end') {
      turn.sounding = false;
      turn.clock.onEnd(atMs);
    }
  };
  after.port.onmessage = ({ data }) => records.events.push({ kind: `output-${data.kind}`, atMs: toMs(data.frame), turnId: turn?.turnId });
  source.connect(before);
  source.connect(gain);
  gain.connect(after);
  gain.connect(audioContext.destination);
  // The stream must be attached somewhere for Chromium to pull remote audio.
  const element = track.attach();
  element.muted = true;
  document.body.append(element);
  window.boardReady = true;
}

const isTutorAudio = (track, participant) => track.kind === Track.Kind.Audio && participant.identity.startsWith('agent');

window.startBoard = async ({ url, token }) => {
  audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  await audioContext.audioWorklet.addModule('/clock-worklet.js');
  await audioContext.resume();
  room = new Room({ adaptiveStream: false, dynacast: false });
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    records.events.push({ kind: 'trackSubscribed', atMs: audioContext.currentTime * 1000, identity: participant.identity, audio: track.kind === Track.Kind.Audio });
    if (isTutorAudio(track, participant)) listenToTrack(track);
  });
  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    if (topic === 'astra.live') onMessage(JSON.parse(new TextDecoder().decode(payload)));
  });
  await room.connect(url, token);
  setInterval(tick, TICK_MS);
  return { sampleRate: audioContext.sampleRate, baseLatency: audioContext.baseLatency, outputLatency: audioContext.outputLatency };
};
