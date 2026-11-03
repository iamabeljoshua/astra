import { Room, RoomEvent, Track } from 'livekit-client';
import { createWordClock } from './clock-rule.mjs';

const YIELD_GAIN = 0.25;
const TICK_MS = 4;
const RECENT_SOUND_MS = 300;
const records = { events: [], turns: [] };
window.boardRecords = records;
let audioContext;
let gain;
let room;
let turn = null;
let isBlockAudible = false;
let isSounding = false;
let lastOnsetMs = null;
let lastEndMs = null;
const runningSimulations = new Map();
const now = () => audioContext.currentTime * 1000;
const note = (kind, fields = {}) => records.events.push({ kind, atMs: now(), epochMs: performance.timeOrigin + performance.now(), turnId: turn?.turnId, ...fields });
const send = (message) => room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: 'astra.live' });

function startTurn(turnId, reply) {
  turn = { turnId, reply, wordStartsMs: [], clock: createWordClock(), cues: [], fired: [], frozen: false, playedWords: 0, hasFirstSound: false, beats: [], questionWords: [] };
  records.turns.push(turn);
  note('turnStarted', { reply });
  // On a poor link the audio can arrive first, so an onset already sounding belongs to this turn.
  const isSoundRecent = isSounding || (lastEndMs !== null && now() - lastEndMs <= RECENT_SOUND_MS);
  if (isSoundRecent && lastOnsetMs !== null) startClock(lastOnsetMs);
}

function startClock(atMs) {
  turn.hasFirstSound = true;
  turn.firstSoundAtMs = atMs;
  turn.clock.onFirstSound(atMs);
}

function getPlayedWords(position) {
  let count = 0;
  while (count < turn.wordStartsMs.length && turn.wordStartsMs[count] <= position) count += 1;
  return count;
}

function applyCue(cue, atMs) {
  const { command } = cue;
  if (command.kind === 'runSimulation' && command.action === 'play') runningSimulations.set(command.target, atMs);
}

function tick() {
  if (!turn || turn.frozen || !turn.hasFirstSound || !isBlockAudible) return;
  const position = turn.clock.getPositionMs(now(), turn.wordStartsMs[0] ?? 0);
  turn.playedWords = Math.max(turn.playedWords, getPlayedWords(position));
  for (const word of turn.questionWords) {
    if (word.isSent || turn.wordStartsMs[word.at] === undefined || position < turn.wordStartsMs[word.at]) continue;
    word.isSent = true;
    note('questionHeard', { atWord: word.at });
    send({ type: 'questionHeard', turnId: turn.turnId, beatId: word.beatId, startedMsAgo: 0 });
  }
  for (const cue of turn.cues) {
    if (cue.firedAtMs !== undefined) continue;
    const startMs = turn.wordStartsMs[cue.atWord];
    if (startMs !== undefined && position >= startMs) {
      cue.firedAtMs = now();
      applyCue(cue, cue.firedAtMs);
      turn.fired.push({ atWord: cue.atWord, id: cue.command.id, kind: cue.command.kind, target: cue.command.target, action: cue.command.action, atMs: Math.round(cue.firedAtMs - turn.firstSoundAtMs) });
      note('cueFired', { atWord: cue.atWord, id: cue.command.id, commandKind: cue.command.kind, positionMs: position, wordStartMs: startMs });
    }
  }
}

function freezeSimulations() {
  const frozen = [...runningSimulations].map(([target, startedAtMs]) => ({ target, simulationSeconds: Math.round(now() - startedAtMs) / 1000 }));
  runningSimulations.clear();
  return frozen;
}

function onStop(via, at) {
  note('stopReceived', { via, sentAt: at });
  if (!turn || turn.frozen) return;
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  turn.frozen = true;
  const positionMs = turn.hasFirstSound ? turn.clock.getPositionMs(now(), turn.wordStartsMs[0] ?? 0) : 0;
  if (isBlockAudible && turn.hasFirstSound) turn.playedWords = Math.max(turn.playedWords, getPlayedWords(positionMs));
  turn.frozenAtMs = now();
  const frozen = freezeSimulations();
  note('frozen', { via, positionMs, playedWords: turn.playedWords, firedCount: turn.fired.length, frozen });
  send({ type: 'played', turnId: turn.turnId, playedWords: turn.playedWords, ending: 'interrupted', fired: turn.fired, firedCueMs: turn.fired.map((cue) => cue.atMs), frozen, startedMsAgo: 0 });
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
    note('wordTimes', { count: message.words.length, afterFreeze: target.frozen, lateByMs: target.hasFirstSound ? now() - target.firstSoundAtMs : null });
  }
  if (message.type === 'audioGap') {
    target.clock.addGap(message);
    target.gapLengths ??= new Set();
    if (message.ms !== undefined && !target.gapLengths.has(message.atMs)) {
      target.gapLengths.add(message.atMs);
      note('audioGap', { gapAtMs: message.atMs, ms: message.ms });
    }
  }
  if (message.type === 'beatClosed' && message.expectsReply) target.questionWords.push({ at: message.firstWord + message.wordCount - 1, beatId: message.beatId, isSent: false });
}

function onProbe(kind, atMs) {
  if (kind === 'onset') {
    isSounding = true;
    lastOnsetMs = atMs;
    if (turn && !turn.hasFirstSound) startClock(atMs);
  }
  if (kind === 'end') {
    isSounding = false;
    lastEndMs = atMs;
  }
  if (kind === 'sound') isBlockAudible = true;
  if (kind === 'quiet') isBlockAudible = false;
}

async function listenToTrack(track) {
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const before = new AudioWorkletNode(audioContext, 'clock-probe');
  const after = new AudioWorkletNode(audioContext, 'clock-probe');
  gain = audioContext.createGain();
  const toMs = (frame) => (frame / audioContext.sampleRate) * 1000;
  before.port.onmessage = ({ data }) => {
    const atMs = toMs(data.frame);
    if (data.kind !== 'sound' && data.kind !== 'quiet') records.events.push({ kind: `arriving-${data.kind}`, atMs, turnId: turn?.turnId });
    onProbe(data.kind, atMs);
  };
  after.port.onmessage = ({ data }) => {
    if (data.kind !== 'sound' && data.kind !== 'quiet') records.events.push({ kind: `output-${data.kind}`, atMs: toMs(data.frame), turnId: turn?.turnId });
  };
  source.connect(before);
  source.connect(gain);
  gain.connect(after);
  gain.connect(audioContext.destination);
  // The stream must be attached somewhere for Chromium to pull remote audio.
  const element = track.attach();
  element.muted = true;
  document.body.append(element);
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
