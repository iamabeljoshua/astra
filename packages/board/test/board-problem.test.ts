import { describe, expect, it } from 'vitest';
import type { ElementId, SceneCommand, StudentWork, Task } from '@astra/contracts';
import { type BoardOperation, getBoardAt } from '../src/index.ts';
import { checkWorkOnBoard } from '../src/shared/index.ts';

const id = (value: string) => value as ElementId;
const problem: SceneCommand = { kind: 'writeMath', id: id('steps'), tex: '2x + 3 = 11', claim: 'new' };
const line = (text: string, task?: string): StudentWork => ({ way: 'write', id: id('s1'), text, ...(task ? { task: id(task) } : {}) });

function getBoard(...commands: readonly SceneCommand[]) {
  const operations: BoardOperation[] = commands.map((command, index) => ({ kind: 'command', atMs: index, command, overMs: null }));
  return getBoardAt(operations, 1000);
}

describe('a line typed before any task has landed', () => {
  it.each([['2x = 14', 'unknown'], ['x = 7', 'unknown'], ['2x = 8', 'right'], ['x = 4', 'right'], ['3x + 1 = 7', 'unknown'], ['2 + 2 = 4', 'right'], ['hello', 'unknown']])('is checked against the problem on the board: %s is %s', (typed, status) => {
    expect(checkWorkOnBoard(line(typed), getBoard(problem)).verdict.status).toBe(status);
  });

  it('points at the first mistake when a line builds on a wrong one under a task', () => {
    const task: SceneCommand = { kind: 'task', id: id('a1'), way: 'write', on: id('steps') };
    const operations: BoardOperation[] = [problem, task].map((command, index) => ({ kind: 'command', atMs: index, command, overMs: null }));
    const first = line('2x = 14', 'a1');
    operations.push({ kind: 'worked', atMs: 10, action: { action: 'worked', work: first, ...checkWorkOnBoard(first, getBoardAt(operations, 10)) } });
    expect(checkWorkOnBoard({ way: 'write', id: id('s2'), text: 'x = 7', task: id('a1') }, getBoardAt(operations, 20)).verdict).toMatchObject({ status: 'wrong', isBuiltOnWrongLine: true });
  });

  it('does not take a line written only to look at for the problem', () => {
    const shown: SceneCommand = { kind: 'writeMath', id: id('oops'), tex: 'x = 9', claim: 'shown' };
    expect(checkWorkOnBoard(line('x = 4'), getBoard(problem, shown)).verdict.status).toBe('right');
    expect(checkWorkOnBoard(line('x = 4'), getBoard(shown)).verdict.status).toBe('unknown');
  });

  it('follows the newest problem', () => {
    const next: SceneCommand = { kind: 'writeMath', id: id('next'), tex: '3x = 9', claim: 'new' };
    expect(checkWorkOnBoard(line('x = 3'), getBoard(problem, next)).verdict.status).toBe('right');
  });

  it('holds no later line to a problem the student has left', () => {
    const task: SceneCommand = { kind: 'task', id: id('a1'), way: 'write', on: id('steps') };
    const operations: BoardOperation[] = [problem, task].map((command, index) => ({ kind: 'command', atMs: index, command, overMs: null }));
    const leaving = line('teach me physics', 'a1');
    operations.push({ kind: 'worked', atMs: 10, action: { action: 'worked', work: leaving, ...checkWorkOnBoard(leaving, getBoardAt(operations, 10)) } });
    expect(checkWorkOnBoard({ way: 'write', id: id('s2'), text: 'x = 7' }, getBoardAt(operations, 20)).verdict.status).toBe('unknown');
  });

  it('holds no line to an old problem once the tutor has written something new', () => {
    const formula: SceneCommand = { kind: 'writeMath', id: id('f'), tex: 'v = u + at', claim: 'new' };
    expect(checkWorkOnBoard(line('x = 7'), getBoard(problem, formula)).verdict.status).toBe('unknown');
  });

  it('checks nothing once the board is cleared', () => {
    expect(checkWorkOnBoard(line('x = 7'), getBoard(problem, { kind: 'clearBoard' })).verdict.status).toBe('unknown');
  });

  it('leaves a line with no problem alone, so base 2 and a new topic stay the tutor to read', () => {
    expect(checkWorkOnBoard(line('1 + 1 = 10'), getBoard()).verdict.status).toBe('unknown');
    expect(checkWorkOnBoard(line('x = 7'), getBoard({ kind: 'writeMath', id: id('f'), tex: 'y = 2x + 3', claim: 'new' })).verdict.status).toBe('unknown');
  });

  it('never closes a task it does not answer', () => {
    const order: Task = { kind: 'task', id: id('a1'), way: 'place', items: ['A', 'B'], slots: ['1', '2'] };
    const checked = checkWorkOnBoard(line('x = 4', 'a1'), getBoard(problem, order));
    expect(checked.verdict.status).toBe('right');
    expect(checked.closesTask).toBeUndefined();
  });
});

describe('a words question left open', () => {
  const asked: Task = { kind: 'task', id: id('a1'), way: 'write', reads: 'words' };

  it('closes on a words answer', () => {
    expect(checkWorkOnBoard(line('because the sides stay equal', 'a1'), getBoard(asked)).closesTask).toBe('a1');
  });

  it('stays open while they only think aloud or ask', () => {
    expect(checkWorkOnBoard(line('hmm', 'a1'), getBoard(asked)).closesTask).toBeUndefined();
    expect(checkWorkOnBoard(line('what do you mean?', 'a1'), getBoard(asked)).closesTask).toBeUndefined();
  });

  it('reads typed math as math, and checks it against the problem', () => {
    const checked = checkWorkOnBoard(line('2x = 14', 'a1'), getBoard(problem, asked));
    expect(checked.reading?.kind).toBe('math');
    expect(checked.verdict).toEqual({ status: 'unknown', offProblem: '2x + 3 = 11' });
    expect(checked.closesTask).toBe('a1');
  });

  it('keeps a task that has a key open until the key is met', () => {
    const keyed: Task = { kind: 'task', id: id('a2'), way: 'write', reads: 'words', accepts: ['1789'] };
    expect(checkWorkOnBoard(line('around then', 'a2'), getBoard(keyed)).closesTask).toBeUndefined();
    expect(checkWorkOnBoard(line('1789', 'a2'), getBoard(keyed)).closesTask).toBe('a2');
  });

  it('keeps a code task open, because code takes many lines', () => {
    const code: Task = { kind: 'task', id: id('a3'), way: 'write', reads: 'code' };
    expect(checkWorkOnBoard(line('print(1)', 'a3'), getBoard(code)).closesTask).toBeUndefined();
  });
});
