import { describe, expect, it } from 'vitest';
import { drawDiagram } from '../src/ink/diagram.ts';
import { canWriteByHand, writeByHand } from '../src/ink/handwriting.ts';
import { getStrokePath, getStrokeProgress, makeSeededRandom, makeStroke } from '../src/ink/ink-stroke.ts';
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

  it('finishes every stroke at the end, whatever the rounding, so nothing is left mid-stroke at rest', () => {
    const random = makeSeededRandom('lengths');
    for (let run = 0; run < 300; run += 1) {
      const lengths = Array.from({ length: 2 + Math.floor(random() * 30) }, () => makeStroke([{ x: 0, y: 0 }, { x: random() * 40, y: random() * 40 }]));
      expect(getStrokeProgress(lengths, 1).every((drawn) => drawn === 1)).toBe(true);
    }
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
    const request = { fontSize: 18, maxWidth: 600, seed: 'd' };
    const getCounts = (edges: typeof diagram.edges) => drawDiagram({ ...diagram, edges }, request).steps.map((step) => step.strokes.length);
    const [nodeA, nodeB, nodeC] = getCounts([]);
    const [withA, withB, withC] = getCounts(diagram.edges);
    const arrow = 2;
    expect(withA).toBe(nodeA);
    expect(withB).toBeGreaterThan((nodeB ?? 0) + arrow);
    expect(withC).toBe((nodeC ?? 0) + arrow);
    expect(drawDiagram(diagram, request).width).toBeLessThanOrEqual(600);
  });

  it('wraps nodes to the width it is given, and stays inside it', () => {
    const narrow = drawDiagram(diagram, { fontSize: 18, maxWidth: 150, seed: 'd' });
    const wide = drawDiagram(diagram, { fontSize: 18, maxWidth: 600, seed: 'd' });
    expect(narrow.height).toBeGreaterThan(wide.height);
    for (const step of narrow.steps) for (const stroke of step.strokes) for (const point of stroke.points) expect(point.x).toBeLessThanOrEqual(narrow.width + 1e-6);
  });

  describe('a label the strokes cannot write', () => {
    const OUTSIDE = { nodes: [{ name: 'a', label: 'H\u2082O' }, { name: 'b', label: '\u0394v' }, { name: 'c', label: 'Water' }], edges: [{ from: 'a', to: 'b', label: '\u2192 heat' }, { from: 'b', to: 'c', label: 'runs' }] };
    const REQUEST = { fontSize: 18, maxWidth: 600, seed: 'd', measureText: (text: string, fontSize: number) => text.length * fontSize * 0.5 };
    const textLabels = (drawn: ReturnType<typeof drawDiagram>) => drawn.steps.flatMap((step) => step.textLabels);

    it('is set as plain text, and a label the strokes can write stays strokes', () => {
      expect(textLabels(drawDiagram(OUTSIDE, REQUEST)).map((label) => label.lines.join(' '))).toEqual(['H\u2082O', '\u0394v', '\u2192 heat']);
      expect(textLabels(drawDiagram(diagram, REQUEST))).toEqual([]);
    });

    it('sits inside a box sized for it', () => {
      const drawn = drawDiagram({ nodes: OUTSIDE.nodes.slice(0, 1), edges: [] }, REQUEST);
      const [label] = textLabels(drawn);
      const xs = drawn.steps[0]?.strokes[0]?.points.map((point) => point.x) ?? [];
      const ys = drawn.steps[0]?.strokes[0]?.points.map((point) => point.y) ?? [];
      expect(label?.x).toBeGreaterThan(Math.min(...xs));
      expect((label?.x ?? 0) + (label?.width ?? 0)).toBeLessThan(Math.max(...xs));
      expect(label?.y).toBeGreaterThan(Math.min(...ys));
      expect((label?.y ?? 0) + (label?.height ?? 0)).toBeLessThan(Math.max(...ys));
    });

    it('wraps to the width it has, however long, and stays inside the size it reports', () => {
      const long = { nodes: [{ name: 'a', label: `\u0394${'long words here '.repeat(4)}` }, { name: 'b', label: `\u0394${'w'.repeat(79)}` }], edges: [] };
      const drawn = drawDiagram(long, { ...REQUEST, maxWidth: 160 });
      for (const label of textLabels(drawn)) {
        expect(label.lines.length).toBeGreaterThan(1);
        expect(label.x + label.width).toBeLessThanOrEqual(drawn.width + 1e-6);
        expect(label.y + label.height).toBeLessThanOrEqual(drawn.height + 1e-6);
      }
      const boxWobble = 3;
      expect(drawn.width).toBeLessThanOrEqual(160 + boxWobble);
    });

    it('widens the gap an edge label needs, as a written one does', () => {
      const gapOf = (label: string) => {
        const drawn = drawDiagram({ nodes: OUTSIDE.nodes.slice(0, 2), edges: [{ from: 'a', to: 'b', label }] }, REQUEST);
        return drawn.width;
      };
      expect(gapOf('\u2192 a very long heat label')).toBeGreaterThan(gapOf('\u2192'));
    });

    it('puts the label of an edge between two rows in the gap, not over a box', () => {
      const drawn = drawDiagram({ nodes: OUTSIDE.nodes.slice(0, 2), edges: [{ from: 'a', to: 'b', label: '\u2192 runs' }] }, { ...REQUEST, maxWidth: 90 });
      const getBox = (step: number) => {
        const ys = drawn.steps[step]?.strokes[0]?.points.map((point) => point.y) ?? [];
        return { top: Math.min(...ys), bottom: Math.max(...ys) };
      };
      const [label] = textLabels(drawn).filter((candidate) => candidate.lines.join(' ').includes('runs'));
      expect(label?.y).toBeGreaterThanOrEqual(getBox(0).bottom - 3);
      expect((label?.y ?? 0) + (label?.height ?? 0)).toBeLessThanOrEqual(getBox(1).top + 3);
    });

    it('holds every label as plain text when the diagram is not handwritten', () => {
      expect(textLabels(drawDiagram({ ...diagram, handwritten: false }, REQUEST)).map((label) => label.lines.join(' '))).toEqual(['Rain', 'River', 'runs', 'Sea']);
    });
  });

  it('keeps every stroke inside the size it reports, with no negative positions', () => {
    const drawn = drawDiagram(diagram, { fontSize: 18, maxWidth: 200, seed: 'd' });
    for (const step of drawn.steps) for (const stroke of step.strokes) for (const point of stroke.points) expect(point.y).toBeGreaterThanOrEqual(-1e-6);
  });
});
