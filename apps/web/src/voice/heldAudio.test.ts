import { describe, expect, it } from 'vitest';
import { HeldAudio } from './held-mic-worklet.js';

const BLOCK = 128;
const voice = (mark: number) => Float32Array.from({ length: BLOCK }, (_, sample) => (sample % 2 === 0 ? mark : -mark));
const quiet = () => new Float32Array(BLOCK);

function run(held: HeldAudio, blocks: Float32Array[]): number[] {
  return blocks.map((block) => {
    const output = new Float32Array(BLOCK);
    held.process(block, output);
    return Math.round(Math.abs(output[0] ?? 0) * 100) / 100;
  });
}

describe('a held microphone', () => {
  it('sends silence while holding, and then every sound it held, first to last', () => {
    const held = new HeldAudio();
    expect(run(held, [voice(0.1), voice(0.2), voice(0.3)])).toEqual([0, 0, 0]);
    held.release();
    expect(run(held, [voice(0.4), voice(0.5), voice(0.6)])).toEqual([0.1, 0.2, 0.3]);
  });

  it('catches up by skipping quiet, so a line held for a handshake does not stay late', () => {
    const held = new HeldAudio();
    run(held, [...Array.from({ length: 500 }, quiet), voice(0.5)]);
    expect(held.queue.length).toBe(501);
    held.release();
    const out = run(held, [quiet(), quiet(), quiet()]);
    expect(out).toContain(0.5);
    expect(held.queue.length).toBeLessThanOrEqual(3);
  });

  it('keeps a short gap inside speech, so the words stay apart', () => {
    const held = new HeldAudio();
    const gap = Array.from({ length: 10 }, quiet);
    run(held, [voice(0.5), ...gap, voice(0.4), voice(0.3)]);
    held.release();
    const out = run(held, Array.from({ length: 13 }, quiet));
    expect(out.slice(0, 13)).toEqual([0.5, ...gap.map(() => 0), 0.4, 0.3]);
  });

  it('skips steady room noise as quiet, and not the voice over it', () => {
    const held = new HeldAudio();
    const noise = () => Float32Array.from({ length: BLOCK }, () => (Math.random() * 2 - 1) * 0.01);
    run(held, [...Array.from({ length: 400 }, noise), voice(0.5)]);
    held.release();
    const out = run(held, [noise(), noise()]);
    expect(out).toContain(0.5);
  });

  it('never treats a voice as quiet when it starts on the very first block', () => {
    const held = new HeldAudio();
    expect(run(held, [voice(0.05), voice(0.05)])).toEqual([0, 0]);
    held.release();
    expect(run(held, [quiet(), quiet()])).toEqual([0.05, 0.05]);
  });

  it('holds twelve seconds at most, dropping the oldest', () => {
    const held = new HeldAudio();
    run(held, Array.from({ length: 5000 }, quiet));
    expect(held.queue.length).toBe(4500);
  });

  it('holds again for a rejoin, and drops everything when closed', () => {
    const held = new HeldAudio();
    held.release();
    run(held, [voice(0.1)]);
    held.hold();
    expect(run(held, [voice(0.2)])).toEqual([0]);
    held.drop();
    expect(held.queue).toEqual([]);
  });
});
