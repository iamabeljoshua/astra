import { describe, expect, it } from 'vitest';
import { getVisualPlace, getVisualTransform } from './boardStage';

const place = (input: Partial<Parameters<typeof getVisualPlace>[0]>) => getVisualPlace({ stage: null, peek: null, atMs: 0, isReducedMotion: false, ...input });

describe('the move between teaching and hands-on', () => {
  it('keeps the visual big until the tutor names a mode or writes', () => {
    expect(place({ atMs: 5000 })).toEqual({ smallShare: 0, isMoving: false });
  });

  it('glides for 560 ms from the moment it landed, the same at any read', () => {
    const stage = { mode: 'handsOn', sinceMs: 1000 } as const;
    expect(place({ stage, atMs: 1000 }).smallShare).toBeCloseTo(0, 3);
    const middle = place({ stage, atMs: 1280 });
    expect(middle.isMoving).toBe(true);
    expect(middle.smallShare).toBeGreaterThan(0.5);
    expect(place({ stage, atMs: 1280 })).toEqual(middle);
    expect(place({ stage, atMs: 1560 })).toEqual({ smallShare: 1, isMoving: false });
  });

  it('goes the same way back', () => {
    expect(place({ stage: { mode: 'teach', sinceMs: 1000 }, atMs: 2000 })).toEqual({ smallShare: 0, isMoving: false });
  });

  it('jumps with no travel when motion is reduced', () => {
    expect(place({ stage: { mode: 'handsOn', sinceMs: 1000 }, atMs: 1001, isReducedMotion: true })).toEqual({ smallShare: 1, isMoving: false });
  });

  it('lets the student look back, and put it back, without changing the mode', () => {
    const stage = { mode: 'handsOn', sinceMs: 1000 } as const;
    expect(place({ stage, peek: { isBig: true, atMs: 3000 }, atMs: 4000 }).smallShare).toBe(0);
    expect(place({ stage, peek: { isBig: false, atMs: 5000 }, atMs: 6000 }).smallShare).toBe(1);
  });

  it('sits about 30% wide, 12 px in from the top right corner', () => {
    expect(getVisualTransform({ smallShare: 1, width: 1000 })).toBe('translate(688.0px, 12.0px) scale(0.3000)');
    expect(getVisualTransform({ smallShare: 0, width: 1000 })).toBe('translate(0.0px, 0.0px) scale(1.0000)');
  });
});
