import { describe, expect, it } from 'vitest';
import { createNoiseWatch } from '../src/live/noise-watch.ts';

describe('the noise watch', () => {
  it('stays quiet on one cut, because that is a cough', () => {
    expect(createNoiseWatch().noteWordlessCut(0)).toBe(false);
  });

  it('speaks on a second cut within two minutes, and only once', () => {
    const watch = createNoiseWatch();
    watch.noteWordlessCut(0);
    expect(watch.noteWordlessCut(60_000)).toBe(true);
    expect(watch.noteWordlessCut(70_000)).toBe(false);
  });

  it('stays quiet on two cuts far apart', () => {
    const watch = createNoiseWatch();
    watch.noteWordlessCut(0);
    expect(watch.noteWordlessCut(121_000)).toBe(false);
  });
});
