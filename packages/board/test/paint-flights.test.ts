import { describe, expect, it } from 'vitest';
import { easeInOut, getBoxUnion, getOffsetFromLanding, getFlightTransform, type PaintInfo, planPaints } from '../src/math/paint-flights.ts';

const FONT = 24;

function paint(termId: string | null, glyph: string | null, x = 0, y = 0): PaintInfo {
  return { termId, glyph, box: { x, y, width: 10, height: 20 }, fontSize: FONT };
}

const empty = new Set<string>();

describe('planPaints', () => {
  it('flies a kept term to its new place, and fades what has no match', () => {
    const from = [paint('t1', '2'), paint('t1', 'x'), paint('t2', '+'), paint('t3', '3')];
    const to = [paint('t1', '2'), paint('t1', 'x'), paint('t6', '−'), paint('t3', '3')];
    const plan = planPaints({ from, to, movedTermIds: new Set(['t3']) });
    expect(plan.flights).toEqual([
      { fromIndex: 0, toIndex: 0, isCrossing: false },
      { fromIndex: 1, toIndex: 1, isCrossing: false },
      { fromIndex: 3, toIndex: 3, isCrossing: true },
    ]);
    expect(plan.leaving).toEqual([2]);
    expect(plan.arriving).toEqual([2]);
  });

  it('lets a glyph travel when its term changed, so the 2 in 2x lands under the 8', () => {
    const from = [paint('t1', '2'), paint('t1', 'x'), paint('t2', '='), paint('t3', '8')];
    const to = [paint('t4', 'x'), paint('t2', '='), paint('t5', '2'), paint('t5', null), paint('t5', '8')];
    const plan = planPaints({ from, to, movedTermIds: empty });
    const landed = plan.flights.map(({ fromIndex, toIndex }) => [from[fromIndex]?.glyph, to[toIndex]?.glyph]);
    expect(landed).toEqual(expect.arrayContaining([['2', '2'], ['x', 'x'], ['=', '='], ['8', '8']]));
    expect(plan.arriving.map((index) => to[index]?.glyph)).toEqual([null]);
    expect(plan.leaving).toEqual([]);
  });

  it('fades a big rewrite rather than sending a crowd of glyphs across each other', () => {
    const glyphs = ['2', '1', '4', '3', '5', '6', '7'];
    const from = glyphs.map((glyph) => paint('old', glyph));
    const to = glyphs.map((glyph) => paint('new', glyph));
    const plan = planPaints({ from, to, movedTermIds: empty });
    expect(plan.flights).toEqual([]);
    expect(plan.leaving).toHaveLength(glyphs.length);
    expect(plan.arriving).toHaveLength(glyphs.length);
  });

  it('still moves a kept term during a big rewrite around it', () => {
    const glyphs = ['2', '1', '4', '3', '5', '6', '7'];
    const from = [paint('equals', '='), ...glyphs.map((glyph) => paint('old', glyph))];
    const to = [...glyphs.map((glyph) => paint('new', glyph)), paint('equals', '=')];
    expect(planPaints({ from, to, movedTermIds: empty }).flights).toEqual([{ fromIndex: 0, toIndex: 7, isCrossing: false }]);
  });

  it('never flies a shape to a shape in another term', () => {
    const plan = planPaints({ from: [paint('t1', null)], to: [paint('t2', null)], movedTermIds: empty });
    expect(plan).toEqual({ flights: [], leaving: [0], arriving: [0] });
  });

  it('never lands two glyphs on one place', () => {
    const plan = planPaints({ from: [paint('a', 'x'), paint('b', 'x')], to: [paint('c', 'x')], movedTermIds: empty });
    expect(plan.flights).toHaveLength(1);
    expect(plan.leaving).toHaveLength(1);
  });

  it('treats paints it could not map to terms as loose glyphs', () => {
    const plan = planPaints({ from: [paint(null, 'x'), paint(null, null)], to: [paint(null, 'x'), paint(null, null)], movedTermIds: empty });
    expect(plan.flights).toEqual([{ fromIndex: 0, toIndex: 0, isCrossing: true }]);
    expect(plan.leaving).toEqual([1]);
  });
});

describe('a flight', () => {
  const ends = { from: paint('t', '3', 40, 0), to: paint('t', '3', 140, 0), isCrossing: true };

  it('starts exactly at its old place and ends exactly at its new one, so the first and last frames are the plain equation', () => {
    expect(getFlightTransform(ends, 0)).toBe('translate(0.00px, 0.00px) scale(1.0000)');
    expect(getFlightTransform(ends, 1)).toBe('translate(100.00px, 0.00px) scale(1.0000)');
    expect(getOffsetFromLanding(ends, 1)).toEqual({ x: 0, y: expect.closeTo(0) });
  });

  it('lifts clear halfway when it crosses other terms, and stays level when it does not', () => {
    expect(getFlightTransform(ends, 0.5)).toBe(`translate(50.00px, ${(-FONT * 0.8).toFixed(2)}px) scale(1.0000)`);
    expect(getFlightTransform({ ...ends, isCrossing: false }, 0.5)).toBe('translate(50.00px, 0.00px) scale(1.0000)');
  });

  it('passes under when it lands lower, so it does not cross the equation twice', () => {
    const falling = { ...ends, to: paint('t', '3', 140, 30) };
    expect(getOffsetFromLanding(falling, 0.5).y).toBeGreaterThan(-15);
  });

  it('changes size as it goes when it lands in an exponent', () => {
    const small = { ...paint('t', '2', 20, 0), fontSize: FONT * 0.7 };
    expect(getFlightTransform({ from: paint('t', '2'), to: small, isCrossing: false }, 1)).toContain('scale(0.7000)');
  });

  it('gives the same answer for the same moment, which a frozen frame depends on', () => {
    expect(getFlightTransform(ends, 0.37)).toBe(getFlightTransform(ends, 0.37));
  });
});

describe('getBoxUnion', () => {
  it('holds every box', () => {
    expect(getBoxUnion([{ x: 0, y: 5, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 }])).toEqual({ x: 0, y: 0, width: 25, height: 15 });
    expect(getBoxUnion([])).toBeNull();
  });
});

describe('easeInOut', () => {
  it('keeps both ends', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
  });
});
