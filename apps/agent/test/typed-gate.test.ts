import { describe, expect, it } from 'vitest';
import { createTypedGate } from '../src/live/typed-gate.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(refillEveryMs = 60) {
  let nowMs = 0;
  const released: string[] = [];
  const held: string[] = [];
  const gate = createTypedGate({ getNowMs: () => performance.now() + nowMs, onRelease: (text) => released.push(text), onHeld: () => held.push('held'), limits: { burst: 3, refillEveryMs } });
  return { gate, released, held, skip: (ms: number) => (nowMs += ms) };
}

describe('the gate on typed messages', () => {
  it('lets a burst of three straight through', () => {
    const { gate, released, held } = setup();
    ['one', 'two', 'three'].forEach(gate.offer);
    expect(released).toEqual(['one', 'two', 'three']);
    expect(held).toEqual([]);
    gate.close();
  });

  it('holds what comes too fast, and sends it together, with no words lost', async () => {
    const { gate, released } = setup();
    ['one', 'two', 'three', 'four', 'five'].forEach(gate.offer);
    expect(released).toEqual(['one', 'two', 'three']);
    await delay(120);
    expect(released).toEqual(['one', 'two', 'three', 'four\nfive']);
    gate.close();
  });

  it('turns a flood of a hundred messages into a request every refill', async () => {
    const { gate, released } = setup(20);
    for (let index = 0; index < 100; index += 1) {
      gate.offer(`message ${index}`);
      await delay(2);
    }
    await delay(30);
    expect(released.length).toBeLessThan(20);
    expect(released.join('\n')).toContain('message 99');
    gate.close();
  });
});
