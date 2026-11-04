import { describe, expect, it } from 'vitest';
import type { ElementId } from '@astra/contracts';
import { checkWork, getLineTex, readLine } from '../src/shared/index.ts';

function createRandom(seed: number) {
  let state = seed;
  return (below: number) => {
    state = (state * 48271) % 2147483647;
    return state % below;
  };
}

function getStatus(problem: string, typed: string) {
  const problemTex = getLineTex(readLine(problem));
  return checkWork({ way: 'write', id: 's1' as ElementId, text: typed }, { task: { kind: 'task', id: 'a1' as ElementId, way: 'write', on: 'problem' as ElementId }, getLineTex: () => problemTex, getCurve: () => null, previousTex: null, pickedRight: [] }).verdict.status;
}

const signed = (value: number) => (value < 0 ? `- ${-value}` : `+ ${value}`);

/** Builds ax + b = c with a whole root, and steps from it whose truth comes from plain arithmetic here, not from the checker. */
function makeProblem(random: (below: number) => number) {
  const a = 2 + random(8);
  const root = random(21) - 10;
  const b = 1 + random(12);
  const c = a * root + b;
  const shift = 1 + random(9);
  return {
    problem: `${a}x + ${b} = ${c}`,
    trueSteps: [`${a}x = ${c - b}`, `x = ${root}`, `${c} = ${a}x + ${b}`, `${a}x + ${b} ${signed(shift)} = ${c + shift}`, `${2 * a}x + ${2 * b} = ${2 * c}`, `${a}x ${signed(b - c)} = 0`],
    falseSteps: [`${a}x = ${c + b}`, `x = ${root + shift}`, `${a}x + ${b} = ${c + shift}`, `${a}x = ${c}`, ...(root === 0 ? [] : [`x = ${c - b}`]), `${a}x + ${b} ${signed(shift)} = ${c - shift}`],
  };
}

describe('generated steps', () => {
  it('holds over 3000 problems: no true step is wrong, no false step is right', () => {
    const random = createRandom(71);
    const tally = { trueRight: 0, trueUnknown: 0, trueWrong: 0, falseWrong: 0, falseUnknown: 0, falseRight: 0 };
    const seen: string[] = [];
    for (let index = 0; index < 3000; index += 1) {
      const { problem, trueSteps, falseSteps } = makeProblem(random);
      for (const typed of trueSteps) {
        const status = getStatus(problem, typed);
        tally[status === 'right' ? 'trueRight' : status === 'wrong' ? 'trueWrong' : 'trueUnknown'] += 1;
        if (status === 'wrong') seen.push(`${problem} -> ${typed}`);
      }
      for (const typed of falseSteps) {
        const status = getStatus(problem, typed);
        tally[status === 'right' ? 'falseRight' : status === 'wrong' ? 'falseWrong' : 'falseUnknown'] += 1;
        if (status === 'right') seen.push(`${problem} -> ${typed}`);
      }
    }
    console.log(JSON.stringify(tally), seen.slice(0, 12));
    expect(tally.trueWrong).toBe(0);
    expect(tally.falseRight).toBe(0);
  });
});
