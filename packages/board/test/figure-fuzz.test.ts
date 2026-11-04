import { parseSceneCommand, type SceneCommand } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import type { FigureFrame, FigureWords } from '../src/figure/figure-input.ts';
import { getFigureMarks } from '../src/figure/get-figure-marks.ts';
import { makeSeededRandom } from '../src/ink/ink-stroke.ts';
import type { BoardOperation } from '../src/player/board-operations.ts';
import { getBoardAt } from '../src/player/board-state.ts';

const WORD = { label: 'Q', unit: 'u' };
const WORDS = { metres: 'm', degrees: 'd', readouts: new Proxy({}, { get: () => WORD }), parameters: new Proxy({}, { get: () => WORD }) } as FigureWords;
const TOKENS = ['x', 'x', '1', '2', '0', '0.5', '999', 'pi', 'e', '+', '-', '*', '/', '^', '(', ')', 'sin(', 'cos(', 'tan(', 'exp(', 'ln(', 'log(', 'sqrt(', 'abs('];
const CASES = 400;
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
    expect(drawn).toBeGreaterThan(50);
  });
});
