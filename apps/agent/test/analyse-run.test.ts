import { describe, expect, it } from 'vitest';
import { findAudibleStartMs, findWordOnsetsAfterSilence, findWordPlaces, getPercentiles } from '../src/lab/proof/analyse-run.ts';

const SENT_RATE = 22050;
const HEARD_RATE = 24000;
const LOUD = 8000;

// Noise, because a repeated tone would match itself at the wrong place.
function makeSpeechLike(ms: number, rate: number, seed: number): Int16Array {
  let state = seed;
  return Int16Array.from({ length: Math.round((ms / 1000) * rate) }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state / 0x7fffffff - 0.5) * 2 * LOUD;
  });
}

function resampleNearest(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  return Int16Array.from({ length: Math.round((pcm.length * toRate) / fromRate) }, (_, index) => pcm[Math.floor((index * fromRate) / toRate)] ?? 0);
}

describe('the proof tool', () => {
  it('finds a known lag, so a clock error it reports is really that error', () => {
    const lagMs = 123;
    const sentPcm = makeSpeechLike(1500, SENT_RATE, 7);
    const shifted = new Int16Array(Math.round(((1500 + lagMs) / 1000) * SENT_RATE));
    shifted.set(sentPcm, Math.round((lagMs / 1000) * SENT_RATE));
    const heardPcm = resampleNearest(shifted, SENT_RATE, HEARD_RATE);
    const [first, second] = findWordPlaces({ sentPcm, sentRate: SENT_RATE, heardPcm, heardRate: HEARD_RATE, heardStartMs: 1000, firstSoundAtMs: 1000 + lagMs }, [100, 800]);
    expect(Math.abs((first?.heardAtMs as number) - (1000 + lagMs + 100))).toBeLessThanOrEqual(1);
    expect(Math.abs((second?.heardAtMs as number) - (1000 + lagMs + 800))).toBeLessThanOrEqual(1);
  });

  it('leaves out a word whose audio never arrived, rather than guessing', () => {
    const sentPcm = makeSpeechLike(1500, SENT_RATE, 7);
    const heardPcm = new Int16Array(Math.round(1.5 * HEARD_RATE));
    const [place] = findWordPlaces({ sentPcm, sentRate: SENT_RATE, heardPcm, heardRate: HEARD_RATE, heardStartMs: 0, firstSoundAtMs: 0 }, [100]);
    expect(place?.heardAtMs).toBeNull();
  });

  it('reads a word placed in a silence as starting at the next sound', () => {
    const heardPcm = new Int16Array(Math.round(HEARD_RATE));
    heardPcm.fill(LOUD, Math.round(0.4 * HEARD_RATE));
    expect(findAudibleStartMs({ heardPcm, heardRate: HEARD_RATE, heardStartMs: 1000, placedAtMs: 1300 })).toBeCloseTo(1400, -1);
    expect(findAudibleStartMs({ heardPcm, heardRate: HEARD_RATE, heardStartMs: 1000, placedAtMs: 1500 })).toBe(1500);
  });

  it('finds the sound that follows a silence, and the word nearest it', () => {
    const pcm = new Int16Array(Math.round(0.6 * SENT_RATE));
    pcm.fill(LOUD, 0, Math.round(0.2 * SENT_RATE));
    pcm.fill(LOUD, Math.round(0.4 * SENT_RATE));
    const [onset] = findWordOnsetsAfterSilence(pcm, SENT_RATE, [0, 390, 500]);
    expect(onset?.wordIndex).toBe(1);
    expect(onset?.onsetMs).toBeCloseTo(400, -1);
    expect(onset?.silenceMs).toBeGreaterThan(150);
  });

  it('takes percentiles of what it is given', () => {
    expect(getPercentiles([])).toMatchObject({ count: 0, p95: null });
    expect(getPercentiles(Array.from({ length: 100 }, (_, index) => index))).toMatchObject({ p50: 50, p95: 95, worst: 99, best: 0 });
  });
});
