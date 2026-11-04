import { describe, expect, it } from 'vitest';
import { getBoardAt, describeBoard } from '../src/player/board-state.ts';
import { getFrozenFrames } from '../src/player/board-state.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';
import { startMathLine, transformMathLine } from '../src/math/math-line.ts';

function getIdsByTex(line: { terms: readonly { id: string; tex: string }[] }): [string, string][] {
  return line.terms.map(({ id, tex }) => [tex, id]);
}

describe('transformMathLine', () => {
  it('keeps every term id when nothing changes but the spacing', () => {
    const before = startMathLine('2x + 3 = 11');
    expect(getIdsByTex(transformMathLine(before, '2x+3=11'))).toEqual(getIdsByTex(before));
  });

  it('keeps the id of a term that crosses the equals sign, and gives a new sign a new id', () => {
    const before = startMathLine('2x + 3 = 11');
    expect(getIdsByTex(before)).toEqual([['2x', 't1'], ['+', 't2'], ['3', 't3'], ['=', 't4'], ['11', 't5']]);
    expect(getIdsByTex(transformMathLine(before, '2x = 11 - 3'))).toEqual([['2x', 't1'], ['=', 't4'], ['11', 't5'], ['-', 't6'], ['3', 't3']]);
  });

  it('keeps ids across a chain of steps, and never reuses one', () => {
    const steps = ['2x + 3 = 11', '2x = 11 - 3', '2x = 8', 'x = 4'];
    const lines = steps.slice(1).reduce((chain, tex) => [...chain, transformMathLine(chain.at(-1) as ReturnType<typeof startMathLine>, tex)], [startMathLine(steps[0] as string)]);
    expect(getIdsByTex(lines[2] as never)).toEqual([['2x', 't1'], ['=', 't4'], ['8', 't7']]);
    expect(getIdsByTex(lines[3] as never)).toEqual([['x', 't8'], ['=', 't4'], ['4', 't9']]);
  });

  it('matches repeated terms in reading order', () => {
    const before = startMathLine('x + x = y');
    expect(getIdsByTex(transformMathLine(before, 'y = x + x'))).toEqual([['y', 't5'], ['=', 't4'], ['x', 't1'], ['+', 't2'], ['x', 't3']]);
  });

  it('gives a term that was rewritten a new id, rather than pretending it moved', () => {
    const before = startMathLine('2(x + 1) = 4');
    const after = transformMathLine(before, '2x + 2 = 4');
    expect(after.terms.find((term) => term.tex === '2x')?.id).toBe('t4');
    expect(after.terms.find((term) => term.tex === '4')?.id).toBe('t3');
  });
});

describe('transformMath on the board', () => {
  const write: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'writeMath', id: 'eq' as never, tex: '2x + 3 = 11' } };
  const move: BoardOperation = { kind: 'command', atMs: 2000, overMs: null, command: { kind: 'transformMath', target: 'eq' as never, tex: '2x = 11 - 3' } };

  const getElement = (operations: BoardOperation[], atMs: number) => describeBoard(getBoardAt(operations, atMs), atMs).elements[0];

  it('runs the rearrangement from the clock', () => {
    expect(getElement([write, move], 1999)).toMatchObject({ tex: '2x + 3 = 11', drawn: 1 });
    expect(getElement([write, move], 2400)).toMatchObject({ tex: '2x = 11 - 3', morphFrom: '2x + 3 = 11', drawn: 0.5 });
    expect(getElement([write, move], 2800)).toMatchObject({ drawn: 1 });
  });

  it('rearranges over the words it was given', () => {
    const paced: BoardOperation = { ...move, overMs: 2000 } as BoardOperation;
    expect(getElement([write, paced], 3000)).toMatchObject({ drawn: 0.5 });
  });

  it('writes a long equation for longer than a short one, and over the words it was given', () => {
    const long: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'writeMath', id: 'long' as never, tex: 'x + '.repeat(10) } };
    const paced: BoardOperation = { kind: 'command', atMs: 0, overMs: 3000, command: { kind: 'writeMath', id: 'paced' as never, tex: 'x' } };
    expect(getElement([long], 400)?.drawn).toBeLessThan(1);
    expect(getElement([paced], 1500)?.drawn).toBe(0.5);
  });

  it('holds a rearrangement cut partway and reports where it stopped', () => {
    const cut: BoardOperation = { kind: 'freeze', atMs: 2400, frames: [{ target: 'eq' as never, drawnFraction: 0.5 }] };
    expect(getFrozenFrames(getBoardAt([write, move], 2400), 2400)).toEqual([{ target: 'eq', drawnFraction: 0.5 }]);
    expect(getElement([write, move, cut], 9000)).toMatchObject({ tex: '2x = 11 - 3', drawn: 0.5 });
  });

  it('finishes a cut rearrangement when the board unfreezes', () => {
    const cut: BoardOperation = { kind: 'freeze', atMs: 2400, frames: [] };
    const next: BoardOperation = { kind: 'beatStarted', atMs: 5000 };
    expect(getElement([write, move, cut, next], 6000)).toMatchObject({ drawn: 1 });
  });

  it('ignores a rearrangement of anything that is not an equation', () => {
    const note: BoardOperation = { kind: 'command', atMs: 0, overMs: null, command: { kind: 'text', id: 'eq' as never, text: 'words' } };
    expect(getElement([note, move], 2800)).toMatchObject({ kind: 'text', drawn: 1, tex: undefined });
  });
});
