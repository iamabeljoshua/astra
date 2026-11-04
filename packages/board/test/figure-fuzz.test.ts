import { parseSceneCommand, type SceneCommand } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import type { FigureFrame, FigureWords } from '../src/figure/figure-input.ts';
import { getFigureMarks } from '../src/figure/get-figure-marks.ts';
import { makeSeededRandom } from '../src/ink/ink-stroke.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';
import { getBoardAt } from '../src/player/board-state.ts';

const WORD = { label: 'Q', unit: 'u' };
const WORDS = { metres: 'm', degrees: 'd', tooFine: 'too fine', slope: 'slope', readouts: new Proxy({}, { get: () => WORD }), parameters: new Proxy({}, { get: () => WORD }) } as FigureWords;
const TOKENS = ['x', 'x', '1', '2', '0', '0.5', '999', 'pi', 'e', '+', '-', '*', '/', '^', '(', ')', 'sin(', 'cos(', 'tan(', 'exp(', 'ln(', 'log(', 'sqrt(', 'abs('];
const CASES = 2000;
const SIZES = [{ width: 712, height: 512 }, { width: 200, height: 144 }];

function getRandomExpression(random: () => number): string {
  const length = 1 + Math.floor(random() * 14);
  let text = '';
  let depth = 0;
  for (let index = 0; index < length; index += 1) {
    const token = TOKENS[Math.floor(random() * TOKENS.length)] as string;
    if (token.endsWith('(')) depth += 1;
    if (token === ')') depth -= 1;
    text += token;
  }
  return text + ')'.repeat(Math.max(0, depth));
}

function getRandomRange(random: () => number): [number, number] {
  const size = 10 ** (random() * 12 - 6);
  const low = (random() - 0.5) * size;
  return [low, low + size * (0.1 + random())];
}

function getOperations(random: () => number, command: SceneCommand): BoardOperation[] {
  const at = (command as { domain: [number, number] }).domain[0];
  const follow = [{ kind: 'markValue', id: 'mark', target: 'p', at, label: 'mark' }, { kind: 'shadeArea', id: 'shade', target: 'p', from: at, to: at + 1, label: 'shade' }, { kind: 'reveal', target: 'p', upTo: at + random() }];
  return [command, ...follow].map((item, index) => ({ kind: 'command', atMs: index, overMs: null, command: item as SceneCommand }));
}

const HEAVY_TEST_MS = 60_000;

describe('plots from random input', () => {
  it('never throws and never paints a number that is not finite', () => {
    const random = makeSeededRandom('figure-fuzz');
    let drawn = 0;
    for (let round = 0; round < CASES; round += 1) {
      const parsed = parseSceneCommand({ kind: 'plot', id: 'p', expression: getRandomExpression(random), domain: getRandomRange(random), ...(random() < 0.5 ? { yRange: getRandomRange(random) } : {}), label: 'curve', xLabel: 'x', yLabel: 'y' });
      if (!parsed.ok) continue;
      drawn += 1;
      const operations = getOperations(random, parsed.value);
      for (const size of SIZES) {
        const board = getBoardAt(operations, 5000);
        const marks = getFigureMarks({ board, element: board.elements.get('p' as never) as FigureFrame['element'], atMs: 5000, isReducedMotion: false, words: WORDS, ...size });
        expect(JSON.stringify(marks), parsed.value.kind === 'plot' ? parsed.value.expression : '').not.toMatch(/null|NaN|Infinity/);
      }
    }
    expect(drawn).toBeGreaterThan(100);
  }, HEAVY_TEST_MS);
});

const EXTREMES = [0, 1, -1, 1e-6, -1e-6, 1e-7, 0.1, 1 / 3, 1e-300, -1e-300, 1e6, -1e6, 999999.999999, 100, -100, 1000, 150, 9.8, 360, -360, 3600];
const NASTY_EXPRESSIONS = ['x', 'a*x', 'sin(a*x)', '10^308*x', '0-10^308*x', '10^300', '10^307*sin(x)', 'exp(709)*x', '1/x', 'tan(x)', 'a/(x-a)', '(a*x)^a', 'x^x', 'ln(a*x)', '10^(0-300)*x', '10^308+10^308*x', '10^16+x'];
const FIGURE_CASES = Number(process.env.FIGURE_CASES ?? 500);

function getRandomCommands(random: () => number): unknown[] {
  const pick = () => EXTREMES[Math.floor(random() * EXTREMES.length)] as number;
  const range = () => [pick(), pick()];
  const parameter = () => (['horizontalSpeed', 'upwardSpeed', 'releaseHeight', 'gravity', 'launchAngle', 'launchSpeed'] as const)[Math.floor(random() * 6)] as string;
  const expression = NASTY_EXPRESSIONS[Math.floor(random() * NASTY_EXPRESSIONS.length)];
  return [
    { kind: 'plot', id: 'p', expression, constants: [{ name: 'a', value: pick(), min: pick(), max: pick() }], domain: range(), label: 'curve' },
    { kind: 'plot', id: 'p', expression, domain: range(), yRange: range(), label: 'curve' },
    { kind: 'plot', id: 'p', expression, domain: range(), label: 'curve' },
    { kind: 'plot', id: 'o', over: 'p', expression, domain: range() },
    { kind: 'markValue', id: 'm', target: 'p', at: pick(), label: 'mark' },
    { kind: 'shadeArea', id: 's', target: 'p', from: pick(), to: pick(), label: 'shade' },
    { kind: 'reveal', target: 'p', upTo: pick() },
    { kind: 'setParameter', target: 'p', constant: 'a', value: pick(), overWords: 2 },
    { kind: 'slider', id: 'sl', target: 'p', constant: 'a', min: pick(), max: pick() },
    { kind: 'numberLine', id: 'n', domain: range() },
    { kind: 'markValue', id: 'nm', target: 'n', at: pick(), label: 'mark' },
    { kind: 'geometry', id: 'g', xRange: range(), yRange: range() },
    { kind: 'construct', id: 'ga', target: 'g', step: { shape: 'point', name: 'A', x: pick(), y: pick() } },
    { kind: 'construct', id: 'gb', target: 'g', step: { shape: 'point', name: 'B', x: pick(), y: pick() } },
    { kind: 'construct', id: 'gc', target: 'g', step: { shape: 'point', name: 'C', x: pick(), y: pick() } },
    { kind: 'construct', id: 'gs', target: 'g', step: { shape: 'segment', from: 'A', to: 'B' } },
    { kind: 'construct', id: 'gr', target: 'g', step: { shape: 'circle', center: 'A', through: 'B' } },
    { kind: 'construct', id: 'gt', target: 'g', step: { shape: 'angle', at: 'A', from: 'B', to: 'C' } },
    { kind: 'vector', id: 'gv', on: 'g.A', angleDegrees: pick(), length: 'long', label: 'force' },
    { kind: 'annotate', id: 'gn', target: 'g.A', mark: 'circle', label: 'note' },
    { kind: 'simulate', id: 'b', simulation: { model: 'projectile', parameters: { horizontalSpeed: pick(), upwardSpeed: pick(), releaseHeight: pick(), gravity: pick() } } },
    { kind: 'simulate', id: 'b', simulation: { model: 'projectile', parameters: { horizontalSpeed: 5, upwardSpeed: 0, releaseHeight: 0, gravity: 9.8 } } },
    { kind: 'trackVector', id: 'bv', target: 'b', quantity: 'velocity', label: 'speed' },
    { kind: 'trackVector', id: 'ba', target: 'b', quantity: 'acceleration' },
    { kind: 'readout', id: 'br', target: 'b', quantity: 'landing-distance' },
    { kind: 'readout', id: 'bh', target: 'b', quantity: 'peak-height' },
    { kind: 'ghostPath', id: 'bg', target: 'b' },
    { kind: 'slider', id: 'bs', target: 'b', parameter: parameter(), min: pick(), max: pick() },
    { kind: 'runSimulation', target: 'b', action: 'play', until: pick(), overWords: 2 },
    { kind: 'runSimulation', target: 'b', action: 'seek', to: pick() },
    { kind: 'setParameter', target: 'b', parameter: parameter(), value: pick() },
    { kind: 'annotate', id: 'bn', target: 'b.ball', mark: 'circle', label: 'note' },
    { kind: 'annotate', id: 'bp', target: 'b.path', mark: 'circle', label: 'note' },
    { kind: 'vector', id: 'bo', on: 'b.ball', angleDegrees: pick(), length: 'short' },
  ];
}

describe('every figure kind from extreme numbers the parser accepts', () => {
  it('never throws and never paints a number that is not finite', () => {
    const random = makeSeededRandom('figure-extremes');
    let accepted = 0;
    for (let round = 0; round < FIGURE_CASES; round += 1) {
      const operations: BoardOperation[] = [];
      for (const raw of getRandomCommands(random)) {
        const parsed = parseSceneCommand(raw);
        if (parsed.ok) operations.push({ kind: 'command', atMs: operations.length * 10, overMs: 'overWords' in parsed.value ? 200 : null, command: parsed.value });
      }
      accepted += operations.length;
      const sample = 1 + Math.floor(random() * 3000);
      const moved = [...operations, ...['p', 'b'].map((target): BoardOperation => ({ kind: 'parameterSample', atMs: sample, target: target as never, parameter: target === 'p' ? 'a' : 'upwardSpeed', value: EXTREMES[Math.floor(random() * EXTREMES.length)] as number }))].sort((first, second) => first.atMs - second.atMs);
      for (const atMs of [operations.length * 10 + 5, 5000]) {
        const board = getBoardAt(moved, atMs);
        for (const id of ['p', 'n', 'g', 'b']) {
          const element = board.elements.get(id as never);
          if (!element) continue;
          const marks = getFigureMarks({ board, element, atMs, isReducedMotion: round % 2 === 0, words: WORDS, ...(SIZES[round % 2] as (typeof SIZES)[number]) });
          expect(JSON.stringify(marks), JSON.stringify(element.content)).not.toMatch(/null|NaN|Infinity/);
        }
      }
    }
    expect(accepted).toBeGreaterThan(FIGURE_CASES * 10);
  }, HEAVY_TEST_MS);
});
