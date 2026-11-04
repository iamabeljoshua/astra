import { describe, expect, it } from 'vitest';
import type { ElementId, SceneCommand, SessionEvent, StudentWork } from '@astra/contracts';
import { type BoardOperation, describeBoard, getBoardAt, rebuildBoard } from '../src/index.ts';
import { checkWorkOnBoard } from '../src/shared/index.ts';

const id = (value: string) => value as ElementId;
const setProblem = { kind: 'writeMath', id: id('steps'), tex: '2x+3=11' } as const;
const setTask = { kind: 'task', id: id('a1'), way: 'write', on: id('steps') } as const;
const setOrder: SceneCommand = { kind: 'task', id: id('a2'), way: 'place', items: ['A', 'B'], slots: ['1', '2'], answer: ['A', 'B'] };
const line = (lineId: string, text: string, task: ElementId): StudentWork => ({ way: 'write', id: id(lineId), text, task });

const beat = (seq: number, atMs: number, commands: readonly object[]) => ({ seq, atMs, kind: 'beatPlayed', turnId: 'turn-1', beat: { id: `b${seq}`, script: [...commands, 'Look here now.'], expectsReply: false }, reportedBy: 'browser', wordStartsMs: [0, 100, 200], durationMs: 300, playedWords: 3, firedCueMs: commands.map(() => 0), ending: 'finished', frozen: [] }) as unknown as SessionEvent;

// Plays the work the way the page does, and writes the log the way the agent does, so a replay must land on the same board.
function playAndLog(works: readonly { atMs: number; work: StudentWork }[]) {
  const operations: BoardOperation[] = [setProblem, setTask].map((command) => ({ kind: 'command', atMs: 10, command, overMs: null }));
  const log: SessionEvent[] = [beat(0, 10, [setProblem, setTask])];
  for (const { atMs, work } of works) {
    const checked = checkWorkOnBoard(work, getBoardAt(operations, atMs));
    const action = { action: 'worked', work, ...checked } as const;
    operations.push({ kind: 'worked', atMs, action });
    log.push({ seq: log.length, atMs, kind: 'studentActed', action });
  }
  return { operations, log };
}

describe('a replay of the shared board', () => {
  it('shows the same lines, marks, and task state as the live board, at every moment', () => {
    const { operations, log } = playAndLog([
      { atMs: 1000, work: line('s1', '2x = 14', id('a1')) },
      { atMs: 2000, work: line('s2', '2x = 8', id('a1')) },
      { atMs: 3000, work: line('s3', 'x = 4', id('a1')) },
    ]);
    for (const atMs of [500, 1000, 1100, 2100, 3000, 3300, 9000]) {
      expect(describeBoard(rebuildBoard(log, atMs), atMs)).toEqual(describeBoard(getBoardAt(operations, atMs), atMs));
    }
    expect(describeBoard(rebuildBoard(log, 9000), 9000).elements.filter((element) => element.kind === 'annotate').map((element) => element.id)).toEqual(['s2-checked', 's3-checked']);
  });

  it('keeps what code said at the time, whatever later code would say', () => {
    const { log } = playAndLog([{ atMs: 1000, work: line('s1', '2x = 14', id('a1')) }]);
    const element = rebuildBoard(log, 2000).elements.get(id('s1'));
    expect(element?.content).toMatchObject({ kind: 'studentLine', verdict: { status: 'wrong' }, reading: { kind: 'math' } });
  });

  it('moves a dragged point through its samples at their own moments', () => {
    const drag = { kind: 'task', id: id('a3'), way: 'drag', on: id('steps') } as const;
    const log: SessionEvent[] = [beat(0, 0, [setProblem, drag]), { seq: 1, atMs: 1000, kind: 'studentActed', action: { action: 'worked', work: { way: 'drag', task: id('a3'), x: 2, samples: [{ afterMs: 0, x: 0 }, { afterMs: 100, x: 1 }, { afterMs: 200, x: 2 }] }, verdict: { status: 'unknown' } } }];
    expect(rebuildBoard(log, 1050).elements.get(id('a3'))?.progress?.pointX).toBe(0);
    expect(rebuildBoard(log, 1150).elements.get(id('a3'))?.progress?.pointX).toBe(1);
    expect(rebuildBoard(log, 1250).elements.get(id('a3'))?.progress?.pointX).toBe(2);
  });

  it('closes a task on the work that finishes it, and a new task closes the one before', () => {
    const { log } = playAndLog([{ atMs: 1000, work: line('s1', 'x = 4', id('a1')) }]);
    expect(rebuildBoard(log, 500).elements.get(id('a1'))?.progress?.isOpen).toBe(true);
    expect(rebuildBoard(log, 1500).elements.get(id('a1'))?.progress?.isOpen).toBe(false);
    const next = getBoardAt([{ kind: 'command', atMs: 1, command: setTask, overMs: null }, { kind: 'command', atMs: 2, command: setOrder, overMs: null }], 3);
    expect(next.elements.get(id('a1'))?.progress?.isOpen).toBe(false);
    expect(next.elements.get(id('a2'))?.progress?.isOpen).toBe(true);
  });
});
