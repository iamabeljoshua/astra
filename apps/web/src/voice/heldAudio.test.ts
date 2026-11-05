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

describe('catching up in a room too loud to skip quiet', () => {
  const loud = () => Float32Array.from({ length: BLOCK }, () => (Math.random() * 2 - 1) * 0.1);

  it('reads a long backlog faster, so it comes down while the student keeps talking', () => {
    const held = new HeldAudio();
    run(held, Array.from({ length: 300 }, loud));
    held.release();
    const before = held.queue.length;
    run(held, Array.from({ length: 400 }, loud));
    expect(held.queue.length).toBeLessThan(before - 70);
    expect(held.queue.length).toBeGreaterThanOrEqual(38);
  });

  it('keeps running when a backlog that was all quiet runs out inside a block, because a throw here silences the line for good', () => {
    const held = new HeldAudio();
    run(held, Array.from({ length: 1300 }, quiet));
    held.release();
    expect(() => run(held, [quiet(), quiet(), quiet()])).not.toThrow();
    expect(run(held, [voice(0.5), voice(0.5)])).toContain(0.5);
  });

  it('never lets a backlog grow, or reads past what it holds', () => {
    const held = new HeldAudio();
    run(held, Array.from({ length: 60 }, loud));
    held.release();
    held.endInput();
    const out = Array.from({ length: 60 }, () => {
      const output = new Float32Array(BLOCK);
      held.process(undefined, output);
      return output.some((sample) => sample !== 0);
    });
    expect(held.isDrained()).toBe(true);
    expect(out.filter(Boolean).length).toBeLessThan(60);
    expect(out.filter(Boolean).length).toBeGreaterThanOrEqual(45);
  });

  it('keeps the voice, first to last, as it reads faster', () => {
    const held = new HeldAudio();
    const marks = Array.from({ length: 60 }, (_, block) => new Float32Array(BLOCK).fill((block + 1) / 100));
    run(held, marks);
    held.release();
    held.endInput();
    const heard: number[] = [];
    for (let block = 0; block < 60; block += 1) {
      const output = new Float32Array(BLOCK);
      held.process(undefined, output);
      heard.push(...output);
    }
    const sound = heard.filter((sample) => sample > 0);
    expect(sound.every((sample, index) => index === 0 || sample >= (sound[index - 1] ?? 0))).toBe(true);
    expect(Math.max(...sound)).toBeCloseTo(0.6, 2);
  });
});

describe('a line whose capture has ended', () => {
  const runEnded = (held: HeldAudio, blocks: number) =>
    Array.from({ length: blocks }, () => {
      const output = new Float32Array(BLOCK);
      held.process(undefined, output);
      return Math.round(Math.abs(output[0] ?? 0) * 100) / 100;
    });

  it('plays out what it held, first to last, and says when it has nothing left', () => {
    const held = new HeldAudio();
    run(held, [voice(0.1), voice(0.2)]);
    held.release();
    held.endInput();
    expect(held.isDrained()).toBe(false);
    expect(runEnded(held, 2)).toEqual([0.1, 0.2]);
    expect(held.isDrained()).toBe(true);
  });

  it('sends nothing beyond what was captured, however long it keeps running', () => {
    const held = new HeldAudio();
    run(held, [voice(0.5)]);
    held.release();
    held.endInput();
    expect(runEnded(held, 50)).toEqual([0.5, ...Array.from({ length: 49 }, () => 0)]);
  });

  it('keeps holding until the ears open, so a hold let go before the room is ready loses no word', () => {
    const held = new HeldAudio();
    run(held, [voice(0.3), voice(0.4)]);
    held.endInput();
    expect(runEnded(held, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(held.isDrained()).toBe(false);
    held.release();
    expect(runEnded(held, 2)).toEqual([0.3, 0.4]);
    expect(held.isDrained()).toBe(true);
  });

  it('reports drained at once when the line had caught up', () => {
    const held = new HeldAudio();
    held.release();
    run(held, [voice(0.2)]);
    held.endInput();
    expect(held.isDrained()).toBe(true);
  });

  it('has nothing to play out from a hold with no sound in it, so it closes at once', () => {
    const held = new HeldAudio();
    run(held, Array.from({ length: 100 }, quiet));
    held.endInput();
    expect(held.isDrained()).toBe(true);
  });

  it('is drained with nothing after a drop, so an off press never plays out', () => {
    const held = new HeldAudio();
    run(held, [voice(0.2)]);
    held.endInput();
    held.drop();
    expect(held.isDrained()).toBe(true);
  });
});

describe('steady noise', () => {
  const BLOCKS_A_SECOND = 375;
  const noise = (rms: number) => Float32Array.from({ length: BLOCK }, (_, sample) => (sample % 2 === 0 ? rms : -rms));

  it('is reported once a room stays over the quiet rule for 5 s, and only once', () => {
    const held = new HeldAudio();
    held.release();
    const heard = Array.from({ length: BLOCKS_A_SECOND * 9 }, () => {
      held.process(noise(0.03), new Float32Array(BLOCK));
      return held.takeSteadyNoise();
    });
    expect(heard.filter(Boolean)).toHaveLength(1);
    expect(heard.indexOf(true)).toBeGreaterThan(BLOCKS_A_SECOND * 4.5);
    expect(heard.indexOf(true)).toBeLessThan(BLOCKS_A_SECOND * 5.5);
  });

  it('is not reported for a voice with gaps, however loud', () => {
    const held = new HeldAudio();
    held.release();
    let heard = false;
    for (let block = 0; block < BLOCKS_A_SECOND * 30; block += 1) {
      const isGap = block % 800 < 40;
      held.process(isGap ? quiet() : noise(0.2), new Float32Array(BLOCK));
      heard ||= held.takeSteadyNoise();
    }
    expect(heard).toBe(false);
  });

  it('is not reported in a room under the rule', () => {
    const held = new HeldAudio();
    held.release();
    let heard = false;
    for (let block = 0; block < BLOCKS_A_SECOND * 30; block += 1) {
      held.process(noise(0.01), new Float32Array(BLOCK));
      heard ||= held.takeSteadyNoise();
    }
    expect(heard).toBe(false);
  });

  it('is heard while holding too, before any sound has gone out', () => {
    const held = new HeldAudio();
    let heard = false;
    for (let block = 0; block < BLOCKS_A_SECOND * 7; block += 1) {
      held.process(noise(0.03), new Float32Array(BLOCK));
      heard ||= held.takeSteadyNoise();
    }
    expect(heard).toBe(true);
  });

  it('reads a low hum as steady, though its own zero crossings dip inside a block', () => {
    const held = new HeldAudio();
    held.release();
    const hum = (block: number) => Float32Array.from({ length: BLOCK }, (_, sample) => 0.04 * Math.sin((2 * Math.PI * 50 * (block * BLOCK + sample)) / 48_000));
    let heard = false;
    for (let block = 0; block < BLOCKS_A_SECOND * 7; block += 1) {
      held.process(hum(block), new Float32Array(BLOCK));
      heard ||= held.takeSteadyNoise();
    }
    expect(heard).toBe(true);
  });
});
