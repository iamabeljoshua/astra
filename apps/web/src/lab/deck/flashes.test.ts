import { describe, expect, it } from 'vitest';
import { getMostFlashesInASecond, getSmallestFlashChange } from './flashes';

const SMALLEST = 0.02;

function makeSquareWave({ hertz, depth, seconds = 2 }: { hertz: number; depth: number; seconds?: number }) {
  return Array.from({ length: seconds * 60 }, (_, frame) => {
    const atMs = (frame * 1000) / 60;
    return { atMs, mean: Math.floor((atMs / 1000) * hertz * 2) % 2 === 0 ? 0.2 : 0.2 + depth };
  });
}

describe('getMostFlashesInASecond', () => {
  it('counts a flash as a pair of opposing changes, so a square wave at 5 Hz is 5 flashes a second', () => {
    expect(getMostFlashesInASecond(makeSquareWave({ hertz: 5, depth: 0.1 }), SMALLEST)).toBe(5);
  });

  it('allows 3 Hz', () => {
    expect(getMostFlashesInASecond(makeSquareWave({ hertz: 3, depth: 0.1 }), SMALLEST)).toBeLessThanOrEqual(3);
  });

  it('ignores a flicker too shallow to count', () => {
    expect(getMostFlashesInASecond(makeSquareWave({ hertz: 8, depth: SMALLEST / 2 }), SMALLEST)).toBe(0);
  });

  it('counts nothing for a fade that only rises', () => {
    const fade = Array.from({ length: 60 }, (_, frame) => ({ atMs: frame * 16, mean: frame / 60 }));
    expect(getMostFlashesInASecond(fade, SMALLEST)).toBe(0);
  });

  it('counts each deep change once when it falls in steps', () => {
    const steps = [0.5, 0.45, 0.4, 0.35, 0.5, 0.55, 0.3].map((mean, index) => ({ atMs: index * 16, mean }));
    expect(getMostFlashesInASecond(steps, 0.1)).toBe(1);
  });
});

describe('getSmallestFlashChange', () => {
  it('asks a large board for only a share of its mean, and a small one for the whole change', () => {
    expect(getSmallestFlashChange(760 * 752)).toBeCloseTo(0.0153, 3);
    expect(getSmallestFlashChange(280 * 200)).toBe(0.1);
  });
});
