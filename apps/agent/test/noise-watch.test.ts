import { describe, expect, it } from 'vitest';
import { createNoiseWatch } from '../src/live/noise-watch.ts';

describe('the noise watch', () => {
  it('stays quiet on one cut, because that is a cough', () => {
    expect(createNoiseWatch().noteNoiseCut(0)).toBe(false);
  });

  it('speaks on a second cut within two minutes, and only once', () => {
    const watch = createNoiseWatch();
    watch.noteNoiseCut(0);
    expect(watch.noteNoiseCut(60_000)).toBe(true);
    expect(watch.noteNoiseCut(70_000)).toBe(false);
  });

  it('stays quiet on two cuts far apart', () => {
    const watch = createNoiseWatch();
    watch.noteNoiseCut(0);
    expect(watch.noteNoiseCut(121_000)).toBe(false);
  });
});
