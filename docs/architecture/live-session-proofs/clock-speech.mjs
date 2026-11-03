// Runs the worklet's logic and the clock on real speech from say, offline, with word positions known exactly.
// Each word is spoken alone and joined with chosen gaps, because say reports no word times of its own.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWordClock } from './clock-rule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_RATE = 48000;
const BLOCK = 128;
const TRIM_THRESHOLD = 0.002;
const STALL_MS = 500;
const SOUNDING_WITHIN_MS = 3;
const SENTENCE = "Once the ball leaves your hand, what's still pushing it toward the hoop? Your hand, right up until it lets go. After that, nothing is pushing it at all.".split(' ');
const PAUSE_AFTER = { 'hand,': 180, 'hoop?': 400, 'go.': 350, 'that,': 150 };
const FOLDER = mkdtempSync(join(tmpdir(), 'astra-clock-speech-'));

function speakWord(word, index) {
  const path = join(FOLDER, `${index}.wav`);
  execFileSync('say', ['-v', 'Samantha', '-r', '170', '--file-format=WAVE', '--data-format=LEF32@48000', '-o', path, word.replace(/[?,.]/g, '')]);
  const bytes = readFileSync(path);
  const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset + bytes.indexOf('data') + 8, bytes.byteOffset + bytes.byteLength));
  let first = 0;
  let last = samples.length - 1;
  while (first < last && Math.abs(samples[first]) < TRIM_THRESHOLD) first += 1;
  while (last > first && Math.abs(samples[last]) < TRIM_THRESHOLD) last -= 1;
  return samples.slice(first, last + 1);
}

const SPOKEN_WORDS = SENTENCE.map(speakWord);
const RANDOM_RUNS = 20;
const WORD_NEAR_LOSS_MS = 50;
const LOST_CASES_MS = [{ lostFromMs: 1500, lostForMs: 800 }, { lostFromMs: 3000, lostForMs: 1500 }, { lostFromMs: 1500, lostForMs: 3000 }];
const LONGEST_RANDOM_PAUSE_MS = 400;

function buildSpeech(stallAfterWord, getPauseMs = (word) => PAUSE_AFTER[word] ?? 0) {
  const words = SPOKEN_WORDS;
  const timelineStartsMs = [];
  const trueStartsMs = [];
  const pieces = [];
  let timelineMs = 0;
  let trueMs = 0;
  words.forEach((samples, index) => {
    timelineStartsMs.push(timelineMs);
    trueStartsMs.push(trueMs);
    const wordMs = (samples.length / SAMPLE_RATE) * 1000;
    const gapMs = getPauseMs(SENTENCE[index]);
    const stallMs = index === stallAfterWord ? STALL_MS : 0;
    pieces.push(samples, new Float32Array(Math.round(((gapMs + stallMs) / 1000) * SAMPLE_RATE)));
    timelineMs += wordMs + gapMs;
    trueMs += wordMs + gapMs + stallMs;
  });
  const audio = new Float32Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let cursor = 0;
  for (const piece of pieces) {
    audio.set(piece, cursor);
    cursor += piece.length;
  }
  return { audio, timelineStartsMs, trueStartsMs };
}

async function loadProbe() {
  let Probe;
  globalThis.AudioWorkletProcessor = class {
    port = { postMessage: (message) => globalThis.onProbeMessage(message) };
  };
  globalThis.registerProcessor = (_name, processor) => {
    Probe = processor;
  };
  await import(pathToFileURL(join(HERE, 'clock-worklet.js')).href);
  return Probe;
}

// The rule first tried: after any silence, the next word not yet fired starts now.
function createNaiveClock(wordStartsMs) {
  let positionZeroAtMs = null;
  let nextUnplayed = 0;
  return {
    getPositionMs: (atMs) => (positionZeroAtMs === null ? null : atMs - positionZeroAtMs),
    markFired: (index) => {
      nextUnplayed = index + 1;
    },
    onOnset(atMs) {
      positionZeroAtMs = atMs - wordStartsMs[Math.min(nextUnplayed, wordStartsMs.length - 1)];
    },
    onEnd() {},
  };
}

function buildLostSpeech({ lostFromMs, lostForMs }) {
  const speech = buildSpeech(-1);
  const audio = speech.audio.slice();
  audio.fill(0, Math.round((lostFromMs / 1000) * SAMPLE_RATE), Math.round(((lostFromMs + lostForMs) / 1000) * SAMPLE_RATE));
  const isWordKept = (startMs) => startMs < lostFromMs - WORD_NEAR_LOSS_MS || startMs > lostFromMs + lostForMs;
  return { ...speech, audio, keptWords: speech.trueStartsMs.map(isWordKept) };
}

function fireWords({ Probe, audio, timelineStartsMs, trueStartsMs, clock, isLost = () => false, keptWords }) {
  const firedAtMs = [];
  globalThis.onProbeMessage = ({ kind, frame }) => {
    const atMs = (frame / SAMPLE_RATE) * 1000;
    if (kind === 'onset') clock.onOnset(atMs, { isAudioLost: isLost(atMs) });
    if (kind === 'end') clock.onEnd(atMs);
  };
  const probe = new Probe();
  for (let frame = 0; frame < audio.length + SAMPLE_RATE; frame += BLOCK) {
    globalThis.currentFrame = frame;
    const block = new Float32Array(BLOCK);
    block.set(audio.subarray(frame, frame + BLOCK));
    probe.process([[block]]);
    const nowMs = ((frame + BLOCK) / SAMPLE_RATE) * 1000;
    const positionMs = clock.getPositionMs(nowMs);
    // A cue waits for sound, so one due during a stall fires when the audio returns and not before.
    const isSoundingNow = nowMs - (probe.lastAudibleFrame / SAMPLE_RATE) * 1000 <= SOUNDING_WITHIN_MS;
    while (positionMs !== null && firedAtMs.length < timelineStartsMs.length && positionMs >= timelineStartsMs[firedAtMs.length] && isSoundingNow) {
      clock.markFired?.(firedAtMs.length);
      firedAtMs.push(nowMs);
    }
  }
  const errors = firedAtMs.map((atMs, index) => atMs - trueStartsMs[index]).filter((_, index) => keptWords?.[index] ?? true);
  const absolute = errors.map(Math.abs).sort((a, b) => a - b);
  return { words: firedAtMs.length, of: timelineStartsMs.length, absP50: Math.round(absolute[Math.floor(absolute.length * 0.5)]), absP95: Math.round(absolute[Math.floor(absolute.length * 0.95)]), absMax: Math.round(absolute.at(-1)) };
}

const Probe = await loadProbe();
const natural = buildSpeech(-1);
const stalled = buildSpeech(6);
const randomErrors = Array.from({ length: RANDOM_RUNS }, (_, run) => {
  const speech = buildSpeech(run % SENTENCE.length, () => (Math.random() < 0.5 ? 0 : Math.random() * LONGEST_RANDOM_PAUSE_MS));
  return fireWords({ Probe, ...speech, clock: createWordClock(speech.timelineStartsMs) });
});
const lostRows = LOST_CASES_MS.map((lost) => {
  const speech = buildLostSpeech(lost);
  const isLost = (atMs) => atMs >= lost.lostFromMs + lost.lostForMs - WORD_NEAR_LOSS_MS;
  return {
    ...lost,
    ruleWithoutRtp: fireWords({ Probe, ...speech, clock: createWordClock(speech.timelineStartsMs) }),
    ruleWithRtp: fireWords({ Probe, ...speech, isLost, clock: createWordClock(speech.timelineStartsMs) }),
  };
});
const summary = {
  lostAudio: lostRows,
  randomPausesAndAStall: { runs: RANDOM_RUNS, worstAbsP95: Math.max(...randomErrors.map((row) => row.absP95)), worstAbsMax: Math.max(...randomErrors.map((row) => row.absMax)), allWordsFired: randomErrors.every((row) => row.words === row.of) },
  naturalPauses: {
    restartOnNextUnplayedWord: fireWords({ Probe, ...natural, clock: createNaiveClock(natural.timelineStartsMs) }),
    chosenRule: fireWords({ Probe, ...natural, clock: createWordClock(natural.timelineStartsMs) }),
  },
  pausesAnd500msStall: {
    restartOnNextUnplayedWord: fireWords({ Probe, ...stalled, clock: createNaiveClock(stalled.timelineStartsMs) }),
    chosenRule: fireWords({ Probe, ...stalled, clock: createWordClock(stalled.timelineStartsMs) }),
  },
};
mkdirSync(join(HERE, 'runs', 'clock-speech'), { recursive: true });
writeFileSync(join(HERE, 'runs', 'clock-speech', 'speech.json'), `${JSON.stringify({ summary }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
