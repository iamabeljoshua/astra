import { describe, expect, it } from 'vitest';
import { type Box, doBoxesOverlap, type FigureMark, getLeadingShare, clipBranch } from '../src/figure/figure-marks.ts';
import { createEqualView, createFreeView } from '../src/figure/figure-view.ts';
import type { FigureFrame, FigureWords } from '../src/figure/figure-input.ts';
import { getFigureMarks } from '../src/figure/get-figure-marks.ts';
import { estimateTextWidth, LABEL_FONT, placeLabels, wrapLabel } from '../src/figure/place-labels.ts';
import { getBoardAt } from '../src/player/board-state.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';

const QUANTITY = { label: 'Q', unit: 'u' };
const WORDS: FigureWords = {
  metres: 'm',
  degrees: '°',
  readouts: { time: QUANTITY, height: { label: 'Height', unit: 'm' }, distance: QUANTITY, speed: QUANTITY, 'velocity-x': QUANTITY, 'velocity-y': QUANTITY, 'peak-height': QUANTITY, 'landing-distance': QUANTITY },
  parameters: { horizontalSpeed: QUANTITY, upwardSpeed: QUANTITY, releaseHeight: QUANTITY, gravity: QUANTITY, launchAngle: QUANTITY, launchSpeed: QUANTITY },
};

const SIZES = [{ width: 712, height: 512 }, { width: 326, height: 235 }];
const LATE_MS = 60_000;

const place = (command: object, atMs = 0): BoardOperation => ({ kind: 'command', atMs, overMs: null, command: command as never });

function getMarks(operations: BoardOperation[], rootId: string, { width, height }: { width: number; height: number } = SIZES[0] as never, atMs = LATE_MS, isReducedMotion = false): FigureMark[] {
  const board = getBoardAt(operations, atMs);
  return getFigureMarks({ board, element: board.elements.get(rootId as never) as FigureFrame['element'], atMs, width, height, isReducedMotion, words: WORDS });
}

const getText = (marks: readonly FigureMark[]) => marks.filter((mark): mark is FigureMark & { kind: 'text' } => mark.kind === 'text');

function getTextBox(mark: FigureMark & { kind: 'text' }): Box {
  const width = Math.max(...mark.lines.map(estimateTextWidth));
  const left = mark.anchor === 'middle' ? mark.at.x - width / 2 : mark.at.x;
  const top = mark.at.y - LABEL_FONT.ascent;
  return { left, top, right: left + width, bottom: top + mark.lines.length * LABEL_FONT.lineHeight };
}

function getOverlappingText(marks: readonly FigureMark[]): string[] {
  const boxes = getText(marks).map((mark) => ({ key: mark.key, box: getTextBox(mark) }));
  return boxes.flatMap((first, index) => boxes.slice(index + 1).filter((second) => doBoxesOverlap(first.box, second.box)).map((second) => `${first.key} on ${second.key}`));
}

function getTextOutside(marks: readonly FigureMark[], { width, height }: { width: number; height: number }): string[] {
  return getText(marks).filter((mark) => {
    const box = getTextBox(mark);
    return box.left < -0.5 || box.top < -0.5 || box.right > width + 0.5 || box.bottom > height + 0.5;
  }).map((mark) => mark.key);
}

const getAllNumbers = (marks: readonly FigureMark[]) => JSON.stringify(marks).match(/-?\d+\.?\d*e?-?\d*|null|NaN/g) ?? [];

const BUSY_PLOT = { kind: 'plot', id: 'busy', expression: 'sin(x)', domain: [-5, 5], label: 'a label that is rather long for a small figure', xLabel: 'the horizontal axis', yLabel: 'the vertical axis' };
const crowdedMarks = Array.from({ length: 8 }, (_, index) => place({ kind: 'markValue', id: `m${index}`, target: 'busy', at: index % 2 === 0 ? 0 : 0.1, label: `mark number ${index} here` }));

describe('text on a figure', () => {
  for (const size of SIZES) {
    it(`never sits on other text at ${size.width} wide, with a crowd of labels`, () => {
      const marks = getMarks([place(BUSY_PLOT), ...crowdedMarks], 'busy', size);
      expect(getOverlappingText(marks)).toEqual([]);
      expect(getTextOutside(marks, size)).toEqual([]);
    });

    it(`keeps the labels of a free body clear at ${size.width} wide`, () => {
      const forces = [[-90, 'weight'], [90, 'normal force'], [0, 'your push'], [180, 'friction'], [45, 'the wind'], [135, 'a long rope pulling']] as const;
      const operations = [place({ kind: 'geometry', id: 'body', xRange: [0, 10], yRange: [0, 6] }), place({ kind: 'construct', id: 'block', target: 'body', step: { shape: 'point', name: 'block', x: 5, y: 3 } }), ...forces.map(([angleDegrees, label], index) => place({ kind: 'vector', id: `f${index}`, on: 'body.block', angleDegrees, length: 'long', label }))];
      const marks = getMarks(operations, 'body', size);
      expect(getOverlappingText(marks)).toEqual([]);
      expect(getText(marks).map((mark) => mark.lines.join(' '))).toEqual(expect.arrayContaining(['weight', 'friction', 'your push', 'the wind']));
    });
  }

  it('keeps moving labels clear on every step of a flight', () => {
    const operations = [
      place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } } }),
      place({ kind: 'trackVector', id: 'a', target: 'shot', quantity: 'velocity-x', label: 'sideways speed' }),
      place({ kind: 'trackVector', id: 'b', target: 'shot', quantity: 'velocity-y', label: 'upward speed' }),
      place({ kind: 'trackVector', id: 'c', target: 'shot', quantity: 'acceleration', label: 'gravity' }),
      place({ kind: 'readout', id: 'h', target: 'shot', quantity: 'height' }),
      place({ kind: 'runSimulation', target: 'shot', action: 'play' }, 1000),
    ];
    for (const size of SIZES) {
      for (let atMs = 1000; atMs < 2600; atMs += 40) {
        const marks = getMarks(operations, 'shot', size, atMs);
        expect(getOverlappingText(marks), `at ${atMs}`).toEqual([]);
        expect(getTextOutside(marks, size), `at ${atMs}`).toEqual([]);
      }
    }
  });

  it('wraps a long word and caps the lines, instead of running off the figure', () => {
    const lines = wrapLabel('w'.repeat(80), 200);
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map(estimateTextWidth))).toBeLessThanOrEqual(200);
  });

  it('gives a name a free spot when the room near it is taken, and drops only a tick', () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 100 };
    const solid = [{ left: 80, top: 30, right: 120, bottom: 70 }];
    const named = { key: 'name', text: 'a name', anchor: { x: 100, y: 50 }, gap: 0, sides: ['right'] as const, tone: 'ink' as const, isFixed: true };
    const tick = { ...named, key: 'tick', text: '12', isOptional: true };
    const placed = placeLabels([named, tick], { bounds, solid, soft: [] });
    expect(placed.map((mark) => mark.key)).toEqual(['name']);
  });

  it('holds text as text, so markup in a label is never built', () => {
    const marks = getMarks([place({ ...BUSY_PLOT, label: '<img src=x onerror="alert(1)">' })], 'busy');
    expect(getText(marks).find((mark) => mark.key === 'label-busy')?.lines.join(' ')).toContain('<img');
  });
});

describe('scales', () => {
  it('fills the figure on a free view, with up as up', () => {
    const view = createFreeView({ xRange: [0, 10], yRange: [0, 5], rect: { left: 0, top: 0, right: 100, bottom: 50 } });
    expect(view.toPixel({ x: 10, y: 5 })).toEqual({ x: 100, y: 0 });
    expect(view.toPixel({ x: 0, y: 0 })).toEqual({ x: 0, y: 50 });
  });

  it('keeps one unit the same length both ways on an equal view', () => {
    const view = createEqualView({ xRange: [0, 4], yRange: [0, 4], rect: { left: 0, top: 0, right: 200, bottom: 100 } });
    const origin = view.toPixel({ x: 0, y: 0 });
    const right = view.toPixel({ x: 1, y: 0 });
    const up = view.toPixel({ x: 0, y: 1 });
    expect(right.x - origin.x).toBeCloseTo(origin.y - up.y, 9);
    expect(view.xRange[0]).toBeLessThan(0);
  });

  it('marks ticks where their numbers say', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'p', expression: 'x', domain: [0, 10], yRange: [0, 10] })], 'p');
    const atFour = getText(marks).find((mark) => mark.key === 'tick-x-4');
    const atEight = getText(marks).find((mark) => mark.key === 'tick-x-8');
    const atZero = getText(marks).find((mark) => mark.key === 'tick-x-2');
    expect((atEight?.at.x as number) - (atFour?.at.x as number)).toBeCloseTo(2 * ((atFour?.at.x as number) - (atZero?.at.x as number)), 6);
  });

  it('gives each tick its own number on a narrow range', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'p', expression: 'x', domain: [0.9, 1], yRange: [0.98, 1] })], 'p');
    const tickText = getText(marks).filter((mark) => mark.key.startsWith('tick-y')).map((mark) => mark.lines[0]);
    expect(new Set(tickText).size).toBe(tickText.length);
  });

  it('draws a geometry angle from the true coordinates', () => {
    const operations = [
      place({ kind: 'geometry', id: 'g', xRange: [0, 6], yRange: [0, 5] }),
      ...[['a', 'A', 1, 1], ['b', 'B', 5, 1], ['c', 'C', 1, 4]].map(([id, name, x, y]) => place({ kind: 'construct', id, target: 'g', step: { shape: 'point', name, x, y } })),
      place({ kind: 'construct', id: 'at-a', target: 'g', step: { shape: 'angle', at: 'A', from: 'B', to: 'C' } }),
      place({ kind: 'construct', id: 'at-b', target: 'g', step: { shape: 'angle', at: 'B', from: 'C', to: 'A' } }),
    ];
    const text = getText(getMarks(operations, 'g')).flatMap((mark) => mark.lines);
    expect(text).toContain('90°');
    expect(text).toContain('36.9°');
  });

  it('skips steps that name points that do not exist', () => {
    const operations = [place({ kind: 'geometry', id: 'g', xRange: [0, 6], yRange: [0, 5] }), place({ kind: 'construct', id: 's', target: 'g', step: { shape: 'segment', from: 'no', to: 'where' } }), place({ kind: 'construct', id: 'c', target: 'g', step: { shape: 'circle', center: 'no', through: 'where' } }), place({ kind: 'construct', id: 'a', target: 'g', step: { shape: 'angle', at: 'no', from: 'no', to: 'no' } })];
    expect(getMarks(operations, 'g')).toEqual([]);
  });

  it('cuts a side that leaves the figure, and draws nothing false along the edge', () => {
    const branches = clipBranch([{ x: 50, y: 50 }, { x: 500, y: 500 }], { left: 0, top: 0, right: 100, bottom: 100 });
    expect(branches).toEqual([[{ x: 50, y: 50 }, { x: 100, y: 100 }]]);
    expect(clipBranch([{ x: -50, y: 50 }, { x: -10, y: 500 }], { left: 0, top: 0, right: 100, bottom: 100 })).toEqual([]);
  });

  it('draws a stroke by its length, around its bends', () => {
    const half = getLeadingShare([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0.75);
    expect(half.at(-1)).toEqual({ x: 10, y: 5 });
    expect(getLeadingShare([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0)).toEqual([]);
  });
});

describe('a plot on the board', () => {
  const curve = { kind: 'plot', id: 'graph', expression: 'x^2', domain: [-2, 2], startsEmpty: true };

  it('draws only what has been revealed, from the left', () => {
    const operations: BoardOperation[] = [place(curve), { kind: 'command', atMs: 1000, overMs: 1000, command: { kind: 'reveal', target: 'graph' as never, upTo: 2 } }];
    const getDrawn = (atMs: number) => {
      const path = getMarks(operations, 'graph', undefined, atMs).find((mark) => mark.key === 'curve-graph') as FigureMark & { kind: 'path' };
      return path.branches.flat().at(-1)?.x;
    };
    expect(getDrawn(500)).toBeUndefined();
    const halfWay = getDrawn(1500) as number;
    const whole = getDrawn(2500) as number;
    expect(halfWay).toBeLessThan(whole);
    expect(halfWay).toBeCloseTo(42 + (whole - 42) * 0.5, 0);
  });

  it('shows everything at once with reduced motion', () => {
    const operations: BoardOperation[] = [place(curve), { kind: 'command', atMs: 1000, overMs: 1000, command: { kind: 'reveal', target: 'graph' as never, upTo: 2 } }];
    const full = getMarks(operations, 'graph', undefined, 3000).find((mark) => mark.key === 'curve-graph');
    const reduced = getMarks(operations, 'graph', undefined, 1001, true).find((mark) => mark.key === 'curve-graph');
    expect(reduced).toEqual(full);
  });

  it('has no number that is not finite in any mark, on any curve', () => {
    for (const expression of ['1/x', 'tan(x)', 'ln(x)', 'sqrt(x)', '1/(x-x)', 'exp(exp(x))']) {
      const marks = getMarks([place({ kind: 'plot', id: 'p', expression, domain: [-5, 5], label: 'curve' }), place({ kind: 'markValue', id: 'm', target: 'p', at: 0 }), place({ kind: 'shadeArea', id: 's', target: 'p', from: -1, to: 1, label: 'shade' })], 'p');
      expect(getAllNumbers(marks).filter((text) => text === 'null' || text === 'NaN'), expression).toEqual([]);
    }
  });

  it('gives no mark for a value the curve does not have', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'p', expression: '1/x', domain: [-5, 5], yRange: [-4, 4] }), place({ kind: 'markValue', id: 'm', target: 'p', at: 0, label: 'nothing here' })], 'p');
    expect(marks.find((mark) => mark.key === 'mark-m')).toBeUndefined();
  });

  it('marks a computed value at its computed place, and says the value itself', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'p', expression: 'x^2', domain: [0, 4], yRange: [0, 16] }), place({ kind: 'markValue', id: 'm', target: 'p', at: 3, label: 'here' })], 'p');
    expect(getText(marks).find((mark) => mark.key === 'label-m')?.lines.join(' ')).toBe('here (3, 9)');
  });

  it('does not shade across a pole', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'p', expression: '1/x', domain: [-5, 5], yRange: [-4, 4] }), place({ kind: 'shadeArea', id: 's', target: 'p', from: -1, to: 1 })], 'p');
    const shade = marks.find((mark) => mark.kind === 'area') as FigureMark & { kind: 'area' };
    expect(shade.polygons).toHaveLength(2);
  });

  it('draws the second curve on the first one\'s axes', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'first', expression: 'x', domain: [0, 4] }), place({ kind: 'plot', id: 'second', over: 'first', expression: 'x/2', domain: [0, 4] })], 'first');
    expect(marks.find((mark) => mark.key === 'curve-second')).toBeDefined();
  });
});

describe('a number line', () => {
  const line = place({ kind: 'numberLine', id: 'line', domain: [-5, 5] });

  it('puts a mark at its true place and ignores one off the line', () => {
    const size = SIZES[0] as { width: number; height: number };
    const marks = getMarks([line, place({ kind: 'markValue', id: 'zero', target: 'line', at: 0 }), place({ kind: 'markValue', id: 'far', target: 'line', at: 50 })], 'line', { ...size, height: 74 });
    const zero = marks.find((mark) => mark.key === 'mark-zero') as FigureMark & { kind: 'dot' };
    expect(zero.at.x).toBeCloseTo(size.width / 2, 6);
    expect(marks.find((mark) => mark.key === 'mark-far')).toBeUndefined();
  });

  it('keeps marks that sit close together readable', () => {
    const size = { width: 326, height: 74 };
    const marks = getMarks([line, ...[-0.1, 0, 0.1].map((at, index) => place({ kind: 'markValue', id: `v${index}`, target: 'line', at, label: `value ${index}` }))], 'line', size);
    expect(getOverlappingText(marks)).toEqual([]);
  });
});

describe('a simulation on the board', () => {
  const parameters = { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 };
  const shot = place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters } });

  it('keeps metres the same length up and across', () => {
    const marks = getText(getMarks([shot], 'shot'));
    const x1 = marks.find((mark) => mark.key === 'tick-x-2')?.at.x as number;
    const x2 = marks.find((mark) => mark.key === 'tick-x-4')?.at.x as number;
    const y1 = marks.find((mark) => mark.key === 'tick-y-1')?.at.y as number;
    const y2 = marks.find((mark) => mark.key === 'tick-y-3')?.at.y as number;
    expect(x2 - x1).toBeCloseTo(y1 - y2, 3);
  });

  it('holds its scale while a student drags, because the slider reserved the room', () => {
    const slider = place({ kind: 'slider', id: 'speed', target: 'shot', parameter: 'horizontalSpeed', min: 0, max: 12 });
    const tickOfTwo = (value: number) => {
      const drag: BoardOperation = { kind: 'parameterSample', atMs: 2000, target: 'shot' as never, parameter: 'horizontalSpeed', value };
      return getText(getMarks([shot, slider, drag], 'shot')).find((mark) => mark.key === 'tick-x-4')?.at.x;
    };
    expect(tickOfTwo(1)).toBe(tickOfTwo(12));
  });

  it('shows the arrow for upward speed shrink, vanish at the peak, and flip', () => {
    const operations = [shot, place({ kind: 'trackVector', id: 'up', target: 'shot', quantity: 'velocity-y' }), place({ kind: 'runSimulation', target: 'shot', action: 'play' }, 1000)];
    const getTip = (atMs: number) => {
      const marks = getMarks(operations, 'shot', undefined, atMs);
      const arrow = marks.find((mark) => mark.key === 'tracked-up') as FigureMark & { kind: 'path' };
      const ball = marks.find((mark) => mark.key === 'ball') as FigureMark & { kind: 'dot' };
      return arrow.branches[0] ? (arrow.branches[0][1]?.y as number) - ball.at.y : 0;
    };
    const atStart = getTip(1001);
    const later = getTip(1300);
    const atPeak = getTip(1000 + (6 / 9.8) * 1000);
    const falling = getTip(1900);
    expect(atStart).toBeLessThan(later);
    expect(later).toBeLessThan(0);
    expect(Math.abs(atPeak)).toBeLessThan(1);
    expect(falling).toBeGreaterThan(0);
  });

  it('keeps the sideways arrow one length through the whole flight', () => {
    const operations = [shot, place({ kind: 'trackVector', id: 'side', target: 'shot', quantity: 'velocity-x' }), place({ kind: 'runSimulation', target: 'shot', action: 'play' }, 1000)];
    const lengths = [1100, 1500, 2000].map((atMs) => {
      const arrow = getMarks(operations, 'shot', undefined, atMs).find((mark) => mark.key === 'tracked-side') as FigureMark & { kind: 'path' };
      return (arrow.branches[0]?.[1]?.x as number) - (arrow.branches[0]?.[0]?.x as number);
    });
    expect(lengths[1]).toBeCloseTo(lengths[0] as number, 6);
    expect(lengths[2]).toBeCloseTo(lengths[0] as number, 6);
  });

  it('pins a mark where the ball was, and lets a vector go on following', () => {
    const operations = [shot, place({ kind: 'runSimulation', target: 'shot', action: 'play' }, 0), place({ kind: 'annotate', id: 'there', target: 'shot.ball', mark: 'circle' }, 500), place({ kind: 'vector', id: 'push', on: 'shot.ball', angleDegrees: 0, length: 'short' }, 500)];
    const getFirstPoint = (key: string, atMs: number) => (getMarks(operations, 'shot', undefined, atMs).find((mark) => mark.key === key) as FigureMark & { kind: 'path' }).branches[0]?.[0];
    expect(getFirstPoint('note-there', 1000)).toEqual(getFirstPoint('note-there', 1500));
    expect(getFirstPoint('vector-push', 1000)).not.toEqual(getFirstPoint('vector-push', 1500));
  });

  it('reads a number from the motion', () => {
    const operations = [shot, place({ kind: 'readout', id: 'h', target: 'shot', quantity: 'height' })];
    const text = getText(getMarks(operations, 'shot')).find((mark) => mark.key === 'readout-h')?.lines.join(' ');
    expect(text).toBe('Height 2 m');
  });
});

describe('how much a model can put on one figure', () => {
  const countOf = (marks: readonly FigureMark[]) => marks.length;

  it('keeps the newest marks when a plot is given far too many, and stays clear', () => {
    const many = Array.from({ length: 400 }, (_, index) => place({ kind: 'markValue', id: `m${index}`, target: 'busy', at: (index % 100) / 10 - 5, label: `mark ${index}` }));
    const marks = getMarks([place(BUSY_PLOT), ...many], 'busy');
    expect(marks.find((mark) => mark.key === 'mark-m399')).toBeDefined();
    expect(marks.find((mark) => mark.key === 'mark-m0')).toBeUndefined();
    expect(countOf(marks)).toBeLessThan(220);
    expect(getOverlappingText(marks)).toEqual([]);
  });

  it('draws at most eight curves on one set of axes, the newest', () => {
    const curves = Array.from({ length: 30 }, (_, index) => place({ kind: 'plot', id: `c${index}`, over: 'first', expression: 'x', domain: [0, 1] }));
    const marks = getMarks([place({ kind: 'plot', id: 'first', expression: 'x', domain: [0, 1] }), ...curves], 'first');
    expect(marks.filter((mark) => mark.key.startsWith('curve-')).length).toBe(9);
    expect(marks.find((mark) => mark.key === 'curve-c29')).toBeDefined();
  });

  it('still finds points a geometry step names, past the bound on what it draws', () => {
    const points = Array.from({ length: 200 }, (_, index) => place({ kind: 'construct', id: `p${index}`, target: 'g', step: { shape: 'point', name: `n${index}`, x: 1, y: 1 } }));
    const marks = getMarks([place({ kind: 'geometry', id: 'g', xRange: [0, 4], yRange: [0, 4] }), ...points, place({ kind: 'construct', id: 's', target: 'g', step: { shape: 'segment', from: 'n0', to: 'n199' } })], 'g');
    expect(marks.find((mark) => mark.key === 'segment-s')).toBeDefined();
  });

  it('never lets readouts push the motion off its figure', () => {
    const readouts = Array.from({ length: 60 }, (_, index) => place({ kind: 'readout', id: `r${index}`, target: 'shot', quantity: 'height', label: 'x'.repeat(80) }));
    const shot = place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } });
    for (const size of SIZES) {
      const marks = getMarks([shot, ...readouts], 'shot', size);
      const ball = marks.find((mark) => mark.key === 'ball') as FigureMark & { kind: 'dot' };
      expect(ball.at.y).toBeGreaterThan(0);
      expect(ball.at.y).toBeLessThan(size.height);
      expect(JSON.stringify(marks)).not.toMatch(/null|NaN|Infinity/);
      expect(getText(marks).find((mark) => mark.key === 'readout-r59')).toBeDefined();
    }
  });
});
