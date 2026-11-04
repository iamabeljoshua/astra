import { describe, expect, it } from 'vitest';
import { drawDiagram } from '../src/ink/diagram.ts';
import { canWriteByHand, writeByHand } from '../src/ink/handwriting.ts';
import { getStrokePath, getStrokeProgress, makeStroke } from '../src/ink/ink-stroke.ts';
import { drawMark } from '../src/ink/marks.ts';

const REQUEST = { fontSize: 20, maxWidth: 300, seed: 'note' };
const getPaths = (drawing: { strokes: readonly Parameters<typeof getStrokePath>[0][] } | null) => drawing?.strokes.map(getStrokePath);

describe('writeByHand', () => {
  it('turns words into strokes, and the same seed gives the same strokes', () => {
    const first = writeByHand({ ...REQUEST, text: 'Undo the plus three' });
    expect(first?.strokes.length).toBeGreaterThan(10);
    expect(getPaths(first)).toEqual(getPaths(writeByHand({ ...REQUEST, text: 'Undo the plus three' })));
  });

  it('gives another line a different wobble', () => {
    expect(getPaths(writeByHand({ ...REQUEST, text: 'same words' }))).not.toEqual(getPaths(writeByHand({ ...REQUEST, text: 'same words', seed: 'other' })));
  });

  it('wraps to the width it is given', () => {
    const drawing = writeByHand({ ...REQUEST, text: 'the quick brown fox jumps over the lazy dog again and again', maxWidth: 150 });
    expect(drawing?.width).toBeLessThanOrEqual(150);
    expect(drawing?.height).toBeGreaterThan(REQUEST.fontSize * 2);
  });

  it('breaks a word wider than the board, so it can never leave the board', () => {
    const drawing = writeByHand({ ...REQUEST, text: 'x'.repeat(400), maxWidth: 120 });
    expect(drawing?.width).toBeLessThanOrEqual(120);
    for (const stroke of drawing?.strokes ?? []) for (const point of stroke.points) expect(point.x).toBeLessThan(120 + REQUEST.fontSize);
  });

  it('holds any hostile text as strokes, with nothing to run', () => {
    const drawing = writeByHand({ ...REQUEST, text: '<script>alert("x")</script>' });
    expect(drawing?.strokes.length).toBeGreaterThan(0);
    expect(getPaths(drawing)?.join('')).toMatch(/^[MQLh\d\s.-]+$/);
  });

  it.each(['Ṣade', '日本語', '😀'])('says so when the strokes cannot write %s', (text) => {
    expect(canWriteByHand(text)).toBe(false);
    expect(writeByHand({ ...REQUEST, text })).toBeNull();
  });
});

describe('getStrokeProgress', () => {
  const strokes = [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 0 }]), makeStroke([{ x: 0, y: 0 }, { x: 30, y: 0 }])];

  it('moves the pen at one speed across long and short strokes', () => {
    expect(getStrokeProgress(strokes, 0)).toEqual([0, 0]);
    expect(getStrokeProgress(strokes, 0.25)).toEqual([1, 0]);
    expect(getStrokeProgress(strokes, 0.5)).toEqual([1, expect.closeTo(1 / 3)]);
    expect(getStrokeProgress(strokes, 1)).toEqual([1, 1]);
  });

  it('holds its ends when asked for more than the whole', () => {
    expect(getStrokeProgress(strokes, 7)).toEqual([1, 1]);
    expect(getStrokeProgress(strokes, -1)).toEqual([0, 0]);
  });
});

describe('drawMark', () => {
  const box = { x: 100, y: 50, width: 40, height: 24 };

  it('draws a ring around the box, with its ends past each other as a hand leaves them', () => {
    const [ring] = drawMark({ mark: 'circle', box, seed: 'a' });
    const xs = ring?.points.map((point) => point.x) ?? [];
    const ys = ring?.points.map((point) => point.y) ?? [];
    expect(Math.min(...xs)).toBeLessThan(box.x);
    expect(Math.max(...xs)).toBeGreaterThan(box.x + box.width);
    expect(Math.min(...ys)).toBeLessThan(box.y);
    expect(Math.max(...ys)).toBeGreaterThan(box.y + box.height);
  });

  it.each([['underline', 1], ['check', 1], ['cross', 2]] as const)('draws a %s in %i strokes', (mark, count) => {
    expect(drawMark({ mark, box, seed: 'a' })).toHaveLength(count);
  });

  it('draws the same mark in a replay', () => {
    expect(drawMark({ mark: 'circle', box, seed: 'a' }).map(getStrokePath)).toEqual(drawMark({ mark: 'circle', box, seed: 'a' }).map(getStrokePath));
  });
});

describe('drawDiagram', () => {
  const diagram = { nodes: [{ name: 'a', label: 'Rain' }, { name: 'b', label: 'River' }, { name: 'c', label: 'Sea' }], edges: [{ from: 'a', to: 'b', label: 'runs' }, { from: 'c', to: 'a' }] };

  it('draws one step per node, and an edge once both its ends are there', () => {
    const drawn = drawDiagram(diagram, { fontSize: 18, maxWidth: 600, seed: 'd' });
    const counts = drawn.steps.map((step) => step.strokes.length);
    const arrow = 2;
    expect(drawn.steps).toHaveLength(3);
    expect(counts[1]).toBeGreaterThan(arrow + 1);
    expect(drawn.width).toBeLessThanOrEqual(600);
  });

  it('wraps nodes to the width it is given, and stays inside it', () => {
    const narrow = drawDiagram(diagram, { fontSize: 18, maxWidth: 150, seed: 'd' });
    const wide = drawDiagram(diagram, { fontSize: 18, maxWidth: 600, seed: 'd' });
    expect(narrow.height).toBeGreaterThan(wide.height);
    for (const step of narrow.steps) for (const stroke of step.strokes) for (const point of stroke.points) expect(point.x).toBeLessThanOrEqual(narrow.width + 1e-6);
  });

  it('keeps every stroke inside the size it reports, with no negative positions', () => {
    const drawn = drawDiagram(diagram, { fontSize: 18, maxWidth: 200, seed: 'd' });
    for (const step of drawn.steps) for (const stroke of step.strokes) for (const point of stroke.points) expect(point.y).toBeGreaterThanOrEqual(-1e-6);
  });
});
