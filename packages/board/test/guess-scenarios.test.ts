import { describe, expect, it } from 'vitest';
import type { ElementId, SceneCommand, StudentWork } from '@astra/contracts';
import { type BoardOperation, getBoardAt } from '../src/index.ts';
import { checkStep, checkWorkOnBoard, getLineTex, readLine } from '../src/shared/index.ts';
import { SECOND_TRUTH_ROWS } from './second-truth-rows.ts';

type Step = { line: string; task?: string; want?: 'wrong' } | SceneCommand | { kind: 'writeText'; id: string; text: string } | { kind: 'erase'; target: string };

const M = (id: string, tex: string): Step => ({ kind: 'writeMath', id: id as ElementId, tex, claim: 'new' });
const T = (id: string, extra: object): Step => ({ kind: 'task', id, way: 'write', ...extra }) as Step;
const say = (id: string, text: string): Step => ({ kind: 'writeText', id, text });

const SCENARIOS: readonly (readonly [string, readonly Step[]])[] = [
  ['two problems written, student answers the first', [M('a', '2x + 3 = 11'), M('b', '3x = 9'), { line: 'x = 4', want: 'wrong' }]],
  ['two problems written, student answers the second then first', [M('a', '2x + 3 = 11'), M('b', '3x = 9'), { line: 'x = 3', want: 'wrong' }, { line: 'x = 4', want: 'wrong' }]],
  ['two problems, first task on the first, closed by right answer, then second is answered', [M('a', '2x + 3 = 11'), M('b', '3x = 9'), T('t1', { on: 'a' }), { line: 'x = 4', task: 't1', want: 'wrong' }, { line: 'x = 3', want: 'wrong' }]],
  ['two problems, task on the second, closed, then first answered', [M('a', '2x + 3 = 11'), M('b', '3x = 9'), T('t1', { on: 'b' }), { line: 'x = 3', task: 't1', want: 'wrong' }, { line: 'x = 4', want: 'wrong' }]],
  ['tutor simpler example then back to the student problem', [M('a', '2x + 3 = 11'), M('ex', 'x + 3 = 5'), M('ex2', 'x = 2'), { line: 'x = 4', want: 'wrong' }]],
  ['tutor simpler example then steps on the real problem', [M('a', '2x + 3 = 11'), M('ex', 'x + 3 = 5'), M('ex2', 'x = 2'), { line: '2x = 8', want: 'wrong' }, { line: 'x = 4', want: 'wrong' }]],
  ['tutor example left, student solves the example problem wrongly (ok to cross)', [M('ex', 'x + 3 = 5'), { line: 'x = 3' }]],
  ['tutor example with task on original still open', [M('a', '2x + 3 = 11'), T('t1', { on: 'a' }), M('ex', 'x + 3 = 5'), { line: 'x = 4', task: 't1', want: 'wrong' }]],
  ['solved, then a spoken follow-up with no new line', [M('a', '2x + 3 = 11'), T('t1', { on: 'a' }), { line: 'x = 4', task: 't1' }, { line: 'x = 5', want: 'wrong' }]],
  ['solved, new task with no on line (spoken problem)', [M('a', '2x + 3 = 11'), T('t1', { on: 'a' }), { line: 'x = 4', task: 't1' }, T('t2', {}), { line: 'x = 5', task: 't2', want: 'wrong' }]],
  ['solved, words task about something else, numeric answer', [M('a', '2x + 3 = 11'), T('t1', { on: 'a' }), { line: 'x = 4', task: 't1' }, T('t2', { reads: 'words' }), { line: 'x = 9', task: 't2', want: 'wrong' }]],
  ['student writes own problem then solves it', [M('a', '2x + 3 = 11'), { line: 'x + 3 = 6' }, { line: 'x = 3', want: 'wrong' }]],
  ['student asks own problem in words then solves it', [M('a', '2x + 3 = 11'), { line: 'what about 3x = 9?' }, { line: 'x = 3', want: 'wrong' }]],
  ['topic switch by a plain question, tutor explains in words, then a new spoken problem', [M('a', '2x + 3 = 11'), { line: 'what is photosynthesis?' }, say('w', 'Plants turn light into sugar.'), { line: 'x = 9', want: 'wrong' }]],
  ['topic switch by teach me (hasLeft)', [M('a', '2x + 3 = 11'), T('t1', { on: 'a' }), { line: 'teach me physics', task: 't1' }, { line: 'x = 9', want: 'wrong' }]],
  ['topic switch by teach me with no task open', [M('a', '2x + 3 = 11'), { line: 'teach me physics' }, { line: 'x = 9', want: 'wrong' }]],
  ['topic switch by go back to my problem with no task', [M('a', '2x + 3 = 11'), M('b', '3x = 9'), { line: 'go back to my problem' }, { line: 'x = 4', want: 'wrong' }]],
  ['topic switch by go back to my problem under a task on b', [M('a', '2x + 3 = 11'), M('b', '3x = 9'), T('t', { on: 'b' }), { line: 'go back to my problem', task: 't' }, { line: 'x = 4', want: 'wrong' }]],
  ['new subject writes a text and a plot, old problem stays', [M('a', '2x + 3 = 11'), say('w', 'Now forces.'), { line: 'F = 6' }, { line: 'x = 2', want: 'wrong' }]],
  ['physics: V = 2 * 3 then the answer with its unit', [M('a', 'V = 2 \\cdot 3'), { line: 'V = 6 V', want: 'wrong' }]],
  ['physics: V = 12 / 3 then the answer with its unit', [M('a', 'V = \\frac{12}{3}'), { line: 'V = 4 V', want: 'wrong' }]],
  ['physics: V = IR, given values then V = 6 V', [M('f', 'V = IR'), M('a', 'V = 2 \\cdot 3'), { line: 'V = 6V', want: 'wrong' }]],
  ['physics: m = 3 + 2 metres', [M('a', 'm = 3 + 2'), { line: 'm = 5 m', want: 'wrong' }]],
  ['givens one letter, then asked for a change', [M('a', 'x = 3'), { line: 'x = 6', want: 'wrong' }]],
  ['given t = 2, student answers d', [M('f', 'd = 60t'), M('a', 't = 2'), { line: 'd = 120', want: 'wrong' }, { line: 't = 2', want: 'wrong' }]],
  ['sequence: tutor writes a_1 then a_2', [M('a', 'n = 1'), { line: 'n = 2', want: 'wrong' }]],
  ['loop or table: tutor x = 1, student x = 2 next value', [M('a', 'x = 1'), M('b', 'y = 2x + 1'), { line: 'x = 2', want: 'wrong' }]],
  ['a word problem bus', [M('a', '30x = 100'), { line: 'x = 3.33' }, { line: 'x = 4', want: 'wrong' }]],
  ['tutor writes an inequality', [M('a', '2x + 3 > 11'), { line: 'x > 4', want: 'wrong' }, { line: 'x = 5', want: 'wrong' }]],
  ['tutor writes wrong example without shown', [M('a', '2x + 3 = 11'), M('oops', '2x = 14'), { line: '2x = 8', want: 'wrong' }, { line: 'x = 4', want: 'wrong' }]],
  ['tutor writes a check of the answer', [M('a', '2x + 3 = 11'), M('chk', '2(4) + 3 = 11'), { line: 'x = 4', want: 'wrong' }]],
  ['tutor writes an identity with one letter', [M('a', '2x + 3 = 11'), M('id', 'x + x = 2x'), { line: 'x = 4', want: 'wrong' }]],
  ['tutor writes a different letter equation after', [M('a', '2x + 3 = 11'), M('b', '2y = 6'), { line: 'x = 4', want: 'wrong' }]],
  ['tutor transforms the problem', [M('a', '2x + 3 = 11'), { kind: 'transformMath', target: 'a' as ElementId, tex: '3x + 3 = 12' }, { line: 'x = 3', want: 'wrong' }, { line: 'x = 4' }]],
  ['tutor erases the problem', [M('a', '2x + 3 = 11'), { kind: 'erase', target: 'a' }, { line: 'x = 7', want: 'wrong' }]],
];

function play(steps: readonly Step[]): string[] {
  const operations = [] as unknown as BoardOperation[];
  const falseVerdicts: string[] = [];
  let atMs = 0;
  let lineNumber = 0;
  for (const step of steps) {
    atMs += 10;
    if (!('line' in step)) {
      (operations as unknown as object[]).push({ kind: 'command', atMs, command: step, overMs: null });
      continue;
    }
    lineNumber += 1;
    const work: StudentWork = { way: 'write', id: `s${lineNumber}` as ElementId, text: step.line, ...(step.task ? { task: step.task as ElementId } : {}) };
    const checked = checkWorkOnBoard(work, getBoardAt(operations, atMs));
    operations.push({ kind: 'worked', atMs, action: { action: 'worked', work, ...checked } });
    if (step.want === checked.verdict.status) falseVerdicts.push(`${step.line} read as ${checked.verdict.status}`);
  }
  return falseVerdicts;
}

describe('the second reviewer\'s scenarios, where the tutor\'s latest equation is not what the student is solving', () => {
  it.each(SCENARIOS)('%s', (_name, steps) => {
    expect(play(steps)).toEqual([]);
  });
});

describe('the second reviewer\'s table', () => {
  const readRow = ([problem, typed]: readonly [string | null, string, ...unknown[]]) => {
    const reading = readLine(typed);
    const tex = getLineTex(reading);
    if (tex === null || reading.isAsking) return 'unknown';
    return checkStep({ tex, problemTex: problem === null ? null : getLineTex(readLine(problem)), previousTex: null }).status;
  };

  it('has 459 rows', () => {
    expect(SECOND_TRUTH_ROWS).toHaveLength(459);
  });

  it('crosses no true row', () => {
    expect(SECOND_TRUTH_ROWS.filter((row) => row[2] === 'T' && readRow(row) === 'wrong').map((row) => `${row[0]} | ${row[1]}`)).toEqual([]);
  });

  it('ticks no false row', () => {
    expect(SECOND_TRUTH_ROWS.filter((row) => row[2] === 'F' && readRow(row) === 'right').map((row) => `${row[0]} | ${row[1]}`)).toEqual([]);
  });

});
