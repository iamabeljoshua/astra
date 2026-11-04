import { type BoardOperation, getBoardAt } from '@astra/board';
import { describe, expect, it } from 'vitest';
import { getBoardRows } from './boardRows';

const command = (value: object, atMs: number) => ({ kind: 'command', atMs, command: value, overMs: null }) as unknown as BoardOperation;
const line = (id: string, status: 'right' | 'wrong', atMs: number) =>
  ({ kind: 'worked', atMs, action: { action: 'worked', work: { way: 'write', id, text: id }, reading: { kind: 'words', parts: [{ type: 'words', text: id }], isAsking: false }, verdict: status === 'wrong' ? { status, why: 'false' } : { status } } }) as unknown as BoardOperation;

describe('the rows of the shared board', () => {
  it('puts a check or cross and a note in the gutter of their line, and a ring on the line itself', () => {
    const board = getBoardAt([line('s1', 'wrong', 1), command({ kind: 'annotate', id: 'x1', target: 's1', mark: 'cross' }, 2), command({ kind: 'note', id: 'n1', target: 's1', text: 'both sides?' }, 3), command({ kind: 'highlight', id: 'r1', target: 's1' }, 4)], 10);
    const [row] = getBoardRows(board);
    expect(row?.marks.map((mark) => mark.id)).toEqual(['x1']);
    expect(row?.notes.map((note) => note.id)).toEqual(['n1']);
  });

  it('strikes a crossed line only once a later line is right', () => {
    const crossed = [line('s1', 'wrong', 1), command({ kind: 'annotate', id: 'x1', target: 's1', mark: 'cross' }, 2)];
    expect(getBoardRows(getBoardAt(crossed, 10))[0]?.isStruck).toBe(false);
    expect(getBoardRows(getBoardAt([...crossed, line('s2', 'wrong', 3)], 10))[0]?.isStruck).toBe(false);
    expect(getBoardRows(getBoardAt([...crossed, line('s2', 'right', 3)], 10))[0]?.isStruck).toBe(true);
  });

  it('gives a task a row only when the student does the work inside it', () => {
    const board = getBoardAt([command({ kind: 'writeMath', id: 'eq', tex: 'x=1' }, 1), command({ kind: 'task', id: 'a1', way: 'write', on: 'eq' }, 2), command({ kind: 'task', id: 'a2', way: 'place', items: ['a'], slots: ['b'] }, 3)], 10);
    expect(getBoardRows(board).map((row) => row.element.id)).toEqual(['eq', 'a2']);
  });
});
