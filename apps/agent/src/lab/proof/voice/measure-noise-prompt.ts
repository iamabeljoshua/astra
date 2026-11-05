import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { HeldAudio } from '../../../../../web/src/voice/held-mic-worklet.js';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/hold-noise' }, seconds: { type: 'string', default: '60' } } });

const SPEECH_FOLDER = '/Users/abel/.claude/orchestrate/astra-mvp/vendor-test/speech';
const VOICES = ['say-samantha', 'alice', 'eric'];
const BLOCK = 128;
const WORKLET_RATE = 48_000;
const MANIFEST = JSON.parse(readFileSync(join(SPEECH_FOLDER, 'manifest.json'), 'utf8')) as Record<string, Record<string, unknown>>;

function readClip(voice: string, id: string): Float32Array {
  const bytes = readFileSync(join(SPEECH_FOLDER, voice, `${id}.pcm`));
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  const doubled = new Float32Array(samples.length * 2);
  samples.forEach((sample, index) => {
    doubled[index * 2] = sample / 32768;
    doubled[index * 2 + 1] = sample / 32768;
  });
  return doubled;
}

const ALL_CLIPS = VOICES.flatMap((voice) => Object.keys(MANIFEST[voice] ?? {}).map((id) => readClip(voice, id)));

function makeSpeech(totalSamples: number, gain = 1, startClip = 0): Float32Array {
  const out = new Float32Array(totalSamples);
  let at = 0;
  let index = startClip;
  while (at < totalSamples) {
    const clip = ALL_CLIPS[index % ALL_CLIPS.length] as Float32Array;
    for (let sample = 0; sample < clip.length && at + sample < totalSamples; sample += 1) out[at + sample] = (clip[sample] as number) * gain;
    at += clip.length + Math.floor(WORKLET_RATE * 0.25);
    index += 1;
  }
  return out;
}

const makeWhite = (totalSamples: number, rms: number) => Float32Array.from({ length: totalSamples }, () => (Math.random() * 2 - 1) * rms * Math.sqrt(3));

function makeRumble(totalSamples: number, rms: number): Float32Array {
  const out = new Float32Array(totalSamples);
  let last = 0;
  let energy = 0;
  for (let index = 0; index < totalSamples; index += 1) {
    last = last * 0.995 + (Math.random() * 2 - 1) * 0.1;
    out[index] = last;
    energy += last * last;
  }
  const scale = rms / Math.sqrt(energy / totalSamples);
  return out.map((sample) => sample * scale);
}

function makeBabble(totalSamples: number, rms: number): Float32Array {
  const out = new Float32Array(totalSamples);
  for (let talker = 0; talker < 8; talker += 1) {
    const voice = makeSpeech(totalSamples, 1, talker * 7);
    const offset = Math.floor(Math.random() * WORKLET_RATE * 3);
    for (let index = 0; index < totalSamples; index += 1) out[index] = (out[index] as number) + (voice[(index + offset) % totalSamples] as number);
  }
  let energy = 0;
  for (const sample of out) energy += sample * sample;
  const scale = rms / Math.sqrt(energy / totalSamples);
  return out.map((sample) => sample * scale);
}

function mix(first: Float32Array, second: Float32Array): Float32Array {
  return first.map((sample, index) => sample + (second[index] as number));
}

function getPromptSecond(sound: Float32Array): number | null {
  const held = new HeldAudio();
  held.release();
  const output = new Float32Array(BLOCK);
  for (let at = 0; at + BLOCK <= sound.length; at += BLOCK) {
    held.process(sound.subarray(at, at + BLOCK), output);
    if (held.takeSteadyNoise()) return at / WORKLET_RATE;
  }
  return null;
}

const seconds = Number(args.seconds);
const total = seconds * WORKLET_RATE;
const speech = makeSpeech(total);
const NOISE_MAKERS: Record<string, (rms: number) => Float32Array> = { white: (rms) => makeWhite(total, rms), rumble: (rms) => makeRumble(total, rms), babble: (rms) => makeBabble(total, rms) };
const LEVELS = [0.002, 0.005, 0.008, 0.012, 0.018, 0.025, 0.04, 0.08];

const rows: { noise: string; rms: number; withSpeech: boolean; promptSecond: number | null }[] = [];
for (const speechGain of [1, 0.25]) {
  rows.push({ noise: `none, speech gain ${speechGain}`, rms: 0, withSpeech: true, promptSecond: getPromptSecond(speech.map((sample) => sample * speechGain)) });
}
for (const [noise, make] of Object.entries(NOISE_MAKERS)) {
  for (const rms of LEVELS) {
    const sound = make(rms);
    rows.push({ noise, rms, withSpeech: false, promptSecond: getPromptSecond(sound) });
    rows.push({ noise, rms, withSpeech: true, promptSecond: getPromptSecond(mix(sound, speech)) });
  }
}
const out = args.out as string;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'noise-prompt.json'), `${JSON.stringify({ seconds, rows }, null, 1)}\n`);
for (const row of rows) console.log(`${row.noise.padEnd(24)} rms ${String(row.rms).padEnd(6)} ${row.withSpeech ? 'with speech' : 'alone      '} prompt ${row.promptSecond === null ? 'no' : `at ${row.promptSecond.toFixed(1)} s`}`);
