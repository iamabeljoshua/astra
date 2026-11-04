import { describe, expect, it } from 'vitest';
import { createWordClock, LONGEST_HOLD_MS, type ReportedGap } from '../src/player/word-clock.ts';

const HELD_AT_MS = 2000;
const AFTER_BOUND_MS = HELD_AT_MS + LONGEST_HOLD_MS + 1000;

function getPositions(gaps: ReportedGap[], times: number[], firstWordStartMs = 0) {
  const clock = createWordClock();
  clock.onFirstSound(0);
  gaps.forEach((gap) => clock.addGap(gap));
  return times.map((atMs) => clock.getPositionMs(atMs, firstWordStartMs));
}

describe('createWordClock', () => {
  it('reads null until the first sound, and counts from it', () => {
    const clock = createWordClock();
    expect(clock.getPositionMs(500)).toBeNull();
    clock.onFirstSound(500);
    clock.onFirstSound(900);
    expect(clock.getPositionMs(800)).toBe(300);
  });

  it('holds just short of an open gap', () => {
    expect(getPositions([{ atMs: HELD_AT_MS }], [HELD_AT_MS + 100, HELD_AT_MS + LONGEST_HOLD_MS - 1])).toEqual([HELD_AT_MS - 1, HELD_AT_MS - 1]);
  });

  it('stops holding at the bound when the closing report never comes', () => {
    expect(getPositions([{ atMs: HELD_AT_MS }], [HELD_AT_MS + LONGEST_HOLD_MS, AFTER_BOUND_MS])).toEqual([HELD_AT_MS + LONGEST_HOLD_MS, AFTER_BOUND_MS]);
  });

  it('skips a closed gap, and a late close still corrects the count', () => {
    expect(getPositions([{ atMs: HELD_AT_MS }, { atMs: HELD_AT_MS, ms: 300 }], [AFTER_BOUND_MS])).toEqual([AFTER_BOUND_MS - 300]);
  });

  it('skips all of a closed gap longer than the bound', () => {
    expect(getPositions([{ atMs: HELD_AT_MS, ms: LONGEST_HOLD_MS + 500 }], [AFTER_BOUND_MS + 500])).toEqual([AFTER_BOUND_MS - LONGEST_HOLD_MS]);
  });

  it('ignores a stall in leading silence, because the first sound came after it', () => {
    expect(getPositions([{ atMs: 0, ms: 500 }], [1000])).toEqual([1000]);
    expect(getPositions([{ atMs: 40, ms: 500 }], [1000], 60)).toEqual([1060]);
  });
});
