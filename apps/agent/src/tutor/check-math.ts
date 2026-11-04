import { getMathParts, getTexTokens, type TexToken } from '@astra/contracts';

export type MathVerdict = { status: 'right' } | { status: 'wrong'; why: string } | { status: 'cannotCheck' };

type Scope = Readonly<Record<string, number>>;

interface MathValue {
  evaluate(scope: Scope): number;
  variables: ReadonlySet<string>;
}

class CannotRead extends Error {}

const FIXED_VALUES: ReadonlyMap<string, number> = new Map([['\\pi', Math.PI]]);
// Sine and friends stay out, because \sin 30 is 0.5 only in degrees, and a line does not say which it means.
const FUNCTIONS: ReadonlyMap<string, (value: number) => number> = new Map([
  ['\\ln', Math.log],
  ['\\log', Math.log10],
  ['\\exp', Math.exp],
]);
const GREEK_VARIABLE = /^\\(alpha|beta|gamma|delta|theta|lambda|mu|omega|phi|rho|sigma|tau)$/;
const SKIPPED = new Set(['\\left', '\\right', '\\,', '\\;', '\\:', '\\!', '\\ ', '\\displaystyle', '\\quad', '\\qquad']);
const TIMES = new Set(['*', '\\times', '\\cdot']);
const DIVIDE = new Set(['/', '\\div']);
const OPENING: ReadonlyMap<string, string> = new Map([['(', ')'], ['[', ']'], ['{', '}']]);

const SAMPLE_COUNT = 12;
const SAME_VALUE = 1e-6;
const SOLUTION_RANGE = 60;
const SOLUTION_STEP = 0.05;
const SOLUTION_BISECTIONS = 60;
const ROUGHLY_RATIO = 0.02;

const union = (...sets: readonly ReadonlySet<string>[]): ReadonlySet<string> => new Set(sets.flatMap((set) => [...set]));
const constant = (value: number): MathValue => ({ evaluate: () => value, variables: new Set() });
const variable = (name: string): MathValue => ({ evaluate: (scope) => scope[name] ?? Number.NaN, variables: new Set([name]) });
const combine = (left: MathValue, right: MathValue, apply: (a: number, b: number) => number): MathValue => ({ evaluate: (scope) => apply(left.evaluate(scope), right.evaluate(scope)), variables: union(left.variables, right.variables) });

// Refuses notation it does not know, so unknown TeX reads as "cannot check" and never as a false verdict.
function createMathParser(tokens: readonly string[]) {
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const expect = (token: string) => {
    if (next() !== token) throw new CannotRead();
  };

  const readGroup = (): MathValue => {
    expect('{');
    const value = readSum();
    expect('}');
    return value;
  };

  function readSum(): MathValue {
    let value = readProduct();
    for (let token = peek(); token === '+' || token === '-'; token = peek()) {
      next();
      const right = readProduct();
      value = combine(value, right, token === '+' ? (a, b) => a + b : (a, b) => a - b);
    }
    return value;
  }

  const startsFactor = (token: string | undefined) => token !== undefined && (/^[\dA-Za-z(]/.test(token) || token.startsWith('\\')) && !TIMES.has(token) && !DIVIDE.has(token);

  function readProduct(): MathValue {
    let value = readSigned();
    for (let token = peek(); TIMES.has(token ?? '') || DIVIDE.has(token ?? '') || startsFactor(token); token = peek()) {
      const isDivide = DIVIDE.has(token as string);
      if (TIMES.has(token as string) || isDivide) next();
      const right = readSigned();
      value = combine(value, right, isDivide ? (a, b) => a / b : (a, b) => a * b);
    }
    return value;
  }

  function readSigned(): MathValue {
    if (peek() === '-') {
      next();
      return combine(constant(0), readSigned(), (_zero, value) => -value);
    }
    if (peek() === '+') next();
    return readPower();
  }

  function readPower(): MathValue {
    const base = readAtom();
    if (peek() !== '^') return base;
    next();
    const power = peek() === '{' ? readGroup() : readAtom();
    return combine(base, power, Math.pow);
  }

  const readRoot = (): MathValue => {
    if (peek() !== '[') return combine(readGroup(), constant(0.5), Math.pow);
    next();
    const degree = readSum();
    expect(']');
    return combine(readGroup(), degree, (value, root) => value ** (1 / root));
  };

  function readAtom(): MathValue {
    const token = next();
    if (token === undefined) throw new CannotRead();
    if (/^\d/.test(token)) return constant(Number(token));
    if (/^[A-Za-z]$/.test(token) || GREEK_VARIABLE.test(token)) return readVariable(token);
    const fixed = FIXED_VALUES.get(token);
    if (fixed !== undefined) return constant(fixed);
    const apply = FUNCTIONS.get(token);
    if (apply) return combine(readPower(), constant(0), (value) => apply(value));
    if (FRACTIONS.has(token)) return combine(readGroup(), readGroup(), (a, b) => a / b);
    if (token === '\\sqrt') return readRoot();
    const closing = OPENING.get(token);
    if (closing === undefined) throw new CannotRead();
    const inner = readSum();
    expect(closing);
    return inner;
  }

  function readVariable(token: string): MathValue {
    if (peek() !== '_') return variable(token);
    next();
    const subscript = next();
    if (subscript !== '{') return variable(`${token}_${subscript}`);
    const parts: string[] = [];
    for (let part = next(); part !== '}'; part = next()) {
      if (part === undefined) throw new CannotRead();
      parts.push(part);
    }
    return variable(`${token}_${parts.join('')}`);
  }

  return {
    readWhole() {
      const value = readSum();
      if (position !== tokens.length) throw new CannotRead();
      return value;
    },
  };
}

const FRACTIONS: ReadonlySet<string> = new Set(['\\frac', '\\dfrac', '\\tfrac']);

const getValueTokens = (tex: string) => getTexTokens(tex).map((token: TexToken) => token.text).filter((text) => !SKIPPED.has(text));

// 2\frac{1}{2} is two and a half to a student and two times a half to a parser, so it is not judged.
const hasMixedNumber = (tokens: readonly string[]) => tokens.some((token, index) => /^\d/.test(token) && FRACTIONS.has(tokens[index + 1] ?? ''));

function readValue(tex: string): MathValue | null {
  const tokens = getValueTokens(tex);
  if (hasMixedNumber(tokens)) return null;
  try {
    return createMathParser(tokens).readWhole();
  } catch (error) {
    if (error instanceof CannotRead) return null;
    throw error;
  }
}

interface MathStatement {
  sides: { tex: string; value: MathValue | null }[];
  relations: string[];
}

function readStatement(tex: string): MathStatement {
  const parts = getMathParts(tex);
  const sides: string[][] = [[]];
  const relations: string[] = [];
  for (const part of parts) {
    if (part.role === 'relation') {
      relations.push(part.tex);
      sides.push([]);
    } else {
      (sides.at(-1) as string[]).push(part.tex);
    }
  }
  return { sides: sides.map((side) => ({ tex: side.join(' '), value: side.length === 0 ? null : readValue(side.join(' ')) })), relations };
}

const DECIMAL_NUMBER = /^-?\d+\.(\d+)$/;

// A bare decimal like 0.33 only claims as many places as it shows.
function getRoundingAllowance(side: { tex: string }): number {
  const places = DECIMAL_NUMBER.exec(side.tex.trim())?.[1]?.length;
  return places === undefined ? 0 : 0.5 * 10 ** -places + SAME_VALUE;
}

function getNumberProblem(left: MathStatement['sides'][number], right: MathStatement['sides'][number], relation: string): string | null {
  if (!left.value || !right.value || left.value.variables.size > 0 || right.value.variables.size > 0) return null;
  const [leftValue, rightValue] = [left.value.evaluate({}), right.value.evaluate({})];
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
  const allowed = Math.max(SAME_VALUE, getRoundingAllowance(left), getRoundingAllowance(right));
  const isRough = relation === '\\approx' && Math.abs(leftValue - rightValue) <= Math.abs(rightValue) * ROUGHLY_RATIO;
  return Math.abs(leftValue - rightValue) <= allowed || isRough ? null : `${left.tex} is ${leftValue}, not ${rightValue}`;
}

// A line with letters is an equation, which only a rewrite can test.
export function checkMathLine(tex: string): MathVerdict {
  const { sides, relations } = readStatement(tex);
  if (relations.length === 0) return { status: 'cannotCheck' };
  let wasChecked = false;
  for (const [index, relation] of relations.entries()) {
    if (relation !== '=' && relation !== '\\approx') continue;
    const [left, right] = [sides[index], sides[index + 1]];
    if (!left || !right) continue;
    const problem = getNumberProblem(left, right, relation);
    if (problem) return { status: 'wrong', why: problem };
    if (left.value?.variables.size === 0 && right.value?.variables.size === 0) wasChecked = true;
  }
  return wasChecked ? { status: 'right' } : { status: 'cannotCheck' };
}

function getSamples(variables: readonly string[]): Scope[] {
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => Object.fromEntries(variables.map((name, offset) => [name, -3.7 + index * 0.83 + offset * 1.91])));
}

function getRoots(gap: (x: number) => number): number[] {
  const roots: number[] = [];
  let lastX = -SOLUTION_RANGE;
  let lastGap = gap(lastX);
  for (let x = lastX + SOLUTION_STEP; x <= SOLUTION_RANGE; x += SOLUTION_STEP) {
    const value = gap(x);
    if (Number.isFinite(value) && Number.isFinite(lastGap) && value * lastGap <= 0 && Math.abs(value - lastGap) < 1e3) {
      let [low, high] = [lastX, x];
      for (let step = 0; step < SOLUTION_BISECTIONS; step += 1) {
        const middle = (low + high) / 2;
        if (gap(low) * gap(middle) <= 0) high = middle;
        else low = middle;
      }
      const root = (low + high) / 2;
      if (!roots.some((other) => Math.abs(other - root) < SOLUTION_STEP)) roots.push(root);
    }
    lastX = x;
    lastGap = value;
  }
  return roots;
}

const sameRoots = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((root, index) => Math.abs(root - (b[index] as number)) < 1e-4);

interface Gap {
  evaluate(scope: Scope): number;
  variables: ReadonlySet<string>;
}

function readGap(tex: string): { kind: 'equation' | 'expression'; gap: Gap } | null {
  const { sides, relations } = readStatement(tex);
  if (relations.length === 0 && sides[0]?.value) return { kind: 'expression', gap: sides[0].value };
  if (relations.length !== 1 || relations[0] !== '=' || !sides[0]?.value || !sides[1]?.value) return null;
  return { kind: 'equation', gap: combine(sides[0].value, sides[1].value, (a, b) => a - b) };
}

const hasSameLetters = (before: Gap, after: Gap) => before.variables.size === after.variables.size && [...before.variables].every((name) => after.variables.has(name));

function checkSameExpression(before: Gap, after: Gap, samples: readonly Scope[], tex: string): MathVerdict {
  const isSame = samples.every((scope) => Math.abs(before.evaluate(scope) - after.evaluate(scope)) < SAME_VALUE);
  return isSame ? { status: 'right' } : { status: 'wrong', why: `${tex} is not equal to the line before it` };
}

function checkSameEquation(before: Gap, after: Gap, samples: readonly Scope[], tex: string): MathVerdict {
  const pairs = samples.map((scope) => [before.evaluate(scope), after.evaluate(scope)] as const).filter(([, afterGap]) => Math.abs(afterGap) > 1e-9);
  const firstRatio = pairs[0] ? pairs[0][0] / pairs[0][1] : 0;
  if (pairs.length > 0 && Math.abs(firstRatio) > 1e-9 && pairs.every(([a, b]) => Math.abs(a / b - firstRatio) < SAME_VALUE)) return { status: 'right' };
  const variables = [...union(before.variables, after.variables)];
  if (variables.length !== 1) return { status: 'cannotCheck' };
  const name = variables[0] as string;
  const roots = (gap: Gap) => getRoots((x) => gap.evaluate({ [name]: x }));
  return sameRoots(roots(before), roots(after)) ? { status: 'right' } : { status: 'wrong', why: `${tex} does not follow from the line before it` };
}

export function checkMathStep(beforeTex: string, afterTex: string): MathVerdict {
  const lineVerdict = checkMathLine(afterTex);
  if (lineVerdict.status === 'wrong') return lineVerdict;
  const [before, after] = [readGap(beforeTex), readGap(afterTex)];
  // Putting in a value changes the letters, as x^2 to 4 does, and that is not a rewrite of the same line.
  if (!before || !after || before.kind !== after.kind || !hasSameLetters(before.gap, after.gap)) return lineVerdict;
  const samples = getSamples([...union(before.gap.variables, after.gap.variables)]);
  return before.kind === 'expression' ? checkSameExpression(before.gap, after.gap, samples, afterTex) : checkSameEquation(before.gap, after.gap, samples, afterTex);
}
