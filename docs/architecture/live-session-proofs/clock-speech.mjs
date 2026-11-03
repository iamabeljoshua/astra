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
const SENTENCE = "Once the ball leaves your hand, what's still pushing it toward the hoop? Your hand, right up until it lets go. After that, nothing is pushing it at all.".split(' ');
const PAUSE_AFTER = { 'hand,': 180, 'hoop?': 400, 'go.': 350, 'that,': 150 };
const FOLDER = mkdtempSync(join(tmpdir(), 'astra-clock-speech-'));
const RANDOM_RUNS = 20;
const LONGEST_RANDOM_PAUSE_MS = 400;
const WORD_NEAR_LOSS_MS = 50;
const LOST_CASES_MS = [{ lostFromMs: 1500, lostForMs: 800 }, { lostFromMs: 3000, lostForMs: 1500 }, { lostFromMs: 1500, lostForMs: 3000 }];
const NOISE_MS = 30;

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

function buildSpeech({ stallAtWord = -1, stallIntoWord = 0, getPauseMs = (word) => PAUSE_AFTER[word] ?? 0 } = {}) {
  const timelineStartsMs = [];
  const trueStartsMs = [];
  const pieces = [];
  const gaps = [];
  let timelineMs = 0;
  let trueMs = 0;
  SPOKEN_WORDS.forEach((samples, index) => {
    timelineStartsMs.push(timelineMs);
    trueStartsMs.push(trueMs + (index === stallAtWord && stallIntoWord === 0 ? STALL_MS : 0));
    const wordMs = (samples.length / SAMPLE_RATE) * 1000;
    const gapMs = getPauseMs(SENTENCE[index]);
    if (index === stallAtWord) {
      const splitAt = Math.round(samples.length * stallIntoWord);
      gaps.push({ atMs: timelineMs + (splitAt / SAMPLE_RATE) * 1000, ms: STALL_MS });
      pieces.push(samples.subarray(0, splitAt), new Float32Array(Math.round((STALL_MS / 1000) * SAMPLE_RATE)), samples.subarray(splitAt));
      trueMs += STALL_MS;
    } else {
      pieces.push(samples);
    }
    pieces.push(new Float32Array(Math.round((gapMs / 1000) * SAMPLE_RATE)));
    timelineMs += wordMs + gapMs;
    trueMs += wordMs + gapMs;
  });
  const audio = new Float32Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let cursor = 0;
  for (const piece of pieces) {
    audio.set(piece, cursor);
    cursor += piece.length;
  }
  return { audio, timelineStartsMs, trueStartsMs, gaps };
}

function loseAudio(speech, { lostFromMs, lostForMs }) {
  const audio = speech.audio.slice();
  audio.fill(0, Math.round((lostFromMs / 1000) * SAMPLE_RATE), Math.round(((lostFromMs + lostForMs) / 1000) * SAMPLE_RATE));
  const isWordKept = (startMs) => startMs < lostFromMs - WORD_NEAR_LOSS_MS || startMs > lostFromMs + lostForMs;
  return { ...speech, audio, keptWords: speech.trueStartsMs.map(isWordKept) };
}

function addWordTimeNoise(speech) {
  const noisy = speech.timelineStartsMs.map((startMs) => startMs + NOISE_MS * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()));
  noisy[0] = speech.timelineStartsMs[0];
  return { ...speech, timelineStartsMs: noisy };
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

function fireWords({ Probe, audio, timelineStartsMs, trueStartsMs, gaps, keptWords, usesGaps = true }) {
  const clock = createWordClock();
  if (usesGaps) for (const gap of gaps) clock.addGap(gap);
  let isAudible = false;
  const firedAtMs = [];
  globalThis.onProbeMessage = ({ kind, frame }) => {
    if (kind === 'onset') clock.onFirstSound((frame / SAMPLE_RATE) * 1000);
    if (kind === 'sound') isAudible = true;
    if (kind === 'quiet') isAudible = false;
  };
  const probe = new Probe();
  for (let frame = 0; frame < audio.length + SAMPLE_RATE; frame += BLOCK) {
    globalThis.currentFrame = frame;
    const block = new Float32Array(BLOCK);
    block.set(audio.subarray(frame, frame + BLOCK));
    probe.process([[block]]);
    const nowMs = ((frame + BLOCK) / SAMPLE_RATE) * 1000;
    const positionMs = clock.getPositionMs(nowMs, timelineStartsMs[0]);
    while (isAudible && positionMs !== null && firedAtMs.length < timelineStartsMs.length && positionMs >= timelineStartsMs[firedAtMs.length]) firedAtMs.push(nowMs);
  }
  const errors = firedAtMs.map((atMs, index) => atMs - trueStartsMs[index]).filter((_, index) => keptWords?.[index] ?? true);
  const absolute = errors.map(Math.abs).sort((a, b) => a - b);
  return { words: firedAtMs.length, of: timelineStartsMs.length, absP50: Math.round(absolute[Math.floor(absolute.length * 0.5)]), absP95: Math.round(absolute[Math.floor(absolute.length * 0.95)]), absMax: Math.round(absolute.at(-1)) };
}

function summarizeRuns(rows) {
  return { runs: rows.length, worstAbsP95: Math.max(...rows.map((row) => row.absP95)), worstAbsMax: Math.max(...rows.map((row) => row.absMax)), medianAbsP95: rows.map((row) => row.absP95).sort((a, b) => a - b)[Math.floor(rows.length / 2)], allWordsFired: rows.every((row) => row.words === row.of) };
}

const Probe = await loadProbe();
const randomPause = () => (Math.random() < 0.5 ? 0 : Math.random() * LONGEST_RANDOM_PAUSE_MS);
const repeat = (makeRow) => summarizeRuns(Array.from({ length: RANDOM_RUNS }, (_, run) => makeRow(run)));
const summary = {
  naturalPauses: fireWords({ Probe, ...buildSpeech() }),
  stallAtAWordStart: fireWords({ Probe, ...buildSpeech({ stallAtWord: 6 }) }),
  stallAtAWordStartWithNoGapReport: fireWords({ Probe, ...buildSpeech({ stallAtWord: 6 }), usesGaps: false }),
  randomPausesAndAStall: repeat((run) => fireWords({ Probe, ...buildSpeech({ stallAtWord: 1 + (run % (SENTENCE.length - 1)), getPauseMs: randomPause }) })),
  stallInsideAWord: repeat((run) => fireWords({ Probe, ...buildSpeech({ stallAtWord: 1 + (run % (SENTENCE.length - 1)), stallIntoWord: 0.5, getPauseMs: randomPause }) })),
  lostAudio: LOST_CASES_MS.map((lost) => ({ ...lost, ...fireWords({ Probe, ...loseAudio(buildSpeech(), lost) }) })),
  wordTimesWith30MsNoise: repeat(() => fireWords({ Probe, ...addWordTimeNoise(buildSpeech()) })),
};
mkdirSync(join(HERE, 'runs', 'clock-speech'), { recursive: true });
writeFileSync(join(HERE, 'runs', 'clock-speech', 'speech.json'), `${JSON.stringify({ summary }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
