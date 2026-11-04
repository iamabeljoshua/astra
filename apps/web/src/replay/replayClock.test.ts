import { describe, expect, it } from 'vitest';
import { createReplayClock } from './replayClock';

function makeClock(durationMs = 10_000) {
  let nowMs = 0;
  const clock = createReplayClock(durationMs, () => nowMs);
  return { clock, wait: (ms: number) => (nowMs += ms) };
}

describe('the replay clock', () => {
  it('stands still until played, and moves only while playing', () => {
    const { clock, wait } = makeClock();
    wait(500);
    expect(clock.getAtMs()).toBe(0);
    clock.play();
    wait(500);
    expect(clock.getAtMs()).toBe(500);
    clock.pause();
    wait(500);
    expect(clock.getAtMs()).toBe(500);
  });

  it('runs at the chosen speed from where it is, and a change of speed moves nothing', () => {
    const { clock, wait } = makeClock();
    clock.play();
    wait(1000);
    clock.setSpeed(2);
    expect(clock.getAtMs()).toBe(1000);
    wait(1000);
    expect(clock.getAtMs()).toBe(3000);
  });

  it('seeks back and forward while playing, and stays inside the lesson', () => {
    const { clock, wait } = makeClock();
    clock.play();
    wait(4000);
    clock.seek(1000);
    expect(clock.getAtMs()).toBe(1000);
    wait(100);
    expect(clock.getAtMs()).toBe(1100);
    clock.seek(-5);
    expect(clock.getAtMs()).toBe(0);
    clock.seek(99_999);
    expect(clock.getAtMs()).toBe(10_000);
  });

  it('stops at the end, and playing from there starts again', () => {
    const { clock, wait } = makeClock(1000);
    clock.play();
    wait(5000);
    expect(clock.getAtMs()).toBe(1000);
    expect(clock.isPlaying()).toBe(false);
    clock.play();
    expect(clock.getAtMs()).toBe(0);
    expect(clock.isPlaying()).toBe(true);
  });
});
