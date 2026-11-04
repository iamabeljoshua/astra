import { describe, expect, it } from 'vitest';
import { getMostFlashesInASecond, type LuminanceChange } from './flashes';

function makeSquareWave(hertz: number, seconds = 2): LuminanceChange[] {
  return Array.from({ length: hertz * 2 * seconds }, (_, index) => ({ atMs: (index * 500) / hertz, direction: index % 2 === 0 ? 1 : -1 }));
}

describe('getMostFlashesInASecond', () => {
  it('counts a flash as a pair of opposing changes, so a square wave at 5 Hz is 5 flashes a second', () => {
    expect(getMostFlashesInASecond(makeSquareWave(5))).toBe(5);
  });

  it('allows 3 Hz', () => {
    expect(getMostFlashesInASecond(makeSquareWave(3))).toBe(3);
  });

  it('counts nothing when there are no changes', () => {
    expect(getMostFlashesInASecond([])).toBe(0);
  });

  it('counts nothing for a fade that only rises, however many changes it holds', () => {
    expect(getMostFlashesInASecond(Array.from({ length: 10 }, (_, index) => ({ atMs: index * 50, direction: 1 as const })))).toBe(0);
  });

  it('counts a rise in steps and a fall as one flash', () => {
    expect(getMostFlashesInASecond([{ atMs: 0, direction: 1 }, { atMs: 50, direction: 1 }, { atMs: 100, direction: 1 }, { atMs: 200, direction: -1 }])).toBe(1);
  });

  it('counts only what falls inside one second', () => {
    expect(getMostFlashesInASecond([...makeSquareWave(1, 3)])).toBeLessThanOrEqual(1);
  });
});
