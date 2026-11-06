import { type BoardOperation, getBoardAt } from '@astra/board';
import { describe, expect, it } from 'vitest';
import { getLatestRowId } from './useDotTarget';

const command = (value: object, atMs: number) => ({ kind: 'command', atMs, command: value, overMs: null }) as unknown as BoardOperation;

describe('where the dot goes', () => {
  it('goes to the sketch row when the tutor points at one of its pieces', () => {
    const board = getBoardAt([command({ kind: 'sketch', id: 'desk' }, 1), command({ kind: 'drawShape', id: 'ball', target: 'desk', shape: 'ball' }, 2), command({ kind: 'focus', target: 'ball' }, 3)], 1000);
    expect(getLatestRowId(board)).toBe('desk');
  });
});
