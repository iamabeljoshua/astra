import { describe, expect, it } from 'vitest';
import { compute, plotValues } from '../src/tutor/tools/compute.ts';
import { parseToolCall } from '../src/tutor/tools/tool-call.ts';

describe('compute, against worked answers', () => {
  it.each([
    ['47 \\times 52', '2444'],
    ['9.8 \\times 2', '19.6'],
    ['0.1 + 0.2', '0.3'],
    ['60 \\times 60 \\times 24 \\times 3', '259200'],
    ['\\frac{1}{2} + \\frac{1}{4}', '0.75'],
    ['(700 / 450)^4', '38416/6561'],
    ['2^{10}', '1024'],
    ['-3 - 4', '-7'],
    ['\\sqrt{144}', '12'],
    ['1000000 \\times 1000000', '1000000000000'],
  ])('%s is %s', (expression, value) => {
    expect(compute({ expression, values: {} })).toMatchObject({ ok: true, value });
  });

  it('gives a fraction with no ending decimal, and about how big it is', () => {
    expect(compute({ expression: '\\frac{1}{3}', values: {} })).toEqual({ ok: true, value: '1/3', about: '0.333333' });
  });

  it('rounds what has no exact form, and says only about that much', () => {
    expect(compute({ expression: '\\sqrt{2}', values: {} })).toEqual({ ok: true, value: '1.41421', about: '1.41421' });
    expect(compute({ expression: '2 \\pi', values: {} })).toEqual({ ok: true, value: '6.28319', about: '6.28319' });
  });

  it.each([
    ['x^2', { x: -3 }, '9'],
    ['-x^2', { x: -3 }, '-9'],
    ['x - y', { x: 1, y: -2 }, '3'],
    ['\\frac{1}{x}', { x: -4 }, '-0.25'],
    ['\\frac{1}{2} m v^2', { m: 2, v: -3 }, '9'],
  ])('reads a negative value as a whole number: %s with %j is %s', (expression, values, value) => {
    expect(compute({ expression, values })).toMatchObject({ ok: true, value });
  });

  it('takes values for letters', () => {
    expect(compute({ expression: '\\frac{1}{2} m v^2', values: { m: 2, v: 3 } })).toMatchObject({ ok: true, value: '9' });
    expect(compute({ expression: 'x^2 + 1', values: { x: -2 } })).toMatchObject({ ok: true, value: '5' });
  });

  it('says what it could not do, and never guesses', () => {
    expect(compute({ expression: 'x^2 + 1', values: {} })).toEqual({ ok: false, problem: 'needs a value for x' });
    expect(compute({ expression: '\\frac{1}{0}', values: {} })).toMatchObject({ ok: false });
    expect(compute({ expression: 'the mass of the sun', values: {} })).toMatchObject({ ok: false });
    expect(compute({ expression: '\\sin 30', values: {} })).toMatchObject({ ok: false });
  });
});

describe('plotValues', () => {
  it('gives evenly spaced points', () => {
    expect(plotValues({ expression: 'x^2 - 2', letter: 'x', from: -2, to: 2, points: 5 })).toEqual({ ok: true, points: [[-2, '2'], [-1, '-1'], [0, '-2'], [1, '-1'], [2, '2']] });
  });

  it('refuses a silly number of points, and a point with no value', () => {
    expect(plotValues({ expression: 'x', letter: 'x', from: 0, to: 1, points: 500 })).toMatchObject({ ok: false });
    expect(plotValues({ expression: '\\frac{1}{x}', letter: 'x', from: -1, to: 1, points: 3 })).toMatchObject({ ok: false, problem: expect.stringContaining('at x = 0') });
  });
});

describe('reading a tool call', () => {
  it('leaves an ordinary board command alone', () => {
    expect(parseToolCall({ kind: 'writeMath', id: 'a', tex: 'x' })).toBeNull();
  });

  it('says what is wrong with a bad call', () => {
    expect(parseToolCall({ tool: 'laser' })).toEqual({ ok: false, problem: 'there is no tool named laser' });
    expect(parseToolCall({ tool: 'compute' })).toMatchObject({ ok: false });
    expect(parseToolCall({ tool: 'plotValues', expression: 'x', letter: 'x', from: 'a', to: 1, points: 2 })).toMatchObject({ ok: false });
  });
});
