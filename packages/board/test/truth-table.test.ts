import { describe, expect, it } from 'vitest';
import { checkClaimedMath, checkStep, getLineTex, isFinishedAnswer, readLine } from '../src/shared/index.ts';
import { FALSE_ROWS, type Row, TRUE_ROWS } from './truth-rows.ts';

function getStatus([problem, typed]: Row) {
  const tex = getLineTex(readLine(typed));
  return tex === null ? 'unknown' : checkStep({ tex, problemTex: problem === null ? null : getLineTex(readLine(problem)), previousTex: null }).status;
}

const describeRow = ([problem, typed]: Row) => `${problem ?? 'no problem'} -> ${typed}`;

describe('the first reviewer\'s truth table', () => {
  it.each(FALSE_ROWS.map((row) => [describeRow(row), row] as const))('gives no tick to %s', (_, row) => {
    expect(getStatus(row)).not.toBe('right');
  });

  it.each(TRUE_ROWS.map((row) => [describeRow(row), row] as const))('gives no cross to %s', (_, row) => {
    expect(getStatus(row)).not.toBe('wrong');
  });
});

describe('a chained line', () => {
  it.each([
    ['2x + 3 = 11', '2x = 11 + 3 = 14', 'wrong'],
    ['2x + 3 = 11', 'x = 14/2 = 7', 'wrong'],
    ['2x + 3 = 11', 'x = 16/2 = 8', 'wrong'],
    ['2x + 3 = 11', '2x + 3 = 11 = 12', 'wrong'],
    ['2x + 3 = 11', 'x = 3 + 4 = 7', 'wrong'],
    ['2x + 3 = 11', 'x = 5 = 5', 'wrong'],
    ['3(x + 2) = 12', 'x = 2 + 2 = 4', 'wrong'],
    ['2x + 3 = 11', '2x = 11 - 3 = 8', 'right'],
    ['2x + 3 = 11', 'x = 8/2 = 4', 'right'],
    ['2x + 3 = 11', 'x = 4 = 4', 'right'],
    ['2(x + 3) = 12', '2x + 6 = 2(x + 3) = 12', 'right'],
    ['2(x + 3) = 12', '2x + 6 = 2(x + 4) = 12', 'unknown'],
    ['x^2 = 9', 'x = 6/2 = 3', 'unknown'],
    ['3x = 2', 'x = 2/3 = 0.66', 'unknown'],
    ['2x + 3 = 11', 'y = 2x = 8', 'unknown'],
  ] as const)('on %s, %s is %s', (problem, typed, status) => {
    expect(getStatus([problem, typed])).toBe(status);
  });

  it('points at the first mistake when it is built on a wrong line', () => {
    expect(checkStep({ tex: 'x=\\frac{14}{2}=7', problemTex: '2x+3=11', previousTex: '2x=14' })).toMatchObject({ status: 'wrong', isBuiltOnWrongLine: true });
  });

  it('finishes the problem when it ends on the answer', () => {
    expect(isFinishedAnswer('x=\\frac{8}{2}=4')).toBe(true);
    expect(isFinishedAnswer('2x=11-3=8')).toBe(false);
  });
});

describe('a rounding', () => {
  it.each(['1/7 = 0.2', 'pi = 3.2', 'sqrt(2) = 1.5', '1/3 = 0.4', '5/3 = 1.6', '7/3 = 2.4', 'sqrt(3) = 1.8', '1/8 = 0.12', '1/3 = 0.34', '1/6 = 0.2', 'sqrt(10) = 3.2'])('gives no tick to %s', (typed) => {
    expect(getStatus([null, typed])).not.toBe('right');
  });

  it.each(['1/3 = 0.33', '1/3 = 0.333', '2/3 = 0.67', '1/8 = 0.13', '1/8 = 0.125', 'pi = 3.14', 'sqrt(2) = 1.41', '5/3 = 1.67'])('ticks %s, which is right to half a unit', (typed) => {
    expect(getStatus([null, typed])).toBe('right');
  });

  it.each([['3x = 2', 'x = 0.66'], ['3x = 1', 'x = 0.34'], ['8x = 1', 'x = 0.12']])('leaves %s to %s to the tutor, because a last digit may be cut short', (problem, typed) => {
    expect(getStatus([problem, typed])).toBe('unknown');
  });

  it('still crosses a rounded answer that is plainly off', () => {
    expect(getStatus(['3x = 1', 'x = 0.2'])).toBe('wrong');
  });
});

describe('the tutor under the same rule', () => {
  it.each([['\\frac{1}{3} = 0.4'], ['\\pi = 3.2'], ['\\sqrt{2} = 1.5'], ['\\frac{5}{3} = 1.6'], ['\\frac{1}{8} = 0.12']])('stops %s', (tex) => {
    expect(checkClaimedMath('new', undefined, tex).status).toBe('wrong');
  });

  it('stops a chained step with a false link, and a rounding off by a last digit', () => {
    expect(checkClaimedMath('step', '2x + 3 = 11', 'x = \\frac{14}{2} = 7').status).toBe('wrong');
    expect(checkClaimedMath('step', '3x = 2', 'x = 0.66').status).toBe('wrong');
  });

  it.each([['\\frac{1}{6} = 0.2'], ['\\sqrt{10} = 3.2'], ['\\pi = 3.1']])('lets a true rounding to one place through, %s', (tex) => {
    expect(checkClaimedMath('new', undefined, tex).status).toBe('unknown');
  });

  it('leaves a value a log of another base could give', () => {
    expect(checkClaimedMath('new', undefined, '\\log 10 = 2.3').status).toBe('unknown');
  });
});

describe('a mixed number', () => {
  it.each([['2x = 7', 'x = 3 1/2'], ['2x = 3', 'x = 1 1/2'], ['4x = 5', 'x = 1 1/4'], ['2x = -7', 'x = -3 1/2'], ['2x = 7', '3 1/2 = x']])('on %s, %s is right', (problem, typed) => {
    expect(getStatus([problem, typed])).toBe('right');
  });

  it('reads a wrong one as wrong, and not as a fraction of joined digits', () => {
    expect(getStatus(['2x = 7', 'x = 3 1/4'])).toBe('wrong');
  });

  it('sets it as a whole and a fraction, and it finishes the problem', () => {
    const tex = getLineTex(readLine('x = 3 1/2'));
    expect(tex).toBe('x=3\\frac{1}{2}');
    expect(isFinishedAnswer(tex as string)).toBe(true);
  });

  it('keeps a product and a plain fraction as they are', () => {
    expect(getLineTex(readLine('x = 3 * 1/2'))).toBe('x=3\\cdot \\frac{1}{2}');
    expect(getLineTex(readLine('x = 31/2'))).toBe('x=\\frac{31}{2}');
    expect(getStatus(['2x = 7', 'x = 7/2'])).toBe('right');
  });
});

describe('a line in words that only looks like math', () => {
  it.each(['A-T and C-G', '2H2O', 'A-T', 'H2O is water', 'I got 2H2O'])('reads %s as words', (typed) => {
    expect(readLine(typed).kind).toBe('words');
  });

  it.each(['x-2 = 0', '2x = 8', 'a-b = 3', '2x2 = 4'])('still reads %s as math', (typed) => {
    expect(readLine(typed).kind).toBe('math');
  });
});
