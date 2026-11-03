import { describe, expect, it } from 'vitest';
import { createOverlongWatch } from '../src/live/overlong-watch.ts';

const watch = createOverlongWatch({ typicalMsPerCharacter: 50 });

describe('createOverlongWatch', () => {
  it('leaves a line at its normal pace alone', () => {
    expect(watch.isOverlong(2200, 44)).toBe(false);
  });

  it('leaves a short line with a long breath alone', () => {
    expect(watch.isOverlong(900, 8)).toBe(false);
  });

  it('flags a line running at over twice its pace', () => {
    expect(watch.isOverlong(7000, 44)).toBe(true);
  });

  it('flags audio that keeps coming with no new word times', () => {
    expect(watch.isOverlong(3000, 8)).toBe(true);
  });
});
