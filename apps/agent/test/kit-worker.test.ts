import { describe, expect, it } from 'vitest';
import { createKitWorker, getFrameProblems, type KitFrameResult } from '../src/scenes/kit-worker.ts';

const JOB = { code: 'function scene(kit) {}', moments: { a: 0, b: 2 }, durationSeconds: 5, themes: ['dark'] as const, values: {}, inspectSeconds: [1.2, 3.3] };
const signal = new AbortController().signal;
const sample = (t: number, hash: number, lit = 0.2, std = 0.1) => ({ t, mean: 0.1, std, lit, hash });
const GATE = { deterministic: true, mismatches: [], costMean: 20 };

describe('the kit worker', () => {
  it('gives the review its frames and makes no take, since the page builds its take from the saved code', async () => {
    const worker = createKitWorker(async () => ({ isOk: true, parts: Array.from({ length: 30 }, (_, index) => `part-${index}`), sheet: Buffer.from('jpeg'), ms: 5 }));
    const result = await worker(JOB, signal);
    expect(result).toMatchObject({ isOk: true, takes: [], sheets: [{ theme: 'dark', bytes: Buffer.from('jpeg') }] });
    expect(result.isOk && result.parts).toHaveLength(24);
  });

  it('reports a failed frame check as no scene, with the reasons a rewrite needs', async () => {
    const failed: KitFrameResult = { isOk: false, reasons: ['build: moon is not defined'] };
    expect(await createKitWorker(async () => failed)(JOB, signal)).toMatchObject({ isOk: false, stage: 'inspect', reasons: failed.reasons });
  });
});

describe('what the frames must show', () => {
  it('passes frames that draw something and change over time', () => {
    expect(getFrameProblems({ ...GATE, samples: [sample(1, 1), sample(3, 2)] }, 1)).toEqual([]);
  });

  it('refuses a black frame after the first moment', () => {
    expect(getFrameProblems({ ...GATE, samples: [sample(1, 1), sample(3, 2, 0, 0)] }, 1)[0]).toMatch(/draws nothing visible at 3\.0/);
  });

  it('forgives a dark frame before the first moment, because a scene may fade in', () => {
    expect(getFrameProblems({ ...GATE, samples: [sample(0.5, 1, 0, 0), sample(3, 2)] }, 1)).toEqual([]);
  });

  it('refuses a render that is not a pure function of time', () => {
    expect(getFrameProblems({ ...GATE, deterministic: false, mismatches: [3], samples: [sample(1, 1), sample(3, 2)] }, 1)[0]).toMatch(/not pure/);
  });

  it('refuses a picture that never changes', () => {
    expect(getFrameProblems({ ...GATE, samples: [sample(1, 1), sample(3, 1)] }, 1)).toContain('nothing changes over the whole scene');
  });

  it('refuses a scene too slow to draw', () => {
    expect(getFrameProblems({ ...GATE, costMean: 900, samples: [sample(1, 1), sample(3, 2)] }, 1)[0]).toMatch(/900 ms/);
  });
});
