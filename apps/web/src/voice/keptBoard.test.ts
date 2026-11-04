import { describe, expect, it, vi } from 'vitest';
import type { ElementId } from '@astra/contracts';
import { type BoardOperation, describeBoard, getBoardAt } from '@astra/board';
import { checkWorkOnBoard, getWorkContext } from '@astra/board/shared';
import { getKeptBoard, keepBoard } from './keptBoard.ts';

const problem: BoardOperation = { kind: 'command', atMs: 90_000, command: { kind: 'writeMath', id: 'steps' as ElementId, tex: '2x + 3 = 11', claim: 'new' }, overMs: null };
const work = { way: 'write', id: 's1' as ElementId, text: '2x = 8' } as const;

function getPageBefore(): BoardOperation[] {
  const checked = checkWorkOnBoard(work, getBoardAt([problem], 95_000));
  return [problem, { kind: 'worked', atMs: 95_000, action: { action: 'worked', work, ...checked } }];
}

describe('a board kept across a reload', () => {
  it('comes back whole, already drawn, before the new page clock starts', () => {
    keepBoard('room-a', getPageBefore());
    const kept = getKeptBoard('room-a');
    const before = describeBoard(getBoardAt(getPageBefore(), 200_000), 200_000);
    expect(describeBoard(getBoardAt(kept, 0), 0).elements).toEqual(before.elements);
    expect(kept.every(({ atMs }) => atMs < 0)).toBe(true);
  });

  it('keeps the problem line, so the next typed line is still checked against it', () => {
    keepBoard('room-b', getPageBefore());
    const board = getBoardAt(getKeptBoard('room-b'), 0);
    expect(getWorkContext(board, undefined).problemTex).toBe('2x + 3 = 11');
    expect(checkWorkOnBoard({ way: 'write', id: 's2' as ElementId, text: 'x = 4' }, board).verdict.status).toBe('right');
  });

  it('holds nothing of another room', () => {
    keepBoard('room-c', getPageBefore());
    expect(getKeptBoard('another-room')).toEqual([]);
  });

  it('never breaks the page when the store is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => keepBoard('room-d', getPageBefore())).not.toThrow();
    blocked.mockRestore();
    expect(getKeptBoard('room-d')).toEqual([]);
  });

  it('drops the ink before it gives up the board, when the store cannot hold it all', () => {
    const points = Array.from({ length: 200_000 }, (_, index) => ({ x: index, y: index, t: index }));
    keepBoard('room-e', [...getPageBefore(), { kind: 'inkStroke', atMs: 96_000, id: 'k1' as ElementId, points }]);
    expect(getKeptBoard('room-e').map(({ kind }) => kind)).toEqual(['command', 'worked']);
  });
});
