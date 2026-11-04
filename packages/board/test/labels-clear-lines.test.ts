import { describe, expect, it } from 'vitest';
import { drawMark } from '../src/ink/marks.ts';
import { estimateTextWidth, placeLabels } from '../src/figure/place-labels.ts';
import type { Branch, FigureMark } from '../src/figure/figure-marks.ts';

const BOUNDS = { left: 0, top: 0, right: 400, bottom: 200 };

const getLabelBox = (mark: FigureMark & { kind: 'text' }) => {
  const width = Math.max(...mark.lines.map(estimateTextWidth));
  const left = mark.anchor === 'middle' ? mark.at.x - width / 2 : mark.at.x;
  return { left, right: left + width, top: mark.at.y - 11, bottom: mark.at.y + mark.lines.length * 15 - 11 };
};

const crosses = (line: Branch, box: ReturnType<typeof getLabelBox>) => line.some(({ x, y }) => x > box.left && x < box.right && y > box.top && y < box.bottom);

describe('labels clear every line', () => {
  it('moves a label off a wave that runs through its first spot', () => {
    const wave: Branch = Array.from({ length: 400 }, (_, x) => ({ x, y: 100 + Math.sin(x / 20) * 90 }));
    const [label] = placeLabels([{ key: 'crest', text: 'crest', anchor: { x: 31, y: 10 }, gap: 6, sides: ['right'], tone: 'ink' }], { bounds: BOUNDS, mustAvoid: [], shouldAvoid: [], linesToClear: [wave] });
    expect(label?.kind).toBe('text');
    expect(crosses(wave, getLabelBox(label as FigureMark & { kind: 'text' }))).toBe(false);
  });

  it('stacks the words of a long label rather than lose them, and keeps every word', () => {
    const left: Branch = Array.from({ length: 200 }, (_, y) => ({ x: 150, y }));
    const right: Branch = Array.from({ length: 200 }, (_, y) => ({ x: 250, y }));
    const [label] = placeLabels([{ key: 'long', text: 'a label wider than the gap', anchor: { x: 200, y: 100 }, gap: 2, sides: ['above'], tone: 'ink' }], { bounds: BOUNDS, mustAvoid: [{ left: 0, top: 0, right: 150, bottom: 200 }, { left: 250, top: 0, right: 400, bottom: 200 }], shouldAvoid: [], linesToClear: [left, right] });
    expect(label?.kind === 'text' && label.lines.join(' ')).toBe('a label wider than the gap');
  });

  it('tells the tutor when no spot clears the lines, and does not cross one', () => {
    const fill: Branch[] = Array.from({ length: 40 }, (_, row) => [{ x: 0, y: row * 5 }, { x: 400, y: row * 5 }]);
    const noRoom: string[] = [];
    const marks = placeLabels([{ key: 'name', text: 'no room', anchor: { x: 200, y: 100 }, gap: 6, sides: ['right'], tone: 'ink' }], { bounds: BOUNDS, mustAvoid: [], shouldAvoid: [], linesToClear: fill, onNoRoom: (text) => noRoom.push(text) });
    expect(marks).toEqual([]);
    expect(noRoom).toEqual(['no room']);
  });

  it('lets a tick number stay on its axis', () => {
    const axis: Branch = [{ x: 0, y: 100 }, { x: 400, y: 100 }];
    const marks = placeLabels([{ key: 'tick', text: '1', anchor: { x: 200, y: 100 }, gap: 0, sides: ['right'], tone: 'ink-2', isOptional: true, isFixed: true }], { bounds: BOUNDS, mustAvoid: [], shouldAvoid: [], linesToClear: [axis] });
    expect(marks).toHaveLength(1);
  });
});

describe('a ring holds the whole box', () => {
  const isInsideBox = ({ x, y }: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }) => x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height;

  it.each([
    ['a whole table', { x: 24, y: 24, width: 712, height: 300 }],
    ['a picture', { x: 16, y: 40, width: 326, height: 253 }],
    ['one word', { x: 100, y: 100, width: 10, height: 18 }],
    ['a long line', { x: 24, y: 24, width: 700, height: 24 }],
  ])('around %s, no point of the ring lands inside the box', (_, box) => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const [ring] = drawMark({ mark: 'circle', box, seed });
      expect(ring?.points.filter((point) => isInsideBox(point, box))).toEqual([]);
    }
  });
});
