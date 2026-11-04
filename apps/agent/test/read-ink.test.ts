import { describe, expect, it } from 'vitest';
import { rasterizeInk } from '../src/tutor/ink/rasterize-ink.ts';
import { toInkResult } from '../src/tutor/ink/read-ink.ts';

const raw = (changes: Partial<Parameters<typeof toInkResult>[0]>) => ({ kind: 'math' as const, tex: 'x=4', text: 'x = 4', confidence: 0.95, unsure: '', ...changes });

describe('what the reader said', () => {
  it('passes math the board can set', () => {
    expect(toInkResult(raw({}), 0).ink).toEqual({ tex: 'x=4', isUnsure: false });
  });

  it('keeps words as words, with nothing corrected', () => {
    expect(toInkResult(raw({ kind: 'words', tex: '', text: 'the batsille fell' }), 0)).toMatchObject({ text: 'the batsille fell', ink: { isUnsure: false } });
  });

  it('treats a low confidence or a named doubt as unsure, so nothing is judged', () => {
    expect(toInkResult(raw({ confidence: 0.4 }), 0).ink.isUnsure).toBe(true);
    expect(toInkResult(raw({ unsure: 'the 7' }), 0).ink.isUnsure).toBe(true);
  });

  it('repairs a crossed x read as a times sign, and only there', () => {
    expect(toInkResult(raw({ tex: '3\\times=12' }), 0).ink.tex).toBe('3x=12');
    expect(toInkResult(raw({ tex: '3\\times4=12' }), 0).ink.tex).toBe('3\\times4=12');
  });

  it('never lets model math through that the board could not safely set', () => {
    const result = toInkResult(raw({ tex: '\\href{javascript:alert(1)}{x}', text: 'x' }), 0);
    expect(result.ink.tex).toBeUndefined();
    expect(result.text).toBe('x');
  });
});

describe('the picture of a handwritten line', () => {
  it('is a real PNG, cropped to the ink', () => {
    const png = rasterizeInk([[[0.1, 0.1, 0], [0.3, 0.12, 10]]]) as Buffer;
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeLessThan(400);
  });

  it('holds its size on a line that fills the band, and has nothing to read with no ink', () => {
    const png = rasterizeInk([[[0, 0, 0], [1, 0.2, 10]]]) as Buffer;
    expect(png.readUInt32BE(16)).toBeLessThanOrEqual(1001);
    expect(rasterizeInk([])).toBeNull();
  });

  it('stays quick on a flood of points', () => {
    const points = Array.from({ length: 20000 }, (_, index) => [index % 2, index % 2, index] as [number, number, number]);
    const startedAt = performance.now();
    rasterizeInk([points]);
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });
});
