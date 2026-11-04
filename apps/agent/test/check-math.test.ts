import { describe, expect, it } from 'vitest';
import { checkClaimedMath, checkMathLine, checkMathStep } from '../src/tutor/check-math.ts';
import { FALSE_LINES, FALSE_STEPS, REPORTED_FALSE_LINES, REPORTED_FALSE_STEPS, REPORTED_TRUE_LINES, REPORTED_TRUE_STEPS, TRUE_LINES, TRUE_STEPS } from './math-table.ts';

const FEWEST_TRUE_STEPS = 500;
const describeStep = ([before, after]: readonly [string, string]) => `${before}  ->  ${after}`;

describe('what a real lesson got wrong', () => {
  it.each(REPORTED_TRUE_STEPS)('never apologises for %s to %s', (before, after, verdict) => {
    expect(checkMathStep(before, after).status).toBe(verdict);
  });

  it.each(REPORTED_TRUE_LINES)('never calls %s wrong', (tex) => {
    expect(checkMathLine(tex).status).not.toBe('wrong');
  });

  it.each(REPORTED_FALSE_STEPS)('catches %s to %s', (before, after) => {
    expect(checkMathStep(before, after).status).toBe('wrong');
  });

  it.each(REPORTED_FALSE_LINES)('catches %s', (tex) => {
    expect(checkMathLine(tex).status).toBe('wrong');
  });
});

describe('the table of steps from school math', () => {
  it(`holds at least ${FEWEST_TRUE_STEPS} true steps`, () => {
    expect(TRUE_STEPS.length).toBeGreaterThanOrEqual(FEWEST_TRUE_STEPS);
  });

  it('never calls a true step wrong', () => {
    expect(TRUE_STEPS.filter(([before, after]) => checkMathStep(before, after).status === 'wrong').map(describeStep)).toEqual([]);
  });

  it('never calls a true line wrong', () => {
    expect(TRUE_LINES.filter((tex) => checkMathLine(tex).status === 'wrong')).toEqual([]);
  });

  it('calls every false step in it wrong', () => {
    expect(FALSE_STEPS.filter(([before, after]) => checkMathStep(before, after).status !== 'wrong').map(describeStep)).toEqual([]);
  });

  it('calls every false line in it wrong', () => {
    expect(FALSE_LINES.filter((tex) => checkMathLine(tex).status !== 'wrong')).toEqual([]);
  });
});

describe('the tables, read through what a line claims', () => {
  it('still catches every false step that claims to be a step', () => {
    expect(FALSE_STEPS.filter(([before, after]) => checkClaimedMath('step', before, after).status !== 'wrong').map(describeStep)).toEqual([]);
    expect(REPORTED_FALSE_STEPS.filter(([before, after]) => checkClaimedMath('step', before, after).status !== 'wrong').map(describeStep)).toEqual([]);
  });

  it('still catches every false line written as true', () => {
    expect(FALSE_LINES.filter((tex) => checkClaimedMath('new', undefined, tex).status !== 'wrong')).toEqual([]);
    expect(FALSE_LINES.filter((tex) => checkClaimedMath('step', undefined, tex).status !== 'wrong')).toEqual([]);
  });

  it('never calls a true step or a true line wrong when it is claimed truthfully', () => {
    expect(TRUE_STEPS.filter(([before, after]) => checkClaimedMath('step', before, after).status === 'wrong').map(describeStep)).toEqual([]);
    expect(TRUE_LINES.filter((tex) => checkClaimedMath('new', undefined, tex).status === 'wrong')).toEqual([]);
  });

  it.each(['shown', 'relation', undefined] as const)('judges nothing claimed as %s, and that is what the design gives up', (claim) => {
    expect(FALSE_STEPS.filter(([before, after]) => checkClaimedMath(claim, before, after).status === 'wrong')).toEqual([]);
    expect(FALSE_LINES.filter((tex) => checkClaimedMath(claim, undefined, tex).status === 'wrong')).toEqual([]);
  });

  it('gives up a false step claimed as new unless it is plain arithmetic', () => {
    const caught = FALSE_STEPS.filter(([before, after]) => checkClaimedMath('new', before, after).status === 'wrong');
    expect(caught.every(([, after]) => checkMathLine(after).status === 'wrong')).toBe(true);
  });
});

describe('checking a line of math', () => {
  it.each([['2 + 2 = 4'], ['9.8 \\times 2 = 19.6'], ['\\frac{1}{3} = 0.33'], ['\\pi = 3.14'], ['\\sqrt{16} = 4'], ['2^{10} = 1024'], ['3(4 + 1) = 15'], ['\\frac{1}{2} \\cdot 8 = 4'], ['v = 4.2 + 3 = 7.2'], ['3 < 5']])('proves %s', (tex) => {
    expect(checkMathLine(tex).status).toBe('right');
  });

  it.each([['2\\frac{1}{2} = 2.5'], ['\\sin 30 = 0.5'], ['\\cos 60 = 0.5'], ['2x + 3 = 11'], ['g = 9.8'], ['v = u + at'], ['x < 5'], ['\\int_0^1 x dx = \\frac{1}{2}'], ['\\text{speed} = 5'], ['\\frac{d}{dx} x^2 = 2x'], [''], ['7 \\approx 9'], ['\\sqrt{-4} = 2i'], ['0^0 = 1']])('leaves %s unknown', (tex) => {
    expect(checkMathLine(tex).status).toBe('unknown');
  });

  it('says what the line really comes to, so a correction can use it', () => {
    expect(checkMathLine('2 + 2 = 5')).toEqual({ status: 'wrong', why: '2 + 2 is 4, not 5' });
    expect(checkMathLine('\\frac{1}{0} = 5')).toEqual({ status: 'wrong', why: '\\frac{1}{0} is not defined, so it cannot equal 5' });
  });

  it('handles a tower of powers without hanging', () => {
    expect(checkMathLine('9^{9^{9}} = 1').status).toBe('unknown');
    expect(checkMathStep('(a + b + c + d + e + g)^{30}', 'a').status).toBe('unknown');
  });
});

describe('checking a rewrite against the line before it', () => {
  it.each([
    ['2x + 3 = 11', '2x = 11 - 3'],
    ['2x = 11 - 3', '2x = 8'],
    ['2x = 8', 'x = \\frac{8}{2}'],
    ['x = \\frac{8}{2}', 'x = 4'],
    ['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0'],
    ['(x + 1)^2', 'x^2 + 2x + 1'],
    ['v - u = at', 'v = u + at'],
    ['\\frac{x}{2} = 3', 'x = 6'],
    ['v = u + at', 'a = \\frac{v - u}{t}'],
    ['5x = 500', 'x = 100'],
    ['25 = c^2', 'c^2 = 25'],
    ['2 + 3', '5'],
  ])('proves %s to %s', (before, after) => {
    expect(checkMathStep(before, after).status).toBe('right');
  });

  it.each([
    ['2x + 3 = 11', '\\text{so} x = 4'],
    ['2x + 3', '2x + 3 = 11'],
    ['x^2', '4'],
    ['x + y = 5', 'x - y = 1'],
    ['x = 3', 'x^2 = 9'],
    ['x^2 = 2', 'x = 1.41'],
    ['3x = 10', 'x = 3.33'],
    ['47 \\times 52', '50 \\times 50'],
  ])('leaves %s to %s unknown', (before, after) => {
    expect(checkMathStep(before, after).status).toBe('unknown');
  });

  it('says a false step does not follow', () => {
    expect(checkMathStep('5x = 500', 'x = 200')).toEqual({ status: 'wrong', why: 'x = 200 does not follow from 5x = 500' });
  });
});
