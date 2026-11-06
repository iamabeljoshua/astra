import { describe, expect, it } from 'vitest';
import { getBoardProblem, parseSceneCommand } from '../src/index.ts';

const piece = (fields: Record<string, unknown>) => ({ kind: 'drawShape', id: 'ball', target: 'desk', shape: 'ball', ...fields });
const problemOf = (value: unknown) => {
  const parsed = parseSceneCommand(value);
  return parsed.ok ? null : parsed.problem;
};

describe('reading a sketch piece', () => {
  it.each([
    ['two places at once', piece({ on: 'table', leftOf: 'box' }), 'at most one of at, on, above, below, leftOf, rightOf, inside'],
    ['a gap with nothing to keep it from', piece({ gap: 'far' }), 'gap only with above, below, leftOf, or rightOf'],
    ['a side on a piece placed beside another', piece({ leftOf: 'box', side: 'left' }), 'side only with on, above, or below'],
    ['a number for where it goes', piece({ at: [3, 4] }), 'one of top-left'],
    ['a field a ball does not have', piece({ toward: 'down' }), 'unknown field'],
    ['a shape the pen cannot draw', piece({ shape: 'dragon' }), 'one of ball'],
    ['a spot name as its own name', { ...piece({}), id: 'center' }, 'a piece name that is not a spot name'],
    ['a line with only one end and no way to go', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'arrow', from: 'ball' }, 'from and to, or one of them with toward'],
    ['a line with both ends and a way to go', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'arrow', from: 'ball', to: 'box', toward: 'down' }, 'from and to, or one of them with toward'],
    ['a length with no way to go', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'line', from: 'ball', to: 'box', length: 'long' }, 'length only with toward'],
    ['an end on a side a piece does not have', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'line', from: 'ball.middle', to: 'box' }, 'a spot, a piece, or a piece and one of'],
    ['a curve through seven ends', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'curve', through: ['top', 'left', 'center', 'right', 'bottom', 'top-left', 'top-right'] }, 'at most 6 items'],
    ['a curve through one end', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'curve', through: ['top'] }, 'at least 2 ends'],
    ['a label of more than 32 characters', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'label', text: 'x'.repeat(33) }, 'at most 32 characters'],
    ['a label with math in it', { kind: 'drawShape', id: 'a', target: 'desk', shape: 'label', text: '\\frac{1}{2}' }, 'plain words'],
  ])('refuses %s', (_, value, problem) => {
    expect(problemOf(value)).toContain(problem);
  });

  it('takes a ball on a table, an arrow off one side of a plank, and a curve through a spot and a piece', () => {
    expect(problemOf(piece({ size: 'small', on: 'table', side: 'left', lit: 'sun', label: 'ball', pen: true }))).toBeNull();
    expect(problemOf({ kind: 'drawShape', id: 'push', target: 'desk', shape: 'arrow', to: 'plank.right', toward: 'down', length: 'short' })).toBeNull();
    expect(problemOf({ kind: 'drawShape', id: 'path', target: 'desk', shape: 'curve', through: ['bottom-left', 'ball', 'top-right'] })).toBeNull();
  });
});

describe('reading a motion', () => {
  it.each([
    ['a tilt with no side to tip toward', { kind: 'animate', target: 'plank', motion: 'tilt', around: 'pivot' }, 'one of left, right'],
    ['an angle for a tilt, which the board works out', { kind: 'animate', target: 'plank', motion: 'tilt', around: 'pivot', toward: 'left', degrees: 20 }, 'unknown field'],
    ['an orbit of a hundred turns', { kind: 'animate', target: 'moon', motion: 'orbit', around: 'earth', turns: 100 }, 'a number from 0.25 to 6'],
    ['a swing with no point to hang from', { kind: 'animate', target: 'bob', motion: 'swing' }, 'an element id'],
    ['a speed for a fall, which gravity sets', { kind: 'animate', target: 'ball', motion: 'fall', speed: 3 }, 'unknown field'],
    ['a motion over more words than a beat holds', { kind: 'animate', target: 'ball', motion: 'fall', overWords: 61 }, 'a whole number from 1 to 60'],
  ])('refuses %s', (_, value, problem) => {
    expect(problemOf(value)).toContain(problem);
  });
});

describe('a sketch command on the board', () => {
  const board = new Map([['desk', 'sketch'], ['table', 'drawShape'], ['notes', 'table']] as const);

  it('needs its sketch and every piece it leans on to be there already', () => {
    const value = (fields: Record<string, unknown>) => {
      const parsed = parseSceneCommand(fields);
      if (!parsed.ok) throw new Error(parsed.problem);
      return parsed.value;
    };
    expect(getBoardProblem(value(piece({ on: 'table' })), board)).toBeNull();
    expect(getBoardProblem(value(piece({ on: 'table', lit: 'sun' })), board)).toBeNull();
    expect(getBoardProblem(value(piece({ on: 'shelf' })), board)).toBe('drawShape leans on shelf, which is not a piece of a sketch on the board');
    expect(getBoardProblem(value(piece({ on: 'notes' })), board)).toBe('drawShape leans on notes, which is not a piece of a sketch on the board');
    expect(getBoardProblem(value({ ...piece({}), target: 'notes' }), board)).toBe('drawShape needs sketch, but notes is a table');
    expect(getBoardProblem(value({ kind: 'animate', target: 'table', motion: 'orbit', around: 'sun' }), board)).toBe('animate leans on sun, which is not a piece of a sketch on the board');
    expect(getBoardProblem(value(piece({ inside: 'desk' })), board)).toBe('inside names desk, the sketch itself, so put the piece at a spot instead, as in "at":"left"');
  });
});
