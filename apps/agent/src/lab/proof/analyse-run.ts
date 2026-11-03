import { type Beat, getBeatText, getSpokenWords, getCues } from '@astra/contracts';

const ANALYSIS_RATE = 8000;
const WINDOW_BEFORE_MS = 40;
const WINDOW_AFTER_MS = 300;
const NEAR_SEARCH_MS = 200;
const FAR_SEARCH_MS = 1800;
const GOOD_MATCH = 0.55;
const AUDIBLE = 328;
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

// Finds where a stretch of the audio we sent landed in the audio the browser heard, so "where the word really was" does not depend on the clock under test.
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
  /** The PCM we handed to LiveKit, at its own rate. */
  sentPcm: Int16Array;
  sentRate: number;
  /** Heard PCM at the tap's rate, and the graph ms of its first sample. */
  heardPcm: Int16Array;
  heardRate: number;
  heardStartMs: number;
  /** Graph ms of this turn's first sound. */
  firstSoundAtMs: number;
}

export interface WordPlace {
  sentMs: number;
  heardAtMs: number | null;
  match: number;
}

// One lag per word, on real speech. A word it cannot match, as in lost audio or past a cut, is left out rather than guessed.
export function findWordPlaces({ sentPcm, sentRate, heardPcm, heardRate, heardStartMs, firstSoundAtMs }: TurnAudio, wordSentMs: readonly number[]): WordPlace[] {
  const sent = resample(sentPcm, sentRate, ANALYSIS_RATE);
  const heard = resample(heardPcm, heardRate, ANALYSIS_RATE);
  const firstSent = findFirstLoudMs(sentPcm, sentRate);
  let lagMs = firstSoundAtMs - heardStartMs - firstSent;
  let isLocked = false;
  return wordSentMs.map((sentMs) => {
    const near = findLag({ sent, heard, atSentMs: sentMs, aroundLagMs: lagMs, searchMs: isLocked ? NEAR_SEARCH_MS : FAR_SEARCH_MS });
    const found = near.match >= GOOD_MATCH || !isLocked ? near : findLag({ sent, heard, atSentMs: sentMs, aroundLagMs: lagMs, searchMs: FAR_SEARCH_MS });
    if (found.match < GOOD_MATCH) return { sentMs, heardAtMs: null, match: found.match };
    lagMs = found.lagMs;
    isLocked = true;
    return { sentMs, heardAtMs: heardStartMs + sentMs + found.lagMs, match: found.match };
  });
}

const LOUD_SEARCH_MS = 500;
const LOUD_BLOCK_MS = 3;

/** The word's audio start as a listener gets it: the first audible sound at or after where the voice placed the word. */
export function findAudibleStartMs({ heardPcm, heardRate, heardStartMs, placedAtMs }: { heardPcm: Int16Array; heardRate: number; heardStartMs: number; placedAtMs: number }): number {
  const blockSamples = Math.round((LOUD_BLOCK_MS / 1000) * heardRate);
  const start = Math.round(((placedAtMs - heardStartMs) / 1000) * heardRate);
  const limit = start + Math.round((LOUD_SEARCH_MS / 1000) * heardRate);
  for (let block = start; block < limit; block += blockSamples) {
    for (let index = block; index < block + blockSamples; index++) {
      if (Math.abs(heardPcm[index] ?? 0) >= AUDIBLE) return heardStartMs + (block / heardRate) * 1000;
    }
  }
  return placedAtMs;
}

export function findFirstLoudMs(pcm: Int16Array, rate: number): number {
  const index = pcm.findIndex((sample) => Math.abs(sample) >= AUDIBLE);
  return index < 0 ? 0 : (index / rate) * 1000;
}

export function getWordList(beats: readonly Beat[]) {
  return beats.flatMap((beat) => getSpokenWords(getBeatText(beat)).map((text, wordInBeat) => ({ beatId: beat.id, wordInBeat, text })));
}

export const getCueCount = (beats: readonly Beat[]) => beats.flatMap((beat) => getCues(beat)).length;

/** A word that follows a run of silence has an onset in the sound itself, which needs no vendor's word times. */
export function findWordOnsetsAfterSilence(pcm: Int16Array, rate: number, wordStartsMs: readonly number[]): { wordIndex: number; onsetMs: number; silenceMs: number }[] {
  const blockSamples = Math.round(rate * 0.005);
  const loud: boolean[] = [];
  for (let start = 0; start < pcm.length; start += blockSamples) {
    let peak = 0;
    for (let index = start; index < Math.min(pcm.length, start + blockSamples); index++) peak = Math.max(peak, Math.abs(pcm[index] as number));
    loud.push(peak >= AUDIBLE);
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
