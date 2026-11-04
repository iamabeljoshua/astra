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

function getStatus(problemTex: string | null, typed: string) {
  return checkWork({ way: 'write', id: 's1' as ElementId, text: typed }, { task: { kind: 'task', id: 'a1' as ElementId, way: 'write', on: 'problem' as ElementId }, getLineTex: () => problemTex, getCurve: () => null, previousTex: null, pickedRight: [] }).verdict.status;
}

const signed = (value: number) => (value < 0 ? `- ${-value}` : `+ ${value}`);

function makeProblem(random: (below: number) => number) {
  const a = 2 + random(8);
  const root = random(21) - 10;
  const b = 1 + random(12);
  const c = a * root + b;
  const shift = 1 + random(9);
  return {
    problem: `${a}x + ${b} = ${c}`,
    trueSteps: [`${a}x = ${c - b}`, `x = ${root}`, `${c} = ${a}x + ${b}`, `${a}x + ${b} ${signed(shift)} = ${c + shift}`, `${2 * a}x + ${2 * b} = ${2 * c}`, `${a}x ${signed(b - c)} = 0`, `${a}x = ${c} ${signed(-b)} = ${c - b}`, `x = ${root} = ${root}`, `x = ${root + shift} ${signed(-shift)} = ${root}`, `${a}x + ${b} = ${c} = ${c}`],
    falseSteps: [
      `${a}x = ${c + b}`,
      `x = ${root + shift}`,
      `${a}x + ${b} = ${c + shift}`,
      `${a}x = ${c}`,
      ...(root === 0 ? [] : [`x = ${c - b}`]),
      `${a}x + ${b} ${signed(shift)} = ${c - shift}`,
      `${a}x = ${c} ${signed(b)} = ${c + b}`,
      `x = ${root + shift} = ${root + shift}`,
      `x = ${root} ${signed(shift)} = ${root + shift}`,
      `${a}x = ${c - b} = ${c - b + shift}`,
      `x = ${root} = ${root + shift}`,
      `${a}x + ${b} = ${c} = ${c + shift}`,
    ],
  };
}

// The truth is whole number arithmetic here too, and a whole joined to its top, as 31/2 for 3 1/2, is one of the false steps.
function makeMixedNumber(random: (below: number) => number) {
  const bottom = 2 + random(8);
  const top = 1 + random(bottom - 1);
  const whole = 1 + random(9);
  const [sign, otherSign] = random(2) === 0 ? ['', '-'] : ['-', ''];
  const total = whole * bottom + top;
  const written = `${whole} ${top}/${bottom}`;
  return {
    problem: `${bottom}x = ${sign}${total}`,
    trueSteps: [`x = ${sign}${written}`, `${sign}${written} = x`, `x = ${sign}${total}/${bottom} = ${sign}${written}`],
    falseSteps: [`x = ${sign}${whole + 1} ${top}/${bottom}`, `x = ${otherSign}${written}`, `x = ${sign}${whole}${top}/${bottom}`, `x = ${sign}${total}/${bottom} = ${sign}${whole + 1} ${top}/${bottom}`],
  };
}

function getLineStatus(typed: string) {
  return checkWork({ way: 'write', id: 's1' as ElementId, text: typed }, { task: null, getLineTex: () => null, getCurve: () => null, previousTex: null, pickedRight: [] }).verdict.status;
}

// The truth is whole number arithmetic on the fraction, so this cannot share a mistake with the checker.
function makeRoundings(random: (below: number) => number) {
  const bottom = 3 + random(15);
  const top = 1 + random(40);
  const places = 2 + random(2);
  const scale = 10 ** places;
  const nearestUp = Math.floor((top * scale * 2 + bottom) / (bottom * 2));
  const write = (units: number) => `${top}/${bottom} = ${(units / scale).toFixed(places)}`;
  const isExact = nearestUp * bottom === top * scale;
  return { right: write(nearestUp), offByTwoUnits: [write(nearestUp + 2), write(nearestUp - 2)], offByOneUnit: isExact ? [] : [write(nearestUp + 1), write(nearestUp - 1)] };
}

describe('generated roundings', () => {
  it('holds over 3000 fractions: the nearest rounding is ticked and no other is', () => {
    const random = createRandom(29);
    const seen: string[] = [];
    let ticked = 0;
    for (let index = 0; index < 3000; index += 1) {
      const { right, offByOneUnit, offByTwoUnits } = makeRoundings(random);
      if (getLineStatus(right) === 'right') ticked += 1;
      else seen.push(`not ticked: ${right}`);
      for (const typed of [...offByOneUnit, ...offByTwoUnits]) if (getLineStatus(typed) === 'right') seen.push(`ticked: ${typed}`);
    }
    expect(seen.slice(0, 12)).toEqual([]);
    expect(ticked).toBe(3000);
  }, 60_000);
});

// CI proves this fixed seeded sample, and `pnpm --filter @astra/board test:steps` proves all 3,000 problems, for a nightly or local run.
const STEP_PROBLEMS = Number(process.env.STEP_PROBLEMS ?? 300);
const STEP_LIMIT_MS = Math.max(60_000, STEP_PROBLEMS * 100);

function holdSteps(seed: number, make: (random: (below: number) => number) => { problem: string; trueSteps: string[]; falseSteps: string[] }) {
  const random = createRandom(seed);
  const tally = { trueRight: 0, trueUnknown: 0, trueWrong: 0, falseWrong: 0, falseUnknown: 0, falseRight: 0 };
  const seen: string[] = [];
  for (let index = 0; index < STEP_PROBLEMS; index += 1) {
    const { problem, trueSteps, falseSteps } = make(random);
    const problemTex = getLineTex(readLine(problem));
    for (const typed of trueSteps) {
      const status = getStatus(problemTex, typed);
      tally[status === 'right' ? 'trueRight' : status === 'wrong' ? 'trueWrong' : 'trueUnknown'] += 1;
      if (status === 'wrong') seen.push(`${problem} -> ${typed}`);
    }
    for (const typed of falseSteps) {
      const status = getStatus(problemTex, typed);
      tally[status === 'right' ? 'falseRight' : status === 'wrong' ? 'falseWrong' : 'falseUnknown'] += 1;
      if (status === 'right') seen.push(`${problem} -> ${typed}`);
    }
  }
  console.log(JSON.stringify(tally), seen.slice(0, 12));
  expect(tally.trueWrong).toBe(0);
  expect(tally.falseRight).toBe(0);
  return tally;
}

describe('generated steps', () => {
  it(`holds over ${STEP_PROBLEMS} problems: no true step is wrong, no false step is right`, () => {
    holdSteps(71, makeProblem);
  }, STEP_LIMIT_MS);

  it(`holds over ${STEP_PROBLEMS} mixed numbers: each true step is right, no false step is right`, () => {
    const { trueUnknown } = holdSteps(73, makeMixedNumber);
    expect(trueUnknown).toBe(0);
  }, STEP_LIMIT_MS);
});
