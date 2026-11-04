import type { ElementId, SceneCommand } from '@astra/contracts';
import { parseSceneCommand } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { getFigureMarks } from '../src/figure/get-figure-marks.ts';
import { getBoardAt } from '../src/player/board-state.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';
import { getDragXAtPixel } from '../src/plot/plot-figure.ts';
import { checkWorkOnBoard } from '../src/shared/work-context.ts';
import { getDragStep, getPointX, snapDragX } from '../src/shared/drag-point.ts';

const WORDS = { metres: 'm', degrees: 'd', tooFine: 'too fine', slope: 'slope', readouts: new Proxy({}, { get: () => ({ label: '', unit: '' }) }), parameters: new Proxy({}, { get: () => ({ label: '', unit: '' }) }) } as never;
const SIZE = { width: 580, height: 418 };
const PLOT = { kind: 'plot', id: 'curve', expression: 'x^2 - 4*x + 3', domain: [-1, 5] };
const DRAG = { kind: 'task', id: 'a1', way: 'drag', on: 'curve', seek: 'flat' };
const TANGENT = { kind: 'tangent', id: 't1', target: 'curve' };

function place(raw: object, atMs: number): BoardOperation {
  const parsed = parseSceneCommand(raw);
  if (!parsed.ok) throw new Error(parsed.problem);
  return { kind: 'command', atMs, command: parsed.value as SceneCommand, overMs: null };
}

const moved = (x: number, atMs: number): BoardOperation => ({ kind: 'pointMoved', atMs, task: 'a1' as ElementId, x });

function getMarksAt(operations: BoardOperation[], atMs: number) {
  const board = getBoardAt(operations, atMs);
  const element = board.elements.get('curve' as ElementId);
  if (!element) throw new Error('no plot');
  return getFigureMarks({ board, element, atMs, isReducedMotion: false, words: WORDS, ...SIZE });
}

const named = (marks: ReturnType<typeof getMarksAt>, start: string) => marks.find(({ key }) => key.startsWith(start));
const textOf = (mark: ReturnType<typeof named>) => (mark?.kind === 'text' ? mark.lines.join(' ') : null);

describe('the student\'s point on a plot', () => {
  const opening = [place(PLOT, 0), place(DRAG, 1000)];

  it('waits on the curve with a pulsing ring and its coordinates, once the curve has drawn', () => {
    expect(named(getMarksAt([place(PLOT, 0), place(DRAG, 200)], 300), 'point-')).toBeUndefined();
    const marks = getMarksAt(opening, 3000);
    expect(named(marks, 'point-ring-')).toBeDefined();
    expect(named(marks, 'point-a1')).toBeDefined();
    expect(textOf(named(marks, 'coordinates-'))).toBe('(-0.1, 3.4)'.replace(/-/g, '−'));
  });

  it('loses its ring once moved, follows the student, and writes a true minus sign', () => {
    const marks = getMarksAt([...opening, moved(2, 3000)], 3500);
    expect(named(marks, 'point-ring-')).toBeUndefined();
    expect(textOf(named(marks, 'coordinates-'))).toBe('(2, −1)');
  });

  it('draws the tangent only when the tutor has shown it, with its slope, and says zero at the vertex', () => {
    expect(named(getMarksAt([...opening, moved(1, 3000)], 3500), 'tangent-')).toBeUndefined();
    const withTangent = [...opening, place(TANGENT, 2000)];
    const steep = getMarksAt([...withTangent, moved(1, 3000)], 3500);
    expect(named(steep, 'tangent-')).toBeDefined();
    expect(textOf(named(steep, 'slope-'))).toBe('slope −2');
    expect(textOf(named(getMarksAt([...withTangent, moved(2, 3000)], 3500), 'slope-'))).toBe('slope 0');
  });

  it('keeps its tangent inside the axes at the edge of the plot', () => {
    const marks = getMarksAt([place(PLOT, 0), place(DRAG, 1000), place(TANGENT, 1000), moved(5, 3000)], 3500);
    const tangent = named(marks, 'tangent-');
    if (tangent?.kind !== 'path') throw new Error('no tangent');
    expect(textOf(named(marks, 'slope-'))).toBe('slope 6');
    for (const point of tangent.branches.flat()) {
      expect(point.x).toBeLessThanOrEqual(SIZE.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('turns a pointer on the figure into a place on the curve, snapped and kept on the plot', () => {
    const board = getBoardAt(opening, 3000);
    const element = board.elements.get('curve' as ElementId);
    if (!element) throw new Error('no plot');
    const frame = { element, atMs: 3000, isReducedMotion: false, ...SIZE };
    expect(getDragXAtPixel(frame, -500)).toBe(-1);
    expect(getDragXAtPixel(frame, 5000)).toBe(5);
    const tenths = getDragXAtPixel(frame, SIZE.width / 2) * 10;
    expect(Math.abs(tenths - Math.round(tenths))).toBeLessThan(1e-6);
  });
});

describe('a drag on a small plot', () => {
  it('writes as many places as the point moves in', () => {
    const marks = getMarksAt([place({ ...PLOT, expression: 'x', domain: [0, 1] }, 0), place(DRAG, 1000), moved(0.37, 3000)], 3500);
    expect(textOf(named(marks, 'coordinates-'))).toBe('(0.37, 0.37)');
  });
});

describe('a drag on a wide plot', () => {
  const wide = (x: number) => {
    const board = getBoardAt([place({ ...PLOT, expression: '(x - 47.3)^2', domain: [0, 100] }, 0), place(DRAG, 1000)], 3000);
    return checkWorkOnBoard({ way: 'drag', task: 'a1' as ElementId, x, samples: [] }, board).verdict.status;
  };

  it('can always be landed, because the check is never finer than the point can move', () => {
    expect(getDragStep([0, 100])).toBe(1);
    expect(snapDragX(47.3, [0, 100])).toBe(47);
    expect(wide(47)).toBe('right');
    expect(wide(44)).toBe('wrong');
  });
});

describe('getPointX', () => {
  it('reads where the student left it', () => {
    const board = getBoardAt([place(PLOT, 0), place(DRAG, 1000), moved(3, 2000)], 2500);
    expect(getPointX(board.elements.get('a1' as ElementId) as never, [-1, 5])).toBe(3);
  });
});
