import { describe, expect, it } from 'vitest';
import type { ElementId } from '@astra/contracts';
import { checkStep, checkWork, getLineTex, readLine } from '../src/shared/index.ts';
import { FALSE_STEPS, NAMED_STEPS, type StepRow, TRUE_STEPS } from './step-table.ts';

function readTex(typed: string): string | null {
  return getLineTex(readLine(typed));
}

function getVerdict({ problem, previous, typed }: StepRow): 'right' | 'wrong' | 'unknown' {
  return checkWork(
    { way: 'write', id: 's1' as ElementId, text: typed },
    {
      task: problem === null ? null : { kind: 'task', id: 'a1' as ElementId, way: 'write', on: 'problem' as ElementId },
      getLineTex: () => (problem === null ? null : readTex(problem)),
      getCurve: () => null,
      previousTex: previous === undefined ? null : readTex(previous),
      pickedRight: [],
    },
  ).verdict.status;
}

const describeRow = (row: StepRow) => `${row.name}: ${row.problem ?? 'no task'} -> ${row.typed}`;

describe('the step table', () => {
  it.each(TRUE_STEPS.map((row) => [describeRow(row), row] as const))('never calls a true step wrong. %s', (_, row) => {
    expect(getVerdict(row)).not.toBe('wrong');
  });

  it.each(FALSE_STEPS.map((row) => [describeRow(row), row] as const))('never calls a false step right. %s', (_, row) => {
    expect(getVerdict(row)).not.toBe('right');
  });

  it.each(NAMED_STEPS)('on 2x + 3 = 11, %s is %s', (typed, status) => {
    expect(getVerdict({ name: typed, problem: '2x + 3 = 11', typed })).toBe(status);
  });

  it('marks a line built on a wrong line, so the tutor can point at the first mistake', () => {
    const verdict = checkStep({ tex: 'x=7', problemTex: '2x+3=11', previousTex: '2x=14' });
    expect(verdict).toMatchObject({ status: 'wrong', isBuiltOnWrongLine: true });
  });

  it('prints its counts', () => {
    const count = (rows: readonly StepRow[], status: string) => rows.filter((row) => getVerdict(row) === status).length;
    const counts = {
      trueRows: TRUE_STEPS.length, falseAlarms: count(TRUE_STEPS, 'wrong'), trueRight: count(TRUE_STEPS, 'right'), trueUnknown: count(TRUE_STEPS, 'unknown'),
      falseRows: FALSE_STEPS.length, falsePraised: count(FALSE_STEPS, 'right'), falseWrong: count(FALSE_STEPS, 'wrong'), falseUnknown: count(FALSE_STEPS, 'unknown'),
    };
    console.log(JSON.stringify(counts));
    console.log(FALSE_STEPS.filter((row) => getVerdict(row) === 'unknown').map(describeRow).join('\n'));
    expect(counts.falseAlarms).toBe(0);
    expect(counts.falsePraised).toBe(0);
  });
});
