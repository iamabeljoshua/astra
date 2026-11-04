import { getMathParts, getTexTokens, type MathClaim, type WorkVerdict } from '@astra/contracts';
import { areSameFraction, type Fraction, getNumberValue, isPolynomial, type NumberValue, subtractFractions, toFloatValue, toFraction } from './math/math-value.ts';
import { getLetters, type MathExpression, parseMath } from './math/parse-math.ts';
import { areProportional, divides, getCoefficient, getCommonDivisor, getDegree, getLinearRoot, getWithSingleRoots, type OneLetterPolynomial, toOneLetter } from './math/polynomial.ts';
import { compareRationals, describeRational, divideRationals, getAbsolute, getExactPlaces, isSameRational, makeRational, multiplyRationals, type Rational, readDecimal, subtractRationals, toFloat } from './math/rational.ts';

/**
 * What code knows about a line of math. `wrong` means code is certain the line is false, and only `wrong` stops the tutor. `right` means code proved it. `unknown` is everything else, and it is never treated as doubt.
 */
export type MathVerdict = WorkVerdict;

const RIGHT: MathVerdict = { status: 'right' };
const UNKNOWN: MathVerdict = { status: 'unknown' };
const wrong = (why: string): MathVerdict => ({ status: 'wrong', why });

const SAME_FLOAT = 1e-9;
const BARE_DECIMAL = /^-?\s*\d+\.(\d+)$/;
/** log may mean base 10 or base e, so a value that looks off may still be right. */
const MAY_BE_ANOTHER_BASE = /\\log/;
/** A rounded answer whose exact form also ends is only trusted when it is this close. 1/8 = 0.13 is, and 0.5 x 0.1 = 0.1 is not. */
const LARGEST_ROUNDING_SHARE = makeRational(1n, 20n);
/** Numbers this far apart in size are never a rounding of each other, whatever the rounding. */
const ABSURD_RATIO = 10;
const HALF = makeRational(1n, 2n);
/** Rounding to one place is a real rounding and often only a rough one, as 1/6 = 0.2 is, so it gets neither a tick nor a cross. */
const FEWEST_PLACES_TO_PROVE = 2;

const INEQUALITIES: Readonly<Record<string, (order: number) => boolean>> = {
  '<': (order) => order < 0,
  '>': (order) => order > 0,
  '\\le': (order) => order <= 0,
  '\\leq': (order) => order <= 0,
  '\\ge': (order) => order >= 0,
  '\\geq': (order) => order >= 0,
  '\\ne': (order) => order !== 0,
  '\\neq': (order) => order !== 0,
};

interface MathSide {
  tex: string;
  expression: MathExpression | null;
}

interface MathStatement {
  sides: readonly MathSide[];
  relations: readonly string[];
}

function readStatement(tex: string): MathStatement {
  const sides: string[][] = [[]];
  const relations: string[] = [];
  for (const part of getMathParts(tex)) {
    if (part.role === 'relation') {
      relations.push(part.tex);
      sides.push([]);
    } else {
      (sides.at(-1) as string[]).push(part.tex);
    }
  }
  return { sides: sides.map((side) => ({ tex: side.join(' '), expression: side.length === 0 ? null : parseMath(side.join(' ')) })), relations };
}

const getBareDecimalPlaces = (tex: string) => BARE_DECIMAL.exec(tex.trim())?.[1]?.length ?? 0;

const getOneUnitInPlace = (places: number) => makeRational(1n, 10n ** BigInt(places));

// A student's rounding is right only within half a unit in its last place, and a tie rounds up, as school teaches, so 1/8 is 0.13 and not 0.12. A number whose decimals end has a right answer, so its rounding must also stay close.
function isPossibleRounding(exact: Rational, written: Rational, places: number): boolean {
  if (places === 0) return false;
  const writtenPlaces = getExactPlaces(written);
  if (writtenPlaces === null || writtenPlaces > places) return true;
  const exactPlaces = getExactPlaces(exact);
  if (exactPlaces !== null && exactPlaces <= places) return false;
  const gap = getAbsolute(subtractRationals(exact, written));
  const order = compareRationals(gap, multiplyRationals(getOneUnitInPlace(places), HALF));
  if (order > 0 || (order === 0 && compareRationals(getAbsolute(written), getAbsolute(exact)) < 0)) return false;
  return exactPlaces === null || compareRationals(gap, multiplyRationals(getAbsolute(exact), LARGEST_ROUNDING_SHARE)) <= 0;
}

function isAbsurdlyFar(left: number, right: number): boolean {
  if (left === 0 || right === 0) return false;
  const [small, large] = [Math.min(Math.abs(left), Math.abs(right)), Math.max(Math.abs(left), Math.abs(right))];
  return left * right < 0 ? large >= 1 : large / small >= ABSURD_RATIO;
}

const describeFloat = (value: number) => String(Number(value.toFixed(4)));

function describeValue(value: NumberValue & { kind: 'exact' | 'real' }): string {
  return value.kind === 'exact' ? describeRational(value.value) : describeFloat(value.value);
}

function checkExactEquals(left: MathSide, right: MathSide, a: Rational, b: Rational): MathVerdict {
  if (isSameRational(a, b)) return RIGHT;
  const [leftPlaces, rightPlaces] = [getBareDecimalPlaces(left.tex), getBareDecimalPlaces(right.tex)];
  const isRounded = isPossibleRounding(a, b, rightPlaces) || isPossibleRounding(b, a, leftPlaces);
  if (!isRounded) return wrong(`${left.tex} is ${describeRational(a)}, not ${describeRational(b)}`);
  return Math.max(leftPlaces, rightPlaces) >= FEWEST_PLACES_TO_PROVE ? RIGHT : UNKNOWN;
}

function checkFloatEquals(left: MathSide, right: MathSide, a: number, b: number): MathVerdict {
  const places = Math.max(getBareDecimalPlaces(left.tex), getBareDecimalPlaces(right.tex));
  const gap = Math.abs(a - b);
  if (gap <= SAME_FLOAT) return RIGHT;
  if (places > 0 && gap <= 10 ** -places / 2) return places >= FEWEST_PLACES_TO_PROVE ? RIGHT : UNKNOWN;
  const isClaimedRounding = places > 0 && !MAY_BE_ANOTHER_BASE.test(left.tex + right.tex);
  return isClaimedRounding || isAbsurdlyFar(a, b) ? wrong(`${left.tex} is ${describeFloat(a)}, not ${describeFloat(b)}`) : UNKNOWN;
}

type DefinedValue = NumberValue & { kind: 'exact' | 'real' };

function checkEquals(left: MathSide, right: MathSide, a: DefinedValue, b: DefinedValue): MathVerdict {
  if (a.kind === 'exact' && b.kind === 'exact') return checkExactEquals(left, right, a.value, b.value);
  return checkFloatEquals(left, right, toFloatValue(a), toFloatValue(b));
}

function checkInequality(relation: string, left: MathSide, right: MathSide, a: DefinedValue, b: DefinedValue): MathVerdict {
  const order = a.kind === 'exact' && b.kind === 'exact' ? compareRationals(a.value, b.value) : Math.abs(toFloatValue(a) - toFloatValue(b)) <= SAME_FLOAT ? 0 : Math.sign(toFloatValue(a) - toFloatValue(b));
  return INEQUALITIES[relation]?.(order) ? RIGHT : wrong(`${left.tex} is ${describeValue(a)}, and ${right.tex} is ${describeValue(b)}`);
}

function checkDefined(relation: string, left: MathSide, right: MathSide, a: DefinedValue, b: DefinedValue): MathVerdict {
  if (relation === '=') return checkEquals(left, right, a, b);
  if (relation === '\\approx') return isAbsurdlyFar(toFloatValue(a), toFloatValue(b)) ? wrong(`${left.tex} is ${describeValue(a)}, nowhere near ${describeValue(b)}`) : UNKNOWN;
  return relation in INEQUALITIES ? checkInequality(relation, left, right, a, b) : UNKNOWN;
}

const isDefined = (value: NumberValue): value is DefinedValue => value.kind === 'exact' || value.kind === 'real';

function checkNumbers(relation: string, left: MathSide, right: MathSide): MathVerdict {
  if (!left.expression || !right.expression || getLetters(left.expression).size > 0 || getLetters(right.expression).size > 0) return UNKNOWN;
  const [a, b] = [getNumberValue(left.expression), getNumberValue(right.expression)];
  if (a.kind === 'open' || b.kind === 'open') return UNKNOWN;
  if (isDefined(a) && isDefined(b)) return checkDefined(relation, left, right, a, b);
  if (a.kind === 'undefined' && b.kind === 'undefined') return UNKNOWN;
  if (relation !== '=' && relation !== '\\approx') return UNKNOWN;
  const [notDefined, other] = a.kind === 'undefined' ? [left, right] : [right, left];
  return wrong(`${notDefined.tex} is not defined, so it cannot equal ${other.tex}`);
}

/** A line with letters is an equation, and only a rewrite can test it. */
export function checkMathLine(tex: string): MathVerdict {
  const { sides, relations } = readStatement(tex);
  const verdicts = relations.map((relation, index) => checkNumbers(relation, sides[index] as MathSide, sides[index + 1] as MathSide));
  return combineVerdicts(verdicts);
}

// A line is proved only when every relation in it is, so one true link never covers one code cannot read.
function combineVerdicts(verdicts: readonly MathVerdict[]): MathVerdict {
  const firstWrong = verdicts.find((verdict) => verdict.status === 'wrong');
  if (firstWrong) return firstWrong;
  return verdicts.length > 0 && verdicts.every((verdict) => verdict.status === 'right') ? RIGHT : UNKNOWN;
}

interface Rewrite {
  kind: 'equation' | 'expression';
  tex: string;
  symbols: ReadonlySet<string>;
  letters: ReadonlySet<string>;
  value: Fraction | null;
  numbers: NumberValue;
  places: number;
}

const PI_NAME = '\\pi';

const getDecimalPlacesIn = (tex: string) => Math.max(0, ...getTexTokens(tex).map(({ text }) => /^\d+\.(\d+)$/.exec(text)?.[1]?.length ?? 0));

const hasPi = (tex: string) => getTexTokens(tex).some(({ text }) => text === PI_NAME);

function makeRewrite(kind: Rewrite['kind'], tex: string, expressions: readonly MathExpression[]): Rewrite {
  const letters = new Set(expressions.flatMap((expression) => [...getLetters(expression)]));
  const values = expressions.map(toFraction);
  const [first, second] = values;
  const value = kind === 'expression' ? (first ?? null) : first && second ? subtractFractions(first, second) : null;
  return { kind, tex, letters, symbols: hasPi(tex) ? new Set([...letters, PI_NAME]) : letters, value, numbers: getNumberValue(expressions[0] as MathExpression), places: getDecimalPlacesIn(tex) };
}

function readRewrite(tex: string): Rewrite | null {
  const { sides, relations } = readStatement(tex);
  const [left, right] = sides;
  if (relations.length === 0 && left?.expression) return makeRewrite('expression', tex, [left.expression]);
  if (relations.length !== 1 || relations[0] !== '=' || !left?.expression || !right?.expression) return null;
  return makeRewrite('equation', tex, [left.expression, right.expression]);
}

const isSameSet = (left: ReadonlySet<string>, right: ReadonlySet<string>) => left.size === right.size && [...left].every((item) => right.has(item));

const doesNotFollow = ({ tex }: Rewrite, before: Rewrite) => wrong(`${tex} does not follow from ${before.tex}`);

// Rewriting to a line that still holds an operation may be an estimate, as 47 x 52 to 50 x 50 is. A bare number is a claim of the answer.
function checkNumberRewrite(before: Rewrite, after: Rewrite): MathVerdict {
  const [a, b] = [before.numbers, after.numbers];
  if (!isDefined(a) || !isDefined(b)) return UNKNOWN;
  const isBareNumber = readDecimal(after.tex.trim()) !== null || /^-\s*\d/.test(after.tex.trim());
  const verdict = checkEquals({ tex: before.tex, expression: null }, { tex: after.tex, expression: null }, a, b);
  if (verdict.status !== 'wrong' || isBareNumber) return verdict;
  return isAbsurdlyFar(toFloatValue(a), toFloatValue(b)) ? verdict : UNKNOWN;
}

const getTermOf = ({ top, bottom }: Fraction, monomial: string) => divideRationals(getCoefficient(top, monomial), getCoefficient(bottom, ''));

// Rounds a coefficient, as x/3 to 0.33x does, which is not the same line and is not false.
function isRoundedCoefficients(before: Fraction, after: Fraction, places: number): boolean {
  if (!isPolynomial(before) || !isPolynomial(after)) return false;
  const monomials = new Set([...before.top.keys(), ...after.top.keys()]);
  return [...monomials].every((monomial) => {
    const [exact, written] = [getTermOf(before, monomial), getTermOf(after, monomial)];
    return isSameRational(exact, written) || isPossibleRounding(exact, written, places);
  });
}

function checkExpressionRewrite(before: Rewrite, after: Rewrite): MathVerdict {
  const [a, b] = [before.value, after.value];
  if (!a || !b) return UNKNOWN;
  if (areSameFraction(a, b)) return RIGHT;
  return isRoundedCoefficients(a, b, after.places) ? UNKNOWN : doesNotFollow(after, before);
}

type SolutionSet = { kind: 'everything' } | { kind: 'nothing' } | { kind: 'one'; root: Rational };

function getLinearSolutions(gap: OneLetterPolynomial): SolutionSet {
  const degree = getDegree(gap);
  if (degree < 0) return { kind: 'everything' };
  return degree === 0 ? { kind: 'nothing' } : { kind: 'one', root: getLinearRoot(gap) };
}

function checkLinearEquations(before: Rewrite, after: Rewrite, beforeGap: OneLetterPolynomial, afterGap: OneLetterPolynomial): MathVerdict {
  const [was, now] = [getLinearSolutions(beforeGap), getLinearSolutions(afterGap)];
  if (was.kind !== 'one') return UNKNOWN;
  if (now.kind === 'everything') return UNKNOWN;
  if (now.kind === 'nothing') return doesNotFollow(after, before);
  if (isSameRational(was.root, now.root)) return RIGHT;
  const isRounded = isPossibleRounding(was.root, now.root, after.places) || isPossibleRounding(now.root, was.root, before.places);
  return isRounded ? UNKNOWN : doesNotFollow(after, before);
}

// A step need only hold one way, so c^2 = 25 to c = 5 and x = 3 to x^2 = 9 are both fine. It is false only when neither line's roots all solve the other.
function checkPolynomialEquations(before: Rewrite, after: Rewrite, beforeGap: OneLetterPolynomial, afterGap: OneLetterPolynomial): MathVerdict {
  if (before.places > 0 || after.places > 0) return UNKNOWN;
  if (getDegree(beforeGap) <= 0 || getDegree(afterGap) <= 0) return UNKNOWN;
  if (divides(getWithSingleRoots(beforeGap), afterGap) || divides(getWithSingleRoots(afterGap), beforeGap)) return UNKNOWN;
  const shareNoRoot = getDegree(getCommonDivisor(beforeGap, afterGap)) === 0;
  return shareNoRoot || getDegree(beforeGap) === getDegree(afterGap) ? doesNotFollow(after, before) : UNKNOWN;
}

function checkEquationRewrite(before: Rewrite, after: Rewrite): MathVerdict {
  const [a, b] = [before.value, after.value];
  if (!a || !b) return UNKNOWN;
  const [letter] = before.symbols;
  if (!isPolynomial(a) || !isPolynomial(b) || before.symbols.size !== 1 || letter === undefined) return UNKNOWN;
  const [beforeGap, afterGap] = [toOneLetter(a.top, letter), toOneLetter(b.top, letter)];
  return getDegree(beforeGap) <= 1 && getDegree(afterGap) <= 1 ? checkLinearEquations(before, after, beforeGap, afterGap) : checkPolynomialEquations(before, after, beforeGap, afterGap);
}

const isSameEquation = (before: Rewrite, after: Rewrite) => before.kind === 'equation' && after.kind === 'equation' && before.letters.size > 0 && before.value !== null && after.value !== null && areProportional(before.value.top, after.value.top);

function checkRewrite(before: Rewrite, after: Rewrite): MathVerdict {
  if (before.kind !== after.kind || !isSameSet(before.symbols, after.symbols)) return UNKNOWN;
  if (before.letters.size === 0) return before.kind === 'expression' ? checkNumberRewrite(before, after) : UNKNOWN;
  return before.kind === 'expression' ? checkExpressionRewrite(before, after) : checkEquationRewrite(before, after);
}

/** The links of a chain of equals, or the line itself if it is not one, so 2x = 11 + 3 = 14 is 2x = 11 + 3 and 11 + 3 = 14. */
export function getChainLinks(tex: string): readonly string[] {
  const { sides, relations } = readStatement(tex);
  if (relations.length < 2 || relations.some((relation) => relation !== '=')) return [tex];
  return relations.map((_, index) => `${(sides[index] as MathSide).tex} = ${(sides[index + 1] as MathSide).tex}`);
}

const isIdentity = (rewrite: Rewrite | null) => rewrite?.kind === 'equation' && rewrite.letters.size > 0 && rewrite.value !== null && isPolynomial(rewrite.value) && rewrite.value.top.size === 0;

// x + 1 = x + 2 to 1 = 2 is how a lesson shows there is no solution, so the same equation wins over a false-looking line.
function checkOneStep(beforeTex: string, afterTex: string): MathVerdict {
  const [before, after] = [readRewrite(beforeTex), readRewrite(afterTex)];
  if (isIdentity(after)) return RIGHT;
  if (before && after && isSameEquation(before, after)) return RIGHT;
  const lineVerdict = checkMathLine(afterTex);
  if (lineVerdict.status === 'wrong') return lineVerdict;
  const rewriteVerdict = before && after ? checkRewrite(before, after) : UNKNOWN;
  return rewriteVerdict.status === 'unknown' ? lineVerdict : rewriteVerdict;
}

export function checkMathStep(beforeTex: string, afterTex: string): MathVerdict {
  return combineVerdicts(getChainLinks(afterTex).map((link) => checkOneStep(beforeTex, link)));
}

const isWithinLastDigit = (gap: number, places: number) => places > 0 && Math.abs(gap) <= 10 ** -places + SAME_FLOAT;

function getRootOf({ value, symbols }: Rewrite): number | null {
  const [letter] = symbols;
  if (!value || !isPolynomial(value) || symbols.size !== 1 || letter === undefined) return null;
  const gap = toOneLetter(value.top, letter);
  return getDegree(gap) === 1 ? toFloat(getLinearRoot(gap)) : null;
}

/** A last digit off by one may be cut short and not rounded, as 0.66 for 2/3 is. A student is not crossed for it, and the tutor is held to the rounding. */
export function isLastDigitSlip(beforeTex: string, tex: string): boolean {
  const [before, after] = [readRewrite(beforeTex), readRewrite(tex)];
  if (!after || after.kind !== 'equation') return false;
  if (after.letters.size === 0) {
    const [left, right] = readStatement(tex).sides.map(({ expression }) => (expression ? getNumberValue(expression) : null));
    return !!left && !!right && isDefined(left) && isDefined(right) && isWithinLastDigit(toFloatValue(left) - toFloatValue(right), after.places);
  }
  const [was, now] = [before && getRootOf(before), getRootOf(after)];
  return was !== null && now !== null && isWithinLastDigit(was - now, after.places);
}

// A line that follows another need not follow from it, as a derivative, a new problem, and a student's wrong line all show, so code judges only what the line says it is. No claim means no check.
export function checkClaimedMath(claim: MathClaim | undefined, before: string | undefined, tex: string): MathVerdict {
  if (claim === 'step') return before === undefined ? checkMathLine(tex) : checkMathStep(before, tex);
  return claim === 'new' ? checkMathLine(tex) : UNKNOWN;
}
