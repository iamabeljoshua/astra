import { type Beat, getBeatText, getSpokenWords, getCues } from '@astra/contracts';
import { AUDIBLE_SAMPLE } from '../../live/first-sound.ts';

const ANALYSIS_RATE = 8000;
const WINDOW_BEFORE_MS = 40;
const WINDOW_AFTER_MS = 300;
const NEAR_SEARCH_MS = 200;
const FAR_SEARCH_MS = 1800;
const GOOD_MATCH = 0.55;
const QUIET_RUN_MS = 40;

export interface Percentiles {
  count: number;
  p50: number | null;
  p95: number | null;
  worst: number | null;
  best: number | null;
}

export function getPercentiles(values: readonly number[]): Percentiles {
  if (values.length === 0) return { count: 0, p50: null, p95: null, worst: null, best: null };
  const sorted = [...values].sort((first, second) => first - second);
  const at = (share: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] as number);
  return { count: values.length, p50: at(0.5), p95: at(0.95), worst: Math.round(sorted.at(-1) as number), best: Math.round(sorted[0] as number) };
}

const BURST_LEVEL = 8000;
const BURST_WINDOW_MS = 5;
const BURST_SPACING_MS = 150;

/** Where each fake word's loud start really arrived. Every fake word is the same tone, so matching words by shape would find the wrong one, and counting bursts cannot. */
export function findToneBursts(heard: Int16Array, rate: number): number[] {
  const windowSamples = Math.max(1, Math.round((BURST_WINDOW_MS / 1000) * rate));
  const bursts: number[] = [];
  let lastLoudMs = Number.NEGATIVE_INFINITY;
  for (let start = 0; start < heard.length; start += windowSamples) {
    const isLoud = heard.subarray(start, start + windowSamples).some((sample) => Math.abs(sample) > BURST_LEVEL);
    if (!isLoud) continue;
    const atMs = (start / rate) * 1000;
    if (atMs - lastLoudMs > BURST_SPACING_MS) bursts.push(atMs);
    lastLoudMs = atMs;
  }
  return bursts;
}

export function resample(samples: Int16Array, fromRate: number, toRate: number): Float32Array {
  const output = new Float32Array(Math.floor((samples.length * toRate) / fromRate));
  const ratio = fromRate / toRate;
  for (let index = 0; index < output.length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let source = start; source < end; source++) sum += samples[source] ?? 0;
    output[index] = sum / (end - start);
  }
  return output;
}

function getMatch({ sent, heard, sentStart, heardStart, length }: { sent: Float32Array; heard: Float32Array; sentStart: number; heardStart: number; length: number }): number {
  let cross = 0;
  let sentEnergy = 0;
  let heardEnergy = 0;
  for (let offset = 0; offset < length; offset++) {
    const first = sent[sentStart + offset] ?? 0;
    const second = heard[heardStart + offset] ?? 0;
    cross += first * second;
    sentEnergy += first * first;
    heardEnergy += second * second;
  }
  return sentEnergy === 0 || heardEnergy === 0 ? 0 : cross / Math.sqrt(sentEnergy * heardEnergy);
}

interface Lag {
  lagMs: number;
  match: number;
}

const toSamples = (ms: number) => Math.round((ms / 1000) * ANALYSIS_RATE);
const toMs = (samples: number) => (samples / ANALYSIS_RATE) * 1000;

// Finds where a stretch of sent audio landed in the heard audio, so a word's true place does not depend on the clock under test.
function findLag({ sent, heard, atSentMs, aroundLagMs, searchMs }: { sent: Float32Array; heard: Float32Array; atSentMs: number; aroundLagMs: number; searchMs: number }): Lag {
  const sentStart = Math.max(0, toSamples(atSentMs - WINDOW_BEFORE_MS));
  const length = toSamples(WINDOW_BEFORE_MS + WINDOW_AFTER_MS);
  const centre = sentStart + toSamples(aroundLagMs);
  let best: Lag = { lagMs: aroundLagMs, match: -1 };
  for (let heardStart = Math.max(0, centre - toSamples(searchMs)); heardStart <= centre + toSamples(searchMs); heardStart++) {
    const match = getMatch({ sent, heard, sentStart, heardStart, length });
    if (match > best.match) best = { lagMs: toMs(heardStart - sentStart), match };
  }
  return best;
}

export interface TurnAudio {
  sentPcm: Int16Array;
  sentRate: number;
  heardPcm: Int16Array;
  heardRate: number;
  heardStartGraphMs: number;
  firstSoundGraphMs: number;
}

export interface WordPlace {
  sentMs: number;
  heardAtMs: number | null;
  match: number;
}

// Finds one lag per word on real speech, and a word it cannot match stays null rather than guessed.
export function findWordPlaces({ sentPcm, sentRate, heardPcm, heardRate, heardStartGraphMs, firstSoundGraphMs }: TurnAudio, wordSentMs: readonly number[]): WordPlace[] {
  const sent = resample(sentPcm, sentRate, ANALYSIS_RATE);
  const heard = resample(heardPcm, heardRate, ANALYSIS_RATE);
  const firstSent = findFirstLoudMs(sentPcm, sentRate);
  let lagMs = firstSoundGraphMs - heardStartGraphMs - firstSent;
  let isLocked = false;
  return wordSentMs.map((sentMs) => {
    const near = findLag({ sent, heard, atSentMs: sentMs, aroundLagMs: lagMs, searchMs: isLocked ? NEAR_SEARCH_MS : FAR_SEARCH_MS });
    const found = near.match >= GOOD_MATCH || !isLocked ? near : findLag({ sent, heard, atSentMs: sentMs, aroundLagMs: lagMs, searchMs: FAR_SEARCH_MS });
    if (found.match < GOOD_MATCH) return { sentMs, heardAtMs: null, match: found.match };
    lagMs = found.lagMs;
    isLocked = true;
    return { sentMs, heardAtMs: heardStartGraphMs + sentMs + found.lagMs, match: found.match };
  });
}

const LOUD_SEARCH_MS = 500;
const LOUD_BLOCK_MS = 3;

/** The first audible sound at or after where the voice placed the word. */
export function findAudibleStartMs({ heardPcm, heardRate, heardStartGraphMs, placedAtMs }: { heardPcm: Int16Array; heardRate: number; heardStartGraphMs: number; placedAtMs: number }): number {
  const blockSamples = Math.round((LOUD_BLOCK_MS / 1000) * heardRate);
  const start = Math.round(((placedAtMs - heardStartGraphMs) / 1000) * heardRate);
  const limit = start + Math.round((LOUD_SEARCH_MS / 1000) * heardRate);
  for (let block = start; block < limit; block += blockSamples) {
    for (let index = block; index < block + blockSamples; index++) {
      if (Math.abs(heardPcm[index] ?? 0) >= AUDIBLE_SAMPLE) return heardStartGraphMs + (block / heardRate) * 1000;
    }
  }
  return placedAtMs;
}

export function findFirstLoudMs(pcm: Int16Array, rate: number): number {
  const index = pcm.findIndex((sample) => Math.abs(sample) >= AUDIBLE_SAMPLE);
  return index < 0 ? 0 : (index / rate) * 1000;
}

export function getWordList(beats: readonly Beat[]) {
  return beats.flatMap((beat) => getSpokenWords(getBeatText(beat)).map((text, wordInBeat) => ({ beatId: beat.id, wordInBeat, text })));
}

export const getCueCount = (beats: readonly Beat[]) => beats.flatMap((beat) => getCues(beat)).length;

/** A word after a run of silence has an onset in the sound itself, which needs no vendor's word times. */
export function findWordOnsetsAfterSilence(pcm: Int16Array, rate: number, wordStartsMs: readonly number[]): { wordIndex: number; onsetMs: number; silenceMs: number }[] {
  const blockSamples = Math.round(rate * 0.005);
  const loud: boolean[] = [];
  for (let start = 0; start < pcm.length; start += blockSamples) {
    let peak = 0;
    for (let index = start; index < Math.min(pcm.length, start + blockSamples); index++) peak = Math.max(peak, Math.abs(pcm[index] as number));
    loud.push(peak >= AUDIBLE_SAMPLE);
  }
  const onsets: { onsetMs: number; silenceMs: number }[] = [];
  let quietBlocks = 0;
  loud.forEach((isLoud, block) => {
    if (isLoud && quietBlocks * 5 >= QUIET_RUN_MS) onsets.push({ onsetMs: block * 5, silenceMs: quietBlocks * 5 });
    quietBlocks = isLoud ? 0 : quietBlocks + 1;
  });
  return onsets.flatMap((onset) => {
    const distances = wordStartsMs.map((startMs) => Math.abs(startMs - onset.onsetMs));
    const closest = Math.min(...distances);
    return { ...onset, wordIndex: distances.indexOf(closest) };
  });
}
