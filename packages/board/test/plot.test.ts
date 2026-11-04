import { evaluatePlotExpression, parsePlotExpression, type Plot } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import type { Branch, Point } from '../src/figure/figure-marks.ts';
import { makeSeededRandom } from '../src/ink/ink-stroke.ts';
import { formatNumber, getAutoYRange, getTickValues } from '../src/plot/axis-ticks.ts';
import { createPlotScene, type PlotFrame } from '../src/plot/plot-scene.ts';
import { CURVE_LIMITS, getBranchesUpTo, sampleCurve } from '../src/plot/sample-curve.ts';

type Range = readonly [number, number];

function sample(expression: string, domain: Range, yRange: Range): Branch[] {
  const node = parsePlotExpression(expression);
  if (!node) throw new Error(`could not parse ${expression}`);
  return sampleCurve({ evaluate: (x) => evaluatePlotExpression(node, x), domain, yRange });
}

/** The tallest single step in any drawn line, as a share of the axes' height. A line through an asymptote shows up here. */
function getTallestStep(branches: readonly Branch[], [low, high]: Range): number {
  let tallest = 0;
  for (const branch of branches) for (let index = 1; index < branch.length; index += 1) tallest = Math.max(tallest, Math.abs((branch[index] as Point).y - (branch[index - 1] as Point).y));
  return tallest / (high - low);
}

const NO_FALSE_LINE = 1 / 8;
const crossesX = (branch: Branch, x: number) => (branch[0] as Point).x < x && (branch.at(-1) as Point).x > x;

describe('sampling near discontinuities', () => {
  it('draws no line through the asymptote of 1/x, and reaches the edge of the axes on both sides', () => {
    const branches = sample('1/x', [-5, 5], [-4, 4]);
    expect(branches).toHaveLength(2);
    expect(branches.some((branch) => crossesX(branch, 0))).toBe(false);
    expect(getTallestStep(branches, [-4, 4])).toBeLessThan(NO_FALSE_LINE);
    expect(branches[0]?.at(-1)?.y).toBe(-4);
    expect(branches[1]?.[0]?.y).toBe(4);
    expect(branches[0]?.at(-1)?.x).toBeCloseTo(-0.25, 3);
  });

  it('breaks tan(x) at every asymptote in its domain', () => {
    const branches = sample('tan(x)', [-5, 5], [-5, 5]);
    expect(branches.length).toBeGreaterThanOrEqual(4);
    expect(getTallestStep(branches, [-5, 5])).toBeLessThan(NO_FALSE_LINE);
    for (const pole of [-3 * Math.PI / 2, -Math.PI / 2, Math.PI / 2, 3 * Math.PI / 2]) expect(branches.some((branch) => crossesX(branch, pole))).toBe(false);
  });

  it('breaks a jump where the function has no value between', () => {
    const branches = sample('abs(x-1)/(x-1)', [-3, 3], [-2, 2]);
    expect(branches).toHaveLength(2);
    expect(branches[0]?.at(-1)?.y).toBe(-1);
    expect(branches[1]?.[0]?.y).toBe(1);
    expect((branches[1]?.[0] as Point).x - (branches[0]?.at(-1) as Point).x).toBeLessThan(1e-3);
  });

  it('starts sqrt(x) at its true edge instead of the first grid point', () => {
    const branches = sample('sqrt(x)', [-4, 4], [0, 2]);
    expect(branches).toHaveLength(1);
    expect(branches[0]?.[0]?.x).toBeCloseTo(0, 6);
    expect(branches[0]?.[0]?.y).toBeLessThan(0.01);
  });

  it('leaves at most a pinhole at a removable gap', () => {
    const branches = sample('sin(x)/x', [-10, 10], [-1, 1]);
    expect(branches.length).toBeLessThanOrEqual(2);
    expect(branches[0]?.[0]?.x).toBe(-10);
    expect(branches.at(-1)?.at(-1)?.x).toBe(10);
    for (const [index, branch] of branches.slice(1).entries()) expect((branch[0] as Point).x - ((branches[index] as Branch).at(-1) as Point).x).toBeLessThan(1e-3);
  });

  it('leaves a pinhole where the curve has no value at a sample', () => {
    const branches = sample('sin(x)/x', [0, 10], [-1, 1]);
    expect(branches).toHaveLength(1);
    expect(branches[0]?.[0]?.x).toBeLessThan(1e-3);
  });

  it('connects a steep curve that is really continuous', () => {
    const branches = sample('1000*x', [-5, 5], [-1, 1]);
    expect(branches).toHaveLength(1);
    expect(branches[0]?.[0]).toEqual({ x: expect.closeTo(-0.001, 5), y: -1 });
    expect(branches[0]?.at(-1)).toEqual({ x: expect.closeTo(0.001, 5), y: 1 });
  });

  it('draws nothing for a curve with no value in its domain', () => {
    expect(sample('sqrt(-1-x*x)', [-3, 3], [-1, 1])).toEqual([]);
  });

  it('cuts a curve that leaves the axes and comes back, instead of drawing along the edge', () => {
    const branches = sample('x*x', [-3, 3], [0, 4]);
    expect(branches).toHaveLength(1);
    expect(branches[0]?.[0]).toEqual({ x: expect.closeTo(-2, 3), y: 4 });
    const twice = sample('x*x-3', [-3, 3], [-2, 2]);
    expect(twice).toHaveLength(2);
  });

  it('stays inside its step budget on a curve that never settles, and draws no line from edge to edge of the axes', () => {
    let evaluations = 0;
    const node = parsePlotExpression('tan(3000*x)') as NonNullable<ReturnType<typeof parsePlotExpression>>;
    const branches = sampleCurve({ domain: [-5, 5], yRange: [-1, 1], evaluate: (x) => {
      evaluations += 1;
      return evaluatePlotExpression(node, x);
    } });
    expect(evaluations).toBeLessThanOrEqual(CURVE_LIMITS.evaluations);
    expect(getTallestStep(branches, [-1, 1])).toBeLessThan(1);
  });

  it('never gives a value that is not a finite number to draw', () => {
    for (const expression of ['1/(x-x)', 'ln(0-x*x)', 'exp(exp(exp(x)))', '9^9^9^9^x', 'tan(x)/0', '(0-1)^x']) {
      for (const branch of sample(expression, [-3, 3], [-2, 2])) for (const { x, y } of branch) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
  });

  it('cuts at an x value, so a curve can draw from left to right', () => {
    const branches = sample('x', [0, 10], [0, 10]);
    const upTo = getBranchesUpTo(branches, 2.5);
    expect(upTo[0]?.at(-1)?.x).toBeCloseTo(2.5, 9);
    expect(upTo[0]?.at(-1)?.y).toBeCloseTo(2.5, 9);
    expect(getBranchesUpTo(branches, -1)).toEqual([]);
  });
});

const CONTINUOUS_CURVES: readonly (readonly [string, Range])[] = [
  ['sin(4*x)', [-10, 10]],
  ['sin(10*x)', [-10, 10]],
  ['sin(x)', [-50, 50]],
  ['sin(2*pi*x)', [-10, 10]],
  ['abs(sin(x))', [-20, 20]],
  ['sin(30*x)', [-10, 10]],
  ['5*sin(x)+sin(20*x)', [-10, 10]],
];

function getPlotCurve(expression: string, domain: Range, changes = {}): { curve: readonly Branch[]; yRange: Range } {
  const plot: Plot = { kind: 'plot', id: 'graph' as never, expression, domain: [domain[0], domain[1]], ...(expression.includes('a*') ? { constants: [{ name: 'a', value: 1, min: 1, max: 10 }] } : {}) };
  const frame = createPlotScene(plot, changes)?.getFrame(0) as PlotFrame;
  return { curve: frame.getCurve(frame.yRange), yRange: frame.yRange };
}

const getCoverage = (branches: readonly Branch[], [low, high]: Range) => branches.reduce((sum, branch) => sum + (branch.at(-1) as Point).x - (branch[0] as Point).x, 0) / (high - low);

describe('a continuous curve that needs many samples', () => {
  it.each(CONTINUOUS_CURVES)('keeps %s on %j in one piece from edge to edge', (expression, domain) => {
    const { curve } = getPlotCurve(expression, domain);
    expect(curve).toHaveLength(1);
    expect(getCoverage(curve, domain)).toBeCloseTo(1, 6);
  });

  it.each([1, 3, 4, 5, 7, 10])('keeps sin(a*x) whole with a slider at a = %d', (a) => {
    const { curve } = getPlotCurve('sin(a*x)', [-10, 10], { a });
    expect(curve).toHaveLength(1);
    expect(getCoverage(curve, [-10, 10])).toBeCloseTo(1, 6);
  });

  it.each(CONTINUOUS_CURVES)('keeps every drawn step of %s true to the curve', (expression, domain) => {
    const node = parsePlotExpression(expression) as NonNullable<ReturnType<typeof parsePlotExpression>>;
    const { curve, yRange } = getPlotCurve(expression, domain);
    const pointsOff = curve.flatMap((branch) => branch.slice(1).map((end, index) => {
      const start = branch[index] as Point;
      return Math.abs(evaluatePlotExpression(node, (start.x + end.x) / 2) - (start.y + end.y) / 2);
    }));
    expect(Math.max(...pointsOff) / (yRange[1] - yRange[0])).toBeLessThan(1 / 200);
  });

  it.each(['sin(300*x)', 'sin(1000*x)', 'sin(24*pi*x)'])('draws %s as the band it is, inside the budget, and not as a slower wave', (expression) => {
    let evaluations = 0;
    const node = parsePlotExpression(expression) as NonNullable<ReturnType<typeof parsePlotExpression>>;
    const branches = sampleCurve({ domain: [-10, 10], yRange: [-1, 1], evaluate: (x) => {
      evaluations += 1;
      return evaluatePlotExpression(node, x);
    } });
    const reachedBy = (test: (y: number) => boolean) => branches.some((branch) => branch.some(({ y }) => test(y)));
    expect(evaluations).toBeLessThanOrEqual(CURVE_LIMITS.evaluations);
    expect(getCoverage(branches, [-10, 10])).toBeGreaterThan(0.95);
    expect(reachedBy((y) => y > 0.9) && reachedBy((y) => y < -0.9)).toBe(true);
    expect(branches.reduce((sum, branch) => sum + branch.length, 0)).toBeGreaterThan(CURVE_LIMITS.evaluations / 2);
  });

  it('still breaks at every real break when there are many of them', () => {
    const poles = sample('tan(10*x)', [-10, 10], [-6, 6]);
    const everyPole = Array.from({ length: 64 }, (_, index) => ((index - 31.5) * Math.PI) / 10);
    expect(poles.length).toBeGreaterThanOrEqual(everyPole.length);
    for (const pole of everyPole) expect(poles.some((branch) => crossesX(branch, pole))).toBe(false);
    const jumps = sample('abs(sin(30*x))/sin(30*x)', [-10, 10], [-2, 2]);
    expect(jumps.length).toBeGreaterThanOrEqual(190);
    expect(getTallestStep(jumps, [-2, 2])).toBeLessThan(NO_FALSE_LINE);
  });

  it('breaks at a small jump, and draws no line up it', () => {
    const branches = sample('x+0.1*abs(x-0.3)/(x-0.3)', [-1, 1], [-1.5, 1.5]);
    expect(branches).toHaveLength(2);
    expect((branches[1]?.[0] as Point).y - (branches[0]?.at(-1) as Point).y).toBeGreaterThan(0.19);
  });

  it('connects a curve so steep it crosses the axes between two pixels', () => {
    const branches = sample('10^7*x', [-5, 5], [-1, 1]);
    expect(branches).toHaveLength(1);
    expect(branches[0]?.[0]?.y).toBe(-1);
    expect(branches[0]?.at(-1)?.y).toBe(1);
  });

  it('keeps random continuous curves whole, as long as a pixel can show their wiggles', () => {
    const random = makeSeededRandom('continuous-curves');
    const pick = (low: number, high: number) => low + random() * (high - low);
    for (let round = 0; round < 400; round += 1) {
      const domain: Range = [-pick(1, 20), pick(1, 20)];
      const rate = (pick(0.1, 200) * 2 * Math.PI) / (domain[1] - domain[0]);
      const shapes = [`${pick(0.1, 20)}*sin(${rate}*x)`, `cos(${rate}*x+${pick(0, 5)})`, `abs(sin(${rate}*x))`, `exp(sin(${rate}*x))`, `${pick(0.1, 5)}*x+sin(${rate}*x)`];
      const expression = shapes[round % shapes.length] as string;
      const node = parsePlotExpression(expression) as NonNullable<ReturnType<typeof parsePlotExpression>>;
      const { curve, yRange } = getPlotCurve(expression, domain);
      const isInView = Array.from({ length: 1001 }, (_, index) => evaluatePlotExpression(node, domain[0] + ((domain[1] - domain[0]) * index) / 1000)).every((y) => y >= yRange[0] && y <= yRange[1]);
      if (isInView) expect(curve, expression).toHaveLength(1);
    }
  });

  it('connects a cusp whose side is nearly vertical', () => {
    expect(sample('abs(x)^(1/3)', [-1, 1], [0, 1])).toHaveLength(1);
  });
});

describe('scales', () => {
  it('picks round ticks that land on real values', () => {
    expect(getTickValues([0, 25], 5)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(getTickValues([-1, 1], 4)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(getTickValues([0.1, 0.35], 5)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
    expect(Object.is(getTickValues([-2, 2], 4)[2], 0)).toBe(true);
  });

  it('writes numbers for reading, with a real minus and no negative zero', () => {
    expect(formatNumber(-3)).toBe('−3');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(6.0985)).toBe('6.1');
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(1234567)).toBe('1.2e6');
  });

  it('fits a curve in full, and leaves out the reaches of an asymptote', () => {
    const squares = Array.from({ length: 101 }, (_, index) => ((index - 50) / 10) ** 2);
    expect(getAutoYRange(squares)).toEqual([0, 25]);
    const growth = Array.from({ length: 101 }, (_, index) => Math.exp((index - 50) / 10));
    expect(getAutoYRange(growth)[1]).toBeGreaterThanOrEqual(148);
    const inverse = Array.from({ length: 101 }, (_, index) => 1 / ((index - 50.5) / 10));
    const [low, high] = getAutoYRange(inverse);
    expect(high).toBeLessThan(10);
    expect(low).toBeGreaterThan(-10);
  });

  it('gives a flat line room, and survives having nothing to fit', () => {
    expect(getAutoYRange([3, 3, 3])).toEqual([2, 4]);
    expect(getAutoYRange([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([-1, 1]);
  });
});

describe('a plot as a scene', () => {
  const plot: Plot = { kind: 'plot', id: 'graph' as never, expression: 'a*x^2', constants: [{ name: 'a', value: 1, min: 0.5, max: 3 }], domain: [-2, 2] };
  const frameOf = (changes = {}) => createPlotScene(plot, changes)?.getFrame(0) as PlotFrame;

  it('takes its constants as parameters', () => {
    const first = frameOf();
    const curve = frameOf({ a: 2 }).getCurve(first.yRange);
    expect(curve[0]?.at(-1)?.y).toBeCloseTo(8, 6);
    expect(createPlotScene(plot, { a: 2 })?.values).toEqual({ a: 2 });
  });

  it('keeps the same axes for every value a slider can reach', () => {
    expect(frameOf({ a: 3 }).yRange).toEqual(frameOf().yRange);
    expect(frameOf().yRange[1]).toBeGreaterThanOrEqual(12);
  });

  it('keeps a constant inside its declared range, whatever a message claims', () => {
    expect(createPlotScene(plot, { a: 1e9 })?.values).toEqual({ a: 3 });
    expect(createPlotScene(plot, { a: -1e9 })?.values).toEqual({ a: 0.5 });
  });

  it('ignores a constant the plot does not declare', () => {
    expect(createPlotScene(plot, { b: 7, a: 1 })?.values).toEqual({ a: 1 });
  });

  it('gives no scene for an expression that cannot be read, so the last good board stays', () => {
    expect(createPlotScene({ ...plot, expression: 'process.exit()' }, {})).toBeNull();
    expect(createPlotScene({ ...plot, expression: 'x'.repeat(201) }, {})).toBeNull();
  });

  it('returns the same scene for the same values, so a frame does not sample again', () => {
    expect(createPlotScene(plot, { a: 2 })).toBe(createPlotScene(plot, { a: 2 }));
  });
});
