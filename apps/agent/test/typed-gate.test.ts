import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypedGate } from '../src/live/typed-gate.ts';

function setup(refillEveryMs = 60) {
  const released: string[] = [];
  const held: string[] = [];
  const gate = createTypedGate({ getNowMs: () => performance.now(), onRelease: (text) => released.push(text), onHeld: () => held.push('held'), limits: { burst: 3, refillEveryMs } });
  return { gate, released, held };
}

// The gate's own clock and timers run on these, so a busy machine cannot change what a flood looks like to it.
beforeEach(() => void vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => void vi.useRealTimers());

describe('the gate on typed messages', () => {
  it('lets a burst of three straight through', () => {
    const { gate, released, held } = setup();
    ['one', 'two', 'three'].forEach((text) => gate.offer(text));
    expect(released).toEqual(['one', 'two', 'three']);
    expect(held).toEqual([]);
    gate.close();
  });

  it('holds what comes too fast, and sends it together, with no words lost', async () => {
    const { gate, released } = setup();
    ['one', 'two', 'three', 'four', 'five'].forEach((text) => gate.offer(text));
    expect(released).toEqual(['one', 'two', 'three']);
    await vi.advanceTimersByTimeAsync(120);
    expect(released).toEqual(['one', 'two', 'three', 'four\nfive']);
    gate.close();
  });

  it('turns a flood of a hundred messages into a request every refill', async () => {
    const { gate, released } = setup(20);
    for (let index = 0; index < 100; index += 1) {
      gate.offer(`message ${index}`);
      await vi.advanceTimersByTimeAsync(2);
    }
    await vi.advanceTimersByTimeAsync(30);
    expect(released.length).toBeLessThanOrEqual(3 + 230 / 20);
    const words = released.join('\n');
    for (let index = 0; index < 100; index += 1) expect(words).toContain(`message ${index}\n`.trimEnd());
    gate.close();
  });
});
