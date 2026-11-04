import { afterEach, describe, expect, it } from 'vitest';
import { type Box, doBoxesOverlap, type FigureMark, getLeadingShare, clipBranch } from '../src/figure/figure-marks.ts';
import { createEqualView, createStretchedView } from '../src/figure/figure-view.ts';
import type { FigureFrame, FigureWords } from '../src/figure/figure-input.ts';
import { getFigureFit, getFigureMarks } from '../src/figure/get-figure-marks.ts';
import { estimateTextWidth, LABEL_FONT, placeLabels, setLabelMeasure, wrapLabel } from '../src/figure/place-labels.ts';
import { getBoardAt } from '../src/player/board-state.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';

const QUANTITY = { label: 'Q', unit: 'u' };
const WORDS: FigureWords = {
  slope: 'slope',
  metres: 'm',
  degrees: '°',
  readouts: { time: QUANTITY, height: { label: 'Height', unit: 'm' }, distance: QUANTITY, speed: QUANTITY, 'velocity-x': QUANTITY, 'velocity-y': QUANTITY, 'peak-height': QUANTITY, 'landing-distance': QUANTITY },
  parameters: { horizontalSpeed: QUANTITY, upwardSpeed: QUANTITY, releaseHeight: QUANTITY, gravity: QUANTITY, launchAngle: QUANTITY, launchSpeed: QUANTITY },
  tooFine: 'Too fine to draw here',
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
    const mustAvoid = [{ left: 80, top: 30, right: 120, bottom: 70 }];
    const named = { key: 'name', text: 'a name', anchor: { x: 100, y: 50 }, gap: 0, sides: ['right'] as const, tone: 'ink' as const, isFixed: true };
    const tick = { ...named, key: 'tick', text: '12', isOptional: true };
    const placed = placeLabels([named, tick], { bounds, mustAvoid, shouldAvoid: [] });
    expect(placed.map((mark) => mark.key)).toEqual(['name']);
  });

  it('holds text as text, so markup in a label is never built', () => {
    const marks = getMarks([place({ ...BUSY_PLOT, label: '<img src=x onerror="alert(1)">' })], 'busy');
    expect(getText(marks).find((mark) => mark.key === 'label-busy')?.lines.join(' ')).toContain('<img');
  });
});

describe('scales', () => {
  it('fills the figure on a free view, with up as up', () => {
    const view = createStretchedView({ xRange: [0, 10], yRange: [0, 5], rect: { left: 0, top: 0, right: 100, bottom: 50 } });
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

describe('a mark and what it reports', () => {
  function getReports(operations: BoardOperation[], rootId: string, atMs = LATE_MS) {
    const board = getBoardAt(operations, atMs);
    const missing: string[] = [];
    const drawn: string[] = [];
    const marks = getFigureMarks({ board, element: board.elements.get(rootId as never) as FigureFrame['element'], atMs, ...SIZES[0] as { width: number; height: number }, isReducedMotion: false, words: WORDS, onMarkWithoutPart: (mark) => missing.push(mark.id), onMarkDrawn: (mark) => drawn.push(mark.id) });
    return { missing, drawn, marks };
  }
  const line = place({ kind: 'numberLine', id: 'line', domain: [0, 10] });
  const shot = place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 4, releaseHeight: 1, gravity: 9.8 } } });

  it('reports a mark on a number line part, which draws nothing', () => {
    const { missing } = getReports([line, place({ kind: 'markValue', id: 'start', target: 'line', at: 3 }), place({ kind: 'annotate', id: 'on-line', target: 'line.start', mark: 'circle', label: 'circled' })], 'line');
    expect(missing).toEqual(['on-line']);
  });

  it('reports a value off a number line, and says a value on it was drawn', () => {
    const { missing, drawn } = getReports([line, place({ kind: 'markValue', id: 'off', target: 'line', at: 99 }), place({ kind: 'markValue', id: 'on', target: 'line', at: 4 })], 'line');
    expect(missing).toEqual(['off']);
    expect(drawn).toEqual(['on']);
  });

  it('reports a value a curve does not have or that sits off its axes', () => {
    const curve = place({ kind: 'plot', id: 'curve', expression: 'sqrt(x)', domain: [-1, 4], yRange: [0, 1] });
    const { missing, drawn } = getReports([curve, place({ kind: 'markValue', id: 'none', target: 'curve', at: -1 }), place({ kind: 'markValue', id: 'high', target: 'curve', at: 4 }), place({ kind: 'markValue', id: 'fine', target: 'curve', at: 0.5 })], 'curve');
    expect(missing).toEqual(['none', 'high']);
    expect(drawn).toEqual(['fine']);
  });

  it('draws a mark on a path, a part the scene lists', () => {
    const { missing, drawn, marks } = getReports([shot, place({ kind: 'annotate', id: 'on-path', target: 'shot.path', mark: 'circle', label: 'the path' }), place({ kind: 'annotate', id: 'on-ball', target: 'shot.ball', mark: 'check' })], 'shot');
    expect(missing).toEqual([]);
    expect(drawn).toEqual(['on-path', 'on-ball']);
    expect(marks.find((mark) => mark.key === 'note-on-path')).toMatchObject({ kind: 'path' });
  });

  it('says a mark on a geometry point was drawn, so a later hide of the point is no surprise', () => {
    const shape = place({ kind: 'geometry', id: 'shape', xRange: [0, 6], yRange: [0, 6] });
    const { missing, drawn } = getReports([shape, place({ kind: 'construct', id: 'pa', target: 'shape', step: { shape: 'point', name: 'A', x: 2, y: 2 } }), place({ kind: 'annotate', id: 'on-a', target: 'shape.A', mark: 'circle' }), place({ kind: 'annotate', id: 'on-z', target: 'shape.Z', mark: 'circle' })], 'shape');
    expect(drawn).toEqual(['on-a']);
    expect(missing).toEqual(['on-z']);
  });
});

describe('a curve drawn over another', () => {
  it('stays inside the axes it was drawn on, however wide its own domain', () => {
    const operations = [place({ kind: 'plot', id: 'first', expression: 'x', domain: [-3, 3], yRange: [-3, 3] }), place({ kind: 'plot', id: 'second', over: 'first', expression: 'x/2', domain: [-20, 20] })];
    const marks = getMarks(operations, 'first');
    const axes = marks.find((mark): mark is FigureMark & { kind: 'path' } => mark.key === 'axes')?.branches[0] as readonly { x: number }[];
    const curve = marks.find((mark): mark is FigureMark & { kind: 'path' } => mark.key === 'curve-second');
    const xs = curve?.branches.flat().map(({ x }) => x) as number[];
    expect(Math.min(...xs)).toBeCloseTo(axes[0]?.x as number, 6);
    expect(Math.max(...xs)).toBeCloseTo(axes[1]?.x as number, 6);
  });

  it('draws nothing when its domain misses the axes', () => {
    const operations = [place({ kind: 'plot', id: 'first', expression: 'x', domain: [-3, 3] }), place({ kind: 'plot', id: 'second', over: 'first', expression: 'x', domain: [10, 20], label: 'gone' })];
    const curve = getMarks(operations, 'first').find((mark): mark is FigureMark & { kind: 'path' } => mark.key === 'curve-second');
    expect(curve?.branches).toEqual([]);
  });
});

describe('a hoop', () => {
  const getHoop = (horizontalSpeed: number) => {
    const operations = [place({ kind: 'drawing', id: 'court', name: 'hoop-side' }), place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } }, over: 'court' })];
    const marks = getMarks(operations, 'shot');
    const hoop = marks.find((mark): mark is FigureMark & { kind: 'path' } => mark.key === 'hoop');
    const [rim, board] = hoop?.branches as readonly (readonly { x: number }[])[];
    return { rimStart: rim?.[0]?.x as number, boardX: board?.[0]?.x as number, ball: marks.find((mark): mark is FigureMark & { kind: 'dot' } => mark.key === 'ball')?.at.x as number, marks };
  };

  it('puts the board behind the rim as the ball sees it, whichever way the ball flies', () => {
    const right = getHoop(4.2);
    expect(right.boardX).toBeGreaterThan(right.rimStart);
    expect(right.rimStart).toBeGreaterThan(right.ball);
    const left = getHoop(-4.2);
    expect(left.boardX).toBeLessThan(left.rimStart);
    expect(left.rimStart).toBeLessThan(left.ball);
  });

  it('keeps a hoop on the left on the figure', () => {
    const { marks } = getHoop(-4.2);
    const hoop = marks.find((mark): mark is FigureMark & { kind: 'path' } => mark.key === 'hoop') as FigureMark & { kind: 'path' };
    for (const { x } of hoop.branches.flat()) expect(x).toBeGreaterThanOrEqual(0);
  });
});

describe('text too wide for the estimate', () => {
  afterEach(() => setLabelMeasure(null));

  it.each([['\uFDFD', 6.4], ['\u{1242B}', 4.6], ['\u{1F600}', 1.2]])('bounds %s with no page to measure on', (character, ems) => {
    expect(estimateTextWidth(character)).toBeGreaterThan(ems * LABEL_FONT.size);
  });

  it('measures on the page any text outside the known letters, with room to spare', () => {
    setLabelMeasure((text) => [...text].length * 50);
    expect(estimateTextWidth('\u1000\u1001')).toBeGreaterThan(100);
    expect(estimateTextWidth('abc')).toBeLessThan(50);
  });

  it('keeps three wide ligatures clear of every other label by the width they really have', () => {
    setLabelMeasure((text) => [...text].length * 78);
    const operations = [place({ kind: 'plot', id: 'wide', expression: 'x^2', domain: [-3, 3], xLabel: 'x', yLabel: 'y' }), place({ kind: 'markValue', id: 'm1', target: 'wide', at: 1, label: 'beside' }), place({ kind: 'markValue', id: 'm2', target: 'wide', at: 0, label: '\uFDFD\uFDFD\uFDFD' })];
    for (const size of SIZES) {
      const marks = getMarks(operations, 'wide', size);
      expect(getOverlappingText(marks)).toEqual([]);
      expect(getTextOutside(marks, size)).toEqual([]);
    }
  });
});

describe('a world with no size', () => {
  const flight = (parameters: object) => place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { gravity: 9.8, ...parameters } } });
  const getBall = (marks: readonly FigureMark[]) => marks.find((mark): mark is FigureMark & { kind: 'dot' } => mark.key === 'ball');

  it.each([
    [{ horizontalSpeed: 5, upwardSpeed: 0, releaseHeight: 0 }],
    [{ horizontalSpeed: 0, upwardSpeed: 0, releaseHeight: 0 }],
    [{ horizontalSpeed: -5, upwardSpeed: -3, releaseHeight: 0 }],
    [{ horizontalSpeed: 1e-300, upwardSpeed: 1e-300, releaseHeight: 1e-300 }],
  ])('draws axes and a ball on the ground for a flight that never leaves it: %j', (parameters) => {
    const marks = getMarks([flight(parameters)], 'shot');
    expect(JSON.stringify(marks)).not.toMatch(/null|NaN|Infinity/);
    const ball = getBall(marks);
    expect(ball?.at.x).toBeGreaterThan(0);
    expect(ball?.at.y).toBeLessThanOrEqual(SIZES[0]?.height as number);
    expect(marks.find((mark) => mark.key === 'axes')).toMatchObject({ branches: [[{ x: expect.any(Number) }, { x: expect.any(Number) }], [{ x: expect.any(Number) }, { x: expect.any(Number) }]] });
  });

  it.each(['10^308*x', '0-10^308*x', '10^300', '10^308+10^308*x', '10^16'])('gives %s real axes, because a range can overflow', (expression) => {
    const marks = getMarks([place({ kind: 'plot', id: 'huge', expression, domain: [-1, 1], label: 'very big' })], 'huge');
    expect(JSON.stringify(marks)).not.toMatch(/null|NaN|Infinity/);
    expect(getText(marks).some((mark) => mark.key.startsWith('tick-y-'))).toBe(true);
  });

  it('writes zero as 0 on a far-off scale, and never as 0.0e0', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'wide', expression: 'x', domain: [-1000000, 1000000], yRange: [-1000000, 1000000] }), place({ kind: 'numberLine', id: 'line', domain: [-1000000, 1000000] })], 'line');
    expect(getText(marks).map((mark) => mark.lines.join(' '))).toContain('0');
    expect(getText(marks).map((mark) => mark.lines.join(' ')).join(' ')).not.toContain('0.0e');
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

describe('axes that hold still', () => {
  const parameters = { horizontalSpeed: 10, upwardSpeed: 10, releaseHeight: 0, gravity: 9.8 };
  const shot = place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters } });

  it('does not move through a whole drag of a launch angle, which lands farthest in the middle', () => {
    const angle = place({ kind: 'slider', id: 'angle', target: 'shot', parameter: 'launchAngle', min: 10, max: 80 });
    const tickAt = (value: number) => {
      const drag: BoardOperation = { kind: 'parameterSample', atMs: 2000, target: 'shot' as never, parameter: 'launchAngle', value };
      return getText(getMarks([shot, angle, drag], 'shot')).find((mark) => mark.key === 'tick-x-10')?.at.x;
    };
    const atRest = tickAt(45);
    for (const value of [10, 20, 33, 44, 46, 60, 80]) expect(tickAt(value)).toBe(atRest);
  });

  it('does not move for the arrows on the ball either, which grow with the speed', () => {
    const speed = place({ kind: 'slider', id: 'speed', target: 'shot', parameter: 'launchAngle', min: 10, max: 80 });
    const arrows = [place({ kind: 'trackVector', id: 'v', target: 'shot', quantity: 'velocity' }), place({ kind: 'trackVector', id: 'g', target: 'shot', quantity: 'acceleration' })];
    const tickAt = (value: number) => {
      const drag: BoardOperation = { kind: 'parameterSample', atMs: 2000, target: 'shot' as never, parameter: 'launchAngle', value };
      return getText(getMarks([shot, ...arrows, speed, drag], 'shot')).find((mark) => mark.key === 'tick-x-10')?.at.x;
    };
    const atRest = tickAt(45);
    for (const value of [10, 30, 60, 80]) expect(tickAt(value)).toBe(atRest);
  });

  it('keeps every arc on the figure with a speed and an angle on sliders, wherever they are', () => {
    const sliders = [place({ kind: 'slider', id: 'angle', target: 'shot', parameter: 'launchAngle', min: 10, max: 80 }), place({ kind: 'slider', id: 'speed', target: 'shot', parameter: 'launchSpeed', min: 0, max: 15 })];
    const size = SIZES[0] as { width: number; height: number };
    const sample = (atMs: number, parameter: string, value: number): BoardOperation => ({ kind: 'parameterSample', atMs, target: 'shot' as never, parameter, value });
    for (const moves of [[sample(2000, 'launchAngle', 80), sample(2100, 'launchSpeed', 15)], [sample(2000, 'launchSpeed', 15), sample(2100, 'launchAngle', 45)], [sample(2000, 'launchSpeed', 15), sample(2100, 'launchAngle', 10)]]) {
      const marks = getMarks([shot, ...sliders, ...moves], 'shot', size);
      const path = marks.find((mark) => mark.key === 'path') as FigureMark & { kind: 'path' };
      for (const { x, y } of path.branches.flat()) {
        expect(x).toBeLessThanOrEqual(size.width);
        expect(y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('holds the axes on a slider\'s first move after the tutor set the speed the other way', () => {
    const slider = place({ kind: 'slider', id: 'sideways', target: 'shot', parameter: 'horizontalSpeed', min: 0, max: 15 });
    const tutor = place({ kind: 'setParameter', target: 'shot', parameter: 'launchAngle', value: 30 }, 1000);
    const getAxes = (operations: BoardOperation[]) => (getMarks(operations, 'shot').find((mark) => mark.key === 'axes') as FigureMark & { kind: 'path' }).branches;
    const before = getAxes([shot, slider, tutor]);
    const after = getAxes([shot, slider, tutor, { kind: 'parameterSample', atMs: 2000, target: 'shot' as never, parameter: 'horizontalSpeed', value: 9 }]);
    expect(after).toEqual(before);
  });

  it('keeps every arc a slider reaches on the figure', () => {
    const angle = place({ kind: 'slider', id: 'angle', target: 'shot', parameter: 'launchAngle', min: 10, max: 80 });
    const size = SIZES[0] as { width: number; height: number };
    for (const value of [10, 45, 80]) {
      const drag: BoardOperation = { kind: 'parameterSample', atMs: 2000, target: 'shot' as never, parameter: 'launchAngle', value };
      const path = getMarks([shot, angle, drag], 'shot', size).find((mark) => mark.key === 'path') as FigureMark & { kind: 'path' };
      for (const { x, y } of path.branches.flat()) {
        expect(x).toBeLessThanOrEqual(size.width);
        expect(y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('fits a curve whose constant peaks inside its range', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'p', expression: '5*sin(a)', constants: [{ name: 'a', value: 0, min: 0, max: 3.14159 }], domain: [0, 1] }), { kind: 'parameterSample', atMs: 1, target: 'p' as never, parameter: 'a', value: 1.5708 }], 'p');
    const curve = marks.find((mark) => mark.key === 'curve-p') as FigureMark & { kind: 'path' };
    expect(curve.branches.flat().length).toBeGreaterThan(1);
  });

  it('gives each tick its own number on a far-off range', () => {
    const marks = getMarks([place({ kind: 'plot', id: 'p', expression: '1000000+x', domain: [0, 10], yRange: [1000000, 1000010] })], 'p');
    const text = getText(marks).filter((mark) => mark.key.startsWith('tick-y')).map((mark) => mark.lines[0]);
    expect(new Set(text).size).toBe(text.length);
    expect(text.length).toBeGreaterThan(2);
  });

  it('says so when a tutor\'s label has no room anywhere on the figure', () => {
    const lost: string[] = [];
    const board = getBoardAt([place({ kind: 'plot', id: 'p', expression: 'x', domain: [0, 1], label: 'a label with no room at all' })], LATE_MS);
    getFigureMarks({ board, element: board.elements.get('p' as never) as FigureFrame['element'], atMs: LATE_MS, width: 40, height: 20, isReducedMotion: false, words: WORDS, onLabelWithoutRoom: (text) => lost.push(text) });
    expect(lost).toEqual(['a label with no room at all']);
  });
});

describe('marks on a curve placed again', () => {
  const up = place({ kind: 'plot', id: 'v', expression: 'x^2', domain: [-2, 2] });
  const lowest = place({ kind: 'markValue', id: 'lowest', target: 'v', at: 0, label: 'minimum' });
  const note = place({ kind: 'annotate', id: 'note', target: 'v.curve', mark: 'circle', label: 'bends up' });
  const words = (marks: readonly FigureMark[]) => getText(marks).flatMap((mark) => mark.lines).join(' ');

  it('reads no old words on a downward parabola', () => {
    expect(words(getMarks([up, lowest, note], 'v'))).toContain('minimum (0, 0)');
    expect(words(getMarks([up, lowest, note, place({ kind: 'plot', id: 'v', expression: '0-x^2', domain: [-2, 2] }, 5000)], 'v'))).not.toMatch(/minimum|bends up/);
  });
});

describe('a curve too fine to draw', () => {
  const getFine = (expression: string, domain: [number, number] = [-10, 10]) => {
    const operations = [place({ kind: 'plot', id: 'c', expression, domain })];
    const board = getBoardAt(operations, LATE_MS);
    const tooFine: string[] = [];
    const marks = getFigureMarks({ board, element: board.elements.get('c' as never) as FigureFrame['element'], atMs: LATE_MS, ...SIZES[0] as { width: number; height: number }, isReducedMotion: false, words: WORDS, onCurveTooFine: (element) => tooFine.push(element.id) });
    return { marks, tooFine, note: getText(marks).find((mark) => mark.key === 'too-fine') };
  };

  for (const expression of ['abs(sin(100*x))/sin(100*x)', '1/sin(100*x)', 'tan(100*x)', 'sin(300*x)']) {
    it(`says so in the figure and to the tutor for ${expression}`, () => {
      const { note, tooFine, marks } = getFine(expression);
      expect(note?.lines).toEqual([WORDS.tooFine]);
      expect(tooFine).toEqual(['c']);
      expect(getOverlappingText(marks)).toEqual([]);
      expect(getTextOutside(marks, SIZES[0] as { width: number; height: number })).toEqual([]);
    });
  }

  for (const expression of ['sin(x)', 'sin(30*x)', 'sin(150*x)', '1/x', 'tan(x)', 'abs(sin(20*x))/sin(20*x)']) {
    it(`says nothing for ${expression}, which it drew`, () => {
      const { note, tooFine } = getFine(expression);
      expect(note).toBeUndefined();
      expect(tooFine).toEqual([]);
    });
  }

  it('keeps the note clear of a y axis at the right edge, and says it once for two fine curves', () => {
    const size = SIZES[0] as { width: number; height: number };
    const marks = getMarks([place({ kind: 'plot', id: 'c', expression: 'tan(100*x)', domain: [-10, 0], yLabel: 'y', xLabel: 'x' }), place({ kind: 'plot', id: 'over', over: 'c', expression: 'sin(300*x)', domain: [-10, 0] })], 'c', size);
    expect(getText(marks).filter((mark) => mark.key === 'too-fine')).toHaveLength(1);
    expect(getOverlappingText(marks)).toEqual([]);
    expect(getTextOutside(marks, size)).toEqual([]);
  });

  it('keeps the note clear of a phone-width figure', () => {
    const operations = [place({ kind: 'plot', id: 'c', expression: 'tan(100*x)', domain: [-10, 10], label: 'y = tan(100 x)', xLabel: 'x', yLabel: 'y' })];
    const size = SIZES[1] as { width: number; height: number };
    const marks = getMarks(operations, 'c', size);
    expect(getText(marks).some((mark) => mark.key === 'too-fine')).toBe(true);
    expect(getOverlappingText(marks)).toEqual([]);
    expect(getTextOutside(marks, size)).toEqual([]);
  });
});

describe('every way a number reaches a flight', () => {
  const BOUNDS = { horizontalSpeed: [-100, 100], upwardSpeed: [-100, 100], releaseHeight: [0, 1000], gravity: [0.1, 100], launchAngle: [-90, 90], launchSpeed: [0, 150] } as const;
  const readouts = (['time', 'height', 'distance', 'speed', 'velocity-x', 'velocity-y', 'peak-height', 'landing-distance'] as const).map((quantity) => place({ kind: 'readout', id: `r-${quantity}`, target: 'shot', quantity }));
  const shot = place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } });

  const expectHonest = (operations: BoardOperation[]) => {
    for (const atMs of [3000, LATE_MS]) {
      const marks = getMarks(operations, 'shot', undefined, atMs);
      const text = JSON.stringify(marks, (_, value: unknown) => (typeof value === 'number' && !Number.isFinite(value) ? 'NOT FINITE' : value));
      expect(text).not.toMatch(/NOT FINITE|NaN|Infinity/);
    }
  };

  for (const [name, [low, high]] of Object.entries(BOUNDS)) {
    it(`stays honest with ${name} at either end, as a slider or from the tutor`, () => {
      for (const value of [low, high]) {
        expectHonest([shot, ...readouts, { kind: 'parameterSample', atMs: 1000, target: 'shot' as never, parameter: name, value }]);
        expectHonest([shot, ...readouts, place({ kind: 'setParameter', target: 'shot', parameter: name, value }, 1000)]);
      }
    });
  }

  it('leaves gravity above zero and the height above the ground whatever a sample says', () => {
    for (const [parameter, value, lowest] of [['gravity', 0, 0.1], ['gravity', -5, 0.1], ['releaseHeight', -5, 0], ['launchSpeed', -5, 0]] as const) {
      const operations: BoardOperation[] = [shot, ...readouts, { kind: 'parameterSample', atMs: 1000, target: 'shot' as never, parameter, value }];
      expectHonest(operations);
      expect(getBoardAt(operations, LATE_MS).elements.get('shot' as never)?.placedScene?.scene.values?.[parameter]).toBe(lowest);
    }
  });
});

describe('a plot at the prototype\'s size', () => {
  const PROTOTYPE_SIZE = { width: 620, height: 340 };
  const getYTicks = (expression: string, domain: [number, number], size = PROTOTYPE_SIZE) => getText(getMarks([place({ kind: 'plot', id: 'p', expression, domain })], 'p', size))
    .filter((mark) => mark.key.startsWith('tick-y'))
    .map((mark) => Number((mark.lines[0] as string).replace('−', '-')));
  // The tick at zero is drawn by the axes, so it is added back before measuring the gaps.
  const getSteps = (ticks: readonly number[]) => {
    const sorted = [...new Set([...ticks, 0])].sort((low, high) => low - high);
    return new Set(sorted.slice(1).map((tick, index) => Number((tick - (sorted[index] as number)).toFixed(6))));
  };

  it('takes the prototype\'s shape whatever the curve, and leaves other figures theirs', () => {
    const operations = [place({ kind: 'plot', id: 'p', expression: 'x^2-4*x+1', domain: [-1, 5] }), place({ kind: 'plot', id: 'wave', expression: '5*sin(x)', domain: [0, 10] }), place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } })];
    const board = getBoardAt(operations, LATE_MS);
    const fitOf = (id: string) => getFigureFit(board.elements.get(id as never) as FigureFrame['element'], 620).size;
    expect(fitOf('p').height).toBeCloseTo(PROTOTYPE_SIZE.height, 6);
    expect(fitOf('wave').height).toBeCloseTo(PROTOTYPE_SIZE.height, 6);
    expect(fitOf('shot').height).toBeCloseTo(620 * 0.72, 6);
  });

  it('numbers y every 1 on the lesson\'s curve, as the prototype does', () => {
    expect(getSteps(getYTicks('x^2-4*x+1', [-1, 5]))).toEqual(new Set([1]));
  });

  it.each([
    ['x^2', [-10, 10], 10],
    ['sin(x)', [0, 6], 0.2],
    ['x^3', [-3, 3], 5],
  ] as const)('keeps %s on round steps a reader can follow', (expression, domain, step) => {
    const ticks = getYTicks(expression, [...domain]);
    expect(getSteps(ticks)).toEqual(new Set([step]));
    expect(ticks.length).toBeLessThanOrEqual(13);
  });

  it('keeps numbers from landing on each other, even on a short figure', () => {
    for (const size of [PROTOTYPE_SIZE, { width: 326, height: 179 }]) {
      const marks = getMarks([place({ kind: 'plot', id: 'p', expression: 'x^2-4*x+1', domain: [-1, 5] })], 'p', size);
      expect(getOverlappingText(marks)).toEqual([]);
    }
  });

  it('leaves a simulation\'s scale as it was', () => {
    const shot = place({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } });
    const ticks = getText(getMarks([shot], 'shot', { width: 620, height: 446 })).filter((mark) => mark.key.startsWith('tick-y'));
    expect(ticks.length).toBeLessThanOrEqual(8);
  });
});
