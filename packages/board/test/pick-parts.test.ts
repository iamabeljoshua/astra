import { type ElementId, findMathSpans, parseSceneCommand, type SceneCommand } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { getBoardAt } from '../src/player/board-state.ts';
import { checkWork, type WorkContext } from '../src/shared/check-work.ts';
import { getPickParts } from '../src/shared/pick-parts.ts';

function getParts(tex: string) {
  const parsed = parseSceneCommand({ kind: 'writeMath', id: 'eq', tex, claim: 'new' });
  if (!parsed.ok) throw new Error(parsed.problem);
  const board = getBoardAt([{ kind: 'command', atMs: 0, command: parsed.value as SceneCommand, overMs: null }], 5000);
  return getPickParts(board.elements.get('eq' as ElementId));
}

const getSpanTexts = (tex: string) => getParts(tex).map(({ query }) => {
  const span = 'tex' in (query ?? {}) ? findMathSpans(tex, (query as { tex: string }).tex)[(query as { occurrence?: number }).occurrence ?? 0] : undefined;
  return span && { text: tex.slice(span.start, span.end), start: span.start };
});

describe('the terms a student can pick on a math line', () => {
  it.each([
    ['2x+3=11', ['2x', '+3', '11']],
    ['-2x+6=10', ['-2x', '+6', '10']],
    ['x - 3 = 5', ['x', '-3', '5']],
    ['x=-3', ['x', '-3']],
    [String.raw`2 \cdot 3 + 1 = 7`, ['2', '3', '+1', '7']],
    [String.raw`x \pm 3 = 5`, ['x', '3', '5']],
  ])('in %s are %j, each with its own sign', (tex, parts) => {
    expect(getParts(tex).map(({ part }) => part)).toEqual(parts);
  });

  it('points the underline and the ring at the sign and the term together', () => {
    expect(getSpanTexts('2x+3=11')).toEqual([{ text: '2x', start: 0 }, { text: '+3', start: 2 }, { text: '11', start: 5 }]);
    expect(getSpanTexts('x - 3 = 5')[1]).toEqual({ text: '- 3', start: 2 });
  });

  it('tells two copies of a term apart, and never takes one inside a fraction for the term', () => {
    expect(getSpanTexts('x+3=5+3').map((span) => span?.start)).toEqual([0, 1, 4, 5]);
    expect(getSpanTexts(String.raw`\frac{3}{2}+3=3`).map((span) => span?.start)).toEqual([0, 11, 14]);
  });
});

describe('what the tutor\'s answer matches', () => {
  const contextFor = (tex: string, answer: string[]): WorkContext => ({
    task: { kind: 'task', id: 'a1' as ElementId, way: 'pick', on: 'eq' as ElementId, answer },
    getLineTex: () => tex,
    getCurve: () => null,
    previousTex: null,
    pickedRight: [],
  });
  const pick = (tex: string, answer: string[], part: string) => checkWork({ way: 'pick', task: 'a1' as ElementId, part }, contextFor(tex, answer)).verdict.status;

  it.each([
    ['2x+3=11', ['+3'], '+3', 'right'],
    ['2x+3=11', ['3'], '+3', 'right'],
    ['2x+3=11', ['+3'], '11', 'wrong'],
    ['x-3=5', ['-3'], '-3', 'right'],
    ['x-3=5', ['3'], '-3', 'right'],
    ['x-3=5', ['-3'], '5', 'wrong'],
    ['x-3=3', ['3'], '3', 'right'],
    ['x-3=3', ['3'], '-3', 'wrong'],
    ['x-3=3', ['-3'], '-3', 'right'],
    ['x-3=3', ['-3'], '3', 'wrong'],
  ])('on %s with the answer %j, picking %s is %s', (tex, answer, part, status) => {
    expect(pick(tex, answer, part)).toBe(status);
  });
});
