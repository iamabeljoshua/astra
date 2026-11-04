import { describe, expect, it, vi } from 'vitest';
import { canPaintAt, createTierWatch, landsDrawingsAtOnce, type TierWatch } from '../src/index.ts';

function makeClock() {
  let nowMs = 0;
  return {
    run(watch: TierWatch, framesPerSecond: number, seconds: number) {
      const frameMs = 1000 / framesPerSecond;
      for (let frame = 0; frame < framesPerSecond * seconds; frame += 1) {
        nowMs += frameMs;
        watch.noteFrame(nowMs);
      }
    },
    skip(ms: number) {
      nowMs += ms;
    },
  };
}

describe('createTierWatch', () => {
  it('keeps the top tier at 60 frames a second', () => {
    const watch = createTierWatch();
    makeClock().run(watch, 60, 30);
    expect(watch.getTier()).toBe(0);
  });

  it('does not drop for one slow moment', () => {
    const watch = createTierWatch();
    const clock = makeClock();
    clock.run(watch, 60, 2);
    clock.run(watch, 20, 0.6);
    clock.run(watch, 60, 2);
    expect(watch.getTier()).toBe(0);
  });

  it('drops one tier after a second of slow frames, and tells its listener', () => {
    const onChange = vi.fn();
    const watch = createTierWatch(onChange);
    makeClock().run(watch, 40, 1.6);
    expect(watch.getTier()).toBe(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('drops to the lowest tier when the first drop was not enough', () => {
    const watch = createTierWatch();
    makeClock().run(watch, 20, 3);
    expect(watch.getTier()).toBe(2);
  });

  it('holds a tier it can carry, without climbing or falling', () => {
    const watch = createTierWatch();
    makeClock().run(watch, 40, 30);
    expect(watch.getTier()).toBe(1);
  });

  it('never drops below the lowest tier', () => {
    const watch = createTierWatch();
    makeClock().run(watch, 5, 60);
    expect(watch.getTier()).toBe(2);
  });

  it('counts a hidden tab for nothing', () => {
    const watch = createTierWatch();
    const clock = makeClock();
    clock.run(watch, 60, 2);
    clock.skip(30_000);
    clock.run(watch, 60, 2);
    expect(watch.getTier()).toBe(0);
  });

  it('climbs back after ten seconds of full speed', () => {
    const watch = createTierWatch();
    const clock = makeClock();
    clock.run(watch, 40, 1.6);
    expect(watch.getTier()).toBe(1);
    clock.run(watch, 60, 9);
    expect(watch.getTier()).toBe(1);
    clock.run(watch, 60, 2);
    expect(watch.getTier()).toBe(0);
  });

  it('waits twice as long to climb again after a climb that did not hold, so a board on the edge settles', () => {
    const onChange = vi.fn();
    const watch = createTierWatch(onChange);
    const clock = makeClock();
    clock.run(watch, 40, 1.6);
    clock.run(watch, 60, 11);
    clock.run(watch, 40, 1.6);
    expect(onChange.mock.calls.map(([tier]) => tier)).toEqual([1, 0, 1]);
    clock.run(watch, 60, 12);
    expect(watch.getTier()).toBe(1);
    clock.run(watch, 60, 10);
    expect(watch.getTier()).toBe(0);
  });
});

describe('what each tier gives up', () => {
  it('paints every frame on the top tier', () => {
    expect(canPaintAt(0, 1)).toBe(true);
  });

  it.each([1, 2] as const)('paints at most about 30 times a second on tier %i', (tier) => {
    expect(canPaintAt(tier, 16)).toBe(false);
    expect(canPaintAt(tier, 33)).toBe(true);
  });

  it('lands drawings at once only on the lowest tier', () => {
    expect([landsDrawingsAtOnce(0), landsDrawingsAtOnce(1), landsDrawingsAtOnce(2)]).toEqual([false, false, true]);
  });
});
