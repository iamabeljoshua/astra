import { describe, expect, it } from 'vitest';
import { evaluatePlotExpression, parsePlotExpression, type PlotNode } from '../src/index.ts';

function parseOrThrow(text: string): PlotNode {
  const node = parsePlotExpression(text);
  if (node === null) throw new Error(`expected ${text} to parse`);
  return node;
}

function evaluate(text: string, x: number): number {
  return evaluatePlotExpression(parseOrThrow(text), x);
}

describe('evaluatePlotExpression', () => {
  it.each<[string, number, number]>([
    ['x', 3, 3],
    ['7', 0, 7],
    ['3.5*x', 2, 7],
    ['.5*x', 4, 2],
    ['1 + 2*3', 0, 7],
    ['(1 + 2)*3', 0, 9],
    ['1 - 2 - 3', 0, -4],
    ['8/4/2', 0, 1],
    ['(x-1)*(x+1)*(x+2)', 2, 12],
    ['sin (x)', 0, 0],
    ['  x  +  1  ', 1, 2],
  ])('reads %s at %d as %d', (text, x, expected) => {
    expect(evaluate(text, x)).toBe(expected);
  });

  it.each<[string, number, number]>([
    ['-x^2', 2, -4],
    ['(-x)^2', 2, 4],
    ['-2^2', 0, -4],
    ['2^3^2', 0, 512],
    ['(2^3)^2', 0, 64],
    ['2^-1', 0, 0.5],
    ['-2^-2', 0, -0.25],
    ['--x', 2, 2],
    ['x - -1', 2, 3],
    ['x * -1', 2, -2],
    ['2*x^2', 3, 18],
  ])('binds ^ tighter than minus and to the right: %s at %d is %d', (text, x, expected) => {
    expect(evaluate(text, x)).toBe(expected);
  });

  it.each<[string, number, number]>([
    ['pi', 0, Math.PI],
    ['e', 0, Math.E],
    ['e^x', 1, Math.E],
    ['pi*x', 2, 2 * Math.PI],
    ['sin(pi/2)', 0, 1],
    ['cos(x)', 0, 1],
    ['tan(x)', 0, 0],
    ['exp(x)', 1, Math.E],
    ['ln(e)', 0, 1],
    ['log(100)', 0, 2],
    ['sqrt(x)', 9, 3],
    ['abs(x)', -4, 4],
    ['sqrt(abs(x))', -4, 2],
    ['cos(x)^2 + sin(x)^2', 1, 1],
  ])('knows the name in %s at %d', (text, x, expected) => {
    expect(evaluate(text, x)).toBeCloseTo(expected, 10);
  });

  it('gives a value that is not finite where the curve has none', () => {
    expect(evaluate('1/x', 0)).toBe(Number.POSITIVE_INFINITY);
    expect(evaluate('sqrt(x)', -1)).toBeNaN();
    expect(evaluate('ln(x)', 0)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('parsePlotExpression', () => {
  it.each(['x**2', 'x***2', '+++', '((((', '(x', 'x)', 'sin(', 'sin(x', 'sin()', '()', ')(', 'x+', '*x', '/x', '^x', 'x^', '^^^', '+x', 'x + +1', '-'])(
    'refuses the broken shape %j',
    (text) => {
      expect(parsePlotExpression(text)).toBeNull();
    },
  );

  it.each(['2x', '2 x', '2(x)', '(x)(x)', '(x)2', 'x(x)', 'x x', '2sin(x)', '1 1', '2 pi', 'pi x', 'e x'])('requires an explicit * in %j', (text) => {
    expect(parsePlotExpression(text)).toBeNull();
  });

  it.each(['1.', '1..2', '.5.5', '.', '1e5', '2e', 'x2', 'xx', 'sinx', 'sin x', 'sin', 'y', 'X', 'Sin(x)', 'PI', '', '   ', 'x\n+1', 'x\t+1', '1,2', ',', 'log(x, 2)', 'sin(x, 2)', 'y = x^2', '2 ** x'])(
    'refuses the wrong words or characters in %j',
    (text) => {
      expect(parsePlotExpression(text)).toBeNull();
    },
  );

  it.each(['eval(x)', 'Function(x)', 'constructor(x)', 'valueOf(x)', 'toString(x)', '__proto__(x)', 'alert(1)', 'process.exit()', 'x.constructor', '`x`', "constructor.constructor('alert(1)')()", 'import(x)', 'require(x)'])(
    'refuses %j, which is not on the function list',
    (text) => {
      expect(parsePlotExpression(text)).toBeNull();
    },
  );

  it.each(['sin', 'cos', 'tan', 'exp', 'ln', 'log', 'sqrt', 'abs'])('accepts the one-argument call %s', (name) => {
    expect(parsePlotExpression(`${name}(x)`)).toEqual({ kind: 'call', name, argument: { kind: 'x' } });
  });

  it('gives a plain tree that survives JSON', () => {
    const node = parseOrThrow('-sin(x)^2 + pi');
    expect(evaluatePlotExpression(JSON.parse(JSON.stringify(node)) as PlotNode, 0)).toBeCloseTo(Math.PI, 10);
  });
});

describe('deep or long plot expressions', () => {
  function nest(open: string, depth: number, close = ')'): string {
    return `${open.repeat(depth)}x${close.repeat(depth)}`;
  }

  it('accepts nesting a person could write', () => {
    expect(evaluate(nest('(', 31), 5)).toBe(5);
  });

  it('refuses nesting one level deeper, though it is short enough to read', () => {
    expect(parsePlotExpression(nest('(', 32))).toBeNull();
  });

  it.each<[string, string]>([
    ['66 open parentheses alone', '('.repeat(66)],
    ['200 open parentheses alone', '('.repeat(200)],
    ['66 nested sqrt', nest('sqrt(', 66)],
    ['33 nested sqrt, under the length limit', nest('sqrt(', 33)],
    ['a long run of minus signs', `${'-'.repeat(199)}x`],
    ['a long tower of powers', `${'2^'.repeat(60)}2`],
  ])('refuses %s without a stack overflow', (_name, text) => {
    expect(parsePlotExpression(text)).toBeNull();
  });

  it('refuses a very long flat chain, so evaluating can never run out of stack', () => {
    expect(parsePlotExpression(`${'1+'.repeat(100_000)}1`)).toBeNull();
    expect(evaluate(`${'1+'.repeat(99)}1`, 0)).toBe(100);
  });
});

describe('named constants', () => {
  const names = new Set(['a', 'slope']);

  it('reads a declared constant and evaluates it from the values given', () => {
    const node = parsePlotExpression('a*x^2 + slope', names);
    expect(node).not.toBeNull();
    expect(evaluatePlotExpression(node as PlotNode, 2, new Map([['a', 3], ['slope', 1]]))).toBe(13);
  });

  it('gives NaN for a constant with no value, so a curve shows a gap and not a wrong number', () => {
    expect(evaluatePlotExpression(parsePlotExpression('a*x', names) as PlotNode, 2)).toBeNaN();
  });

  it('refuses a name no one declared', () => {
    expect(parsePlotExpression('b*x', names)).toBeNull();
  });

  it('keeps the x, functions, and fixed constants their meaning', () => {
    expect(evaluatePlotExpression(parsePlotExpression('sin(pi*x)', new Set(['q'])) as PlotNode, 0.5)).toBeCloseTo(1);
  });
});
