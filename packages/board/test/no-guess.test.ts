import { describe, expect, it } from 'vitest';
import type { ElementId, SceneCommand, StudentWork } from '@astra/contracts';
import { type BoardOperation, getBoardAt } from '../src/index.ts';
import { checkStep, checkWorkOnBoard, getLineTex, getNod, readLine } from '../src/shared/index.ts';

const id = (value: string) => value as ElementId;
const write = (commandId: string, tex: string): SceneCommand => ({ kind: 'writeMath', id: id(commandId), tex, claim: 'new' });
const taskOn = (taskId: string, on: string): SceneCommand => ({ kind: 'task', id: id(taskId), way: 'write', on: id(on) });
const askWords = (taskId: string): SceneCommand => ({ kind: 'task', id: id(taskId), way: 'write' });

function makeLesson(...commands: readonly SceneCommand[]) {
  const operations: BoardOperation[] = commands.map((command, index) => ({ kind: 'command', atMs: index, command, overMs: null }));
  let lineNumber = 0;
  let atMs = 100;
  const lesson = {
    do(work: StudentWork) {
      atMs += 10;
      const checked = checkWorkOnBoard(work, getBoardAt(operations, atMs));
      operations.push({ kind: 'worked', atMs, action: { action: 'worked', work, ...checked } });
      return checked;
    },
    type(text: string, task?: string) {
      lineNumber += 1;
      return lesson.do({ way: 'write', id: id(`s${lineNumber}`), text, ...(task ? { task: id(task) } : {}) });
    },
    write(command: SceneCommand) {
      atMs += 10;
      operations.push({ kind: 'command', atMs, command, overMs: null });
    },
  };
  return lesson;
}

const onOpenTask = (typed: string, problem: string) => checkStep({ tex: getLineTex(readLine(typed)) as string, problemTex: getLineTex(readLine(problem)), previousTex: null }).status;

describe('a line with no open task, against a problem that is only a guess', () => {
  it.each(['2x = 14', 'x = 7', 'x = 3', '3x + 1 = 7', '2x = 11 + 3 = 14', 'x + 3 = 6'])('never crosses %s, and tells the tutor it does not follow', (typed) => {
    const { verdict } = makeLesson(write('a', '2x + 3 = 11')).type(typed);
    expect(verdict).toEqual({ status: 'unknown', offProblem: '2x + 3 = 11' });
  });

  it.each(['x = 3 + 4 = 8', '2x + 3 = 11 = 12', '2x = 8 = 4', 'x = 5 = 6', '2x = 11 + 3 = 15'])('still crosses %s, because it breaks arithmetic on its own', (typed) => {
    expect(makeLesson(write('a', '2x + 3 = 11')).type(typed).verdict.status).toBe('wrong');
  });

  it.each(['x = 100/30 = 4', 'x = 2/3 = 0.66'])('reads %s as a rounding, not as broken arithmetic', (typed) => {
    expect(makeLesson(write('a', '30x = 100')).type(typed).verdict.status).toBe('unknown');
  });

  it.each([['x = 4'], ['2x = 8'], ['2x = 11 - 3 = 8']])('still ticks %s on the same proof as before', (typed) => {
    expect(makeLesson(write('a', '2x + 3 = 11')).type(typed).verdict.status).toBe('right');
  });

  it('holds a line under an open words question to the same rule, because that task names no problem', () => {
    const { verdict } = makeLesson(write('a', '2x + 3 = 11'), askWords('q')).type('2x = 14', 'q');
    expect(verdict).toEqual({ status: 'unknown', offProblem: '2x + 3 = 11' });
  });

  it('stays certain under a task that names the line', () => {
    expect(makeLesson(write('a', '2x + 3 = 11'), taskOn('t', 'a')).type('2x = 14', 't').verdict.status).toBe('wrong');
    expect(makeLesson(write('a', '2x + 3 = 11'), taskOn('t', 'a')).type('2x = 11 + 3 = 14', 't').verdict.status).toBe('wrong');
  });

  it('gives no fact about a line of plain numbers, which may be another base', () => {
    expect(makeLesson(write('a', '2x + 3 = 11')).type('1 + 1 = 10').verdict).toEqual({ status: 'unknown' });
  });

  it('reacts at once with a sound that is not a verdict', () => {
    const work: StudentWork = { way: 'write', id: id('s1'), text: '2x = 14' };
    expect(getNod(work, makeLesson(write('a', '2x + 3 = 11')).do(work))).toBe('Hm.');
  });
});

describe('a right answer to a word problem', () => {
  it.each([
    ['x = 33', '3x = 100'],
    ['x = 34', '3x = 100'],
    ['x = 3', '30x = 100'],
    ['x = 4', '30x = 100'],
    ['x = 100/30 = 4', '30x = 100'],
    ['V = 6 V', 'V = 2 * 3'],
    ['V = 6V', 'V = 2 * 3'],
    ['V = 2 * 3 = 6 V', 'V = 2 * 3'],
  ])('reads %s on %s as unknown, under an open task', (typed, problem) => {
    expect(onOpenTask(typed, problem)).toBe('unknown');
  });

  it('reads a line that opens with is as a question', () => {
    expect(makeLesson(write('a', '2x + 3 = 11'), taskOn('t', 'a')).type('is x = 5', 't').verdict.status).toBe('unknown');
    expect(readLine('is x = 5').isAsking).toBe(true);
    expect(readLine('x is 5').isAsking).toBe(false);
  });

  it.each([['x = 5', '30x = 100'], ['x = 2', '30x = 100'], ['x = 35', '3x = 100'], ['x = 5', '2x + 3 = 11']])('still crosses %s on %s, which is no rounding', (typed, problem) => {
    expect(onOpenTask(typed, problem)).toBe('wrong');
  });

  it('never ticks digits that stop being true', () => {
    expect(onOpenTask('pi = 3.1415926530', '1 + 1 = 2')).not.toBe('right');
    expect(checkStep({ tex: getLineTex(readLine('pi = 3.1415926530')) as string, problemTex: null, previousTex: null }).status).toBe('unknown');
  });
});

describe('a problem that has ended', () => {
  it('ends at a right answer, so a line of the student\'s own stands alone', () => {
    const lesson = makeLesson(write('a', '2x + 3 = 11'));
    expect(lesson.type('x = 4').verdict.status).toBe('right');
    expect(lesson.type('x + 3 = 6').verdict).toEqual({ status: 'unknown' });
    expect(lesson.type('x = 3').verdict).toEqual({ status: 'unknown' });
  });

  it('keeps a problem with more than one answer open after the first', () => {
    const lesson = makeLesson(write('a', 'x^2 = 9'));
    expect(lesson.type('x = 3').verdict.status).toBe('unknown');
    expect(lesson.type('x = 5').verdict).toEqual({ status: 'unknown', offProblem: 'x^2 = 9' });
  });

  it('starts again when the tutor writes the next one', () => {
    const lesson = makeLesson(write('a', '2x + 3 = 11'));
    lesson.type('x = 4');
    lesson.write(write('b', '3x = 9'));
    expect(lesson.type('x = 3').verdict.status).toBe('right');
    expect(lesson.type('x = 4').verdict).toEqual({ status: 'unknown' });
  });

  it('ends at a wish to leave with no task open, typed', () => {
    const lesson = makeLesson(write('a', '2x + 3 = 11'));
    lesson.type('teach me physics');
    expect(lesson.type('x = 9').verdict).toEqual({ status: 'unknown' });
    expect(lesson.type('x = 4').verdict).toEqual({ status: 'unknown' });
  });

  it('ends at a wish to leave with no task open, said aloud', () => {
    const lesson = makeLesson(write('a', '2x + 3 = 11'));
    lesson.do({ way: 'leave' });
    expect(lesson.type('x = 9').verdict).toEqual({ status: 'unknown' });
  });

  it('stays open after a question, because a question is not a wish to leave', () => {
    const lesson = makeLesson(write('a', '2x + 3 = 11'));
    lesson.type('why do we take 3 from both sides?');
    expect(lesson.type('x = 4').verdict.status).toBe('right');
  });
});
