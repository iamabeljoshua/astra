import type { MathExpression } from './parse-math.ts';
import { addPolynomials, CONSTANT_ONE, isConstantPolynomial, makeConstant, makeLetter, multiplyPolynomials, negatePolynomial, type Polynomial, PolynomialTooLarge, raisePolynomial, subtractPolynomials } from './polynomial.ts';
import { addRationals, compareRationals, divideRationals, getAbsolute, getExactRoot, invertRational, isZero, multiplyRationals, negateRational, type Rational, raiseToWhole, subtractRationals, toFloat, ZERO } from './rational.ts';

/**
 * What a line with no letters comes to. `exact` is proved, `real` is a float for roots and pi, `undefined` is a defined false claim like 1/0, and `open` is what no verdict should rest on, like 0^0.
 */
export type NumberValue = { kind: 'exact'; value: Rational } | { kind: 'real'; value: number } | { kind: 'undefined' } | { kind: 'open' };

const OPEN: NumberValue = { kind: 'open' };
const UNDEFINED: NumberValue = { kind: 'undefined' };
const LARGEST_EXACT_POWER = 256;
const MOST_DIGITS = 2000;
const LARGEST_POLYNOMIAL_POWER = 32;

const exact = (value: Rational): NumberValue => (value.numerator.toString().length > MOST_DIGITS || value.denominator.toString().length > MOST_DIGITS ? OPEN : { kind: 'exact', value });

const real = (value: number): NumberValue => (Number.isFinite(value) ? { kind: 'real', value } : OPEN);

export const toFloatValue = (value: NumberValue & { kind: 'exact' | 'real' }) => (value.kind === 'exact' ? toFloat(value.value) : value.value);

const isWhole = ({ denominator }: Rational) => denominator === 1n;

function combine(left: NumberValue, right: NumberValue, onExact: (a: Rational, b: Rational) => NumberValue, onReal: (a: number, b: number) => number): NumberValue {
  if (left.kind === 'undefined' || right.kind === 'undefined') return UNDEFINED;
  if (left.kind === 'open' || right.kind === 'open') return OPEN;
  if (left.kind === 'exact' && right.kind === 'exact') return onExact(left.value, right.value);
  return real(onReal(toFloatValue(left), toFloatValue(right)));
}

function raiseExact(base: Rational, power: Rational): NumberValue {
  if (isZero(base)) {
    if (isZero(power)) return OPEN;
    return power.numerator < 0n ? UNDEFINED : exact(ZERO);
  }
  if (compareRationals(getAbsolute(power), { numerator: BigInt(LARGEST_EXACT_POWER), denominator: 1n }) > 0) return OPEN;
  const whole = Number(power.numerator);
  if (isWhole(power)) return exact(whole < 0 ? invertRational(raiseToWhole(base, -whole)) : raiseToWhole(base, whole));
  if (base.numerator < 0n) return OPEN;
  const root = getExactRoot(base, Number(power.denominator));
  if (root === null) return real(toFloat(base) ** toFloat(power));
  return raiseExact(root, { numerator: power.numerator, denominator: 1n });
}

function getRootValue(of: NumberValue, degree: NumberValue): NumberValue {
  if (of.kind === 'undefined' || degree.kind === 'undefined') return UNDEFINED;
  if (of.kind === 'open' || degree.kind !== 'exact' || !isWhole(degree.value) || degree.value.numerator < 1n) return OPEN;
  const rootDegree = Number(degree.value.numerator);
  if (of.kind === 'real') return of.value < 0 ? OPEN : real(of.value ** (1 / rootDegree));
  const isNegative = of.value.numerator < 0n;
  if (isNegative && rootDegree % 2 === 0) return UNDEFINED;
  const root = getExactRoot(getAbsolute(of.value), rootDegree);
  if (root !== null) return exact(isNegative ? negateRational(root) : root);
  const size = toFloat(getAbsolute(of.value)) ** (1 / rootDegree);
  return real(isNegative ? -size : size);
}

const FUNCTIONS: Readonly<Record<'\\ln' | '\\log' | '\\exp', (value: number) => number>> = { '\\ln': Math.log, '\\log': Math.log10, '\\exp': Math.exp };

export function getNumberValue(expression: MathExpression): NumberValue {
  switch (expression.kind) {
    case 'number':
      return exact(expression.value);
    case 'pi':
      return real(Math.PI);
    case 'letter':
      return OPEN;
    case 'sum':
      return combine(getNumberValue(expression.left), getNumberValue(expression.right), (a, b) => exact(addRationals(a, b)), (a, b) => a + b);
    case 'difference':
      return combine(getNumberValue(expression.left), getNumberValue(expression.right), (a, b) => exact(subtractRationals(a, b)), (a, b) => a - b);
    case 'product':
      return combine(getNumberValue(expression.left), getNumberValue(expression.right), (a, b) => exact(multiplyRationals(a, b)), (a, b) => a * b);
    case 'quotient':
      return combine(getNumberValue(expression.left), getNumberValue(expression.right), (a, b) => (isZero(b) ? UNDEFINED : exact(divideRationals(a, b))), (a, b) => (b === 0 ? Number.NaN : a / b));
    case 'power':
      return combine(getNumberValue(expression.left), getNumberValue(expression.right), raiseExact, (a, b) => a ** b);
    case 'negative':
      return combine(exact(ZERO), getNumberValue(expression.of), (a, b) => exact(subtractRationals(a, b)), (a, b) => a - b);
    case 'root':
      return getRootValue(getNumberValue(expression.of), expression.degree ? getNumberValue(expression.degree) : exact({ numerator: 2n, denominator: 1n }));
    case 'call': {
      const of = getNumberValue(expression.of);
      if (of.kind === 'undefined' || of.kind === 'open') return of;
      const value = FUNCTIONS[expression.name](toFloatValue(of));
      return Number.isNaN(value) ? OPEN : real(value);
    }
  }
}

/** A ratio of polynomials over the rationals, which is what algebra can compare exactly. */
export interface Fraction {
  top: Polynomial;
  bottom: Polynomial;
}

const PI_NAME = '\\pi';

const addFractions = (left: Fraction, right: Fraction): Fraction => ({ top: addPolynomials(multiplyPolynomials(left.top, right.bottom), multiplyPolynomials(right.top, left.bottom)), bottom: multiplyPolynomials(left.bottom, right.bottom) });

export const subtractFractions = (left: Fraction, right: Fraction): Fraction => addFractions(left, { top: negatePolynomial(right.top), bottom: right.bottom });

const multiplyFractions = (left: Fraction, right: Fraction): Fraction => ({ top: multiplyPolynomials(left.top, right.top), bottom: multiplyPolynomials(left.bottom, right.bottom) });

function divideFractions(left: Fraction, right: Fraction): Fraction | null {
  return right.top.size === 0 ? null : { top: multiplyPolynomials(left.top, right.bottom), bottom: multiplyPolynomials(left.bottom, right.top) };
}

function raiseFraction(base: Fraction, power: MathExpression): Fraction | null {
  const value = getNumberValue(power);
  if (value.kind !== 'exact' || !isWhole(value.value) || getAbsolute(value.value).numerator > BigInt(LARGEST_POLYNOMIAL_POWER)) return null;
  const whole = Number(value.value.numerator);
  if (whole >= 0) return { top: raisePolynomial(base.top, whole), bottom: raisePolynomial(base.bottom, whole) };
  return base.top.size === 0 ? null : { top: raisePolynomial(base.bottom, -whole), bottom: raisePolynomial(base.top, -whole) };
}

const whenBothRead = (left: Fraction | null, right: Fraction | null, combineBoth: (a: Fraction, b: Fraction) => Fraction | null) => (left && right ? combineBoth(left, right) : null);

function readFraction(expression: MathExpression): Fraction | null {
  switch (expression.kind) {
    case 'number':
      return { top: makeConstant(expression.value), bottom: CONSTANT_ONE };
    case 'pi':
      return { top: makeLetter(PI_NAME), bottom: CONSTANT_ONE };
    case 'letter':
      return { top: makeLetter(expression.name), bottom: CONSTANT_ONE };
    case 'sum':
      return whenBothRead(readFraction(expression.left), readFraction(expression.right), addFractions);
    case 'difference':
      return whenBothRead(readFraction(expression.left), readFraction(expression.right), subtractFractions);
    case 'product':
      return whenBothRead(readFraction(expression.left), readFraction(expression.right), multiplyFractions);
    case 'quotient':
      return whenBothRead(readFraction(expression.left), readFraction(expression.right), divideFractions);
    case 'negative': {
      const of = readFraction(expression.of);
      return of && { top: negatePolynomial(of.top), bottom: of.bottom };
    }
    case 'power': {
      const base = readFraction(expression.left);
      return base && raiseFraction(base, expression.right);
    }
    case 'root': {
      const value = getNumberValue(expression);
      return value.kind === 'exact' ? { top: makeConstant(value.value), bottom: CONSTANT_ONE } : null;
    }
    case 'call':
      return null;
  }
}

/** Null for anything algebra cannot compare exactly: a root of a letter, a logarithm, a letter in a power. */
export function toFraction(expression: MathExpression): Fraction | null {
  try {
    return readFraction(expression);
  } catch (error) {
    if (error instanceof PolynomialTooLarge) return null;
    throw error;
  }
}

export const isPolynomial = ({ bottom }: Fraction) => isConstantPolynomial(bottom);

export const areSameFraction = (left: Fraction, right: Fraction) => subtractPolynomials(multiplyPolynomials(left.top, right.bottom), multiplyPolynomials(right.top, left.bottom)).size === 0;
