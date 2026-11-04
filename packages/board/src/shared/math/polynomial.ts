import { addRationals, divideRationals, isZero, isSameRational, multiplyRationals, negateRational, ONE, type Rational, subtractRationals, ZERO } from './rational.ts';

/** A polynomial over the rationals in any number of letters, keyed by its monomial, such as "x^2 y". */
export type Polynomial = ReadonlyMap<string, Rational>;

const POWER_MARK = '\u0000';
const LETTER_MARK = '\u0001';
const MOST_TERMS = 512;

export class PolynomialTooLarge extends Error {}

const makeMonomialKey = (powers: ReadonlyMap<string, number>) =>
  [...powers]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([letter, power]) => `${letter}${POWER_MARK}${power}`)
    .join(LETTER_MARK);

function readMonomialKey(key: string): Map<string, number> {
  if (key === '') return new Map();
  return new Map(key.split(LETTER_MARK).map((part) => {
    const [letter, power] = part.split(POWER_MARK) as [string, string];
    return [letter, Number(power)];
  }));
}

function multiplyMonomials(left: string, right: string): string {
  const powers = readMonomialKey(left);
  for (const [letter, power] of readMonomialKey(right)) powers.set(letter, (powers.get(letter) ?? 0) + power);
  return makeMonomialKey(powers);
}

export const CONSTANT_ONE: Polynomial = new Map([['', ONE]]);
export const makeConstant = (value: Rational): Polynomial => (isZero(value) ? new Map() : new Map([['', value]]));
export const makeLetter = (letter: string): Polynomial => new Map([[makeMonomialKey(new Map([[letter, 1]])), ONE]]);

export function addPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const sum = new Map(left);
  for (const [key, value] of right) {
    const total = addRationals(sum.get(key) ?? ZERO, value);
    if (isZero(total)) sum.delete(key);
    else sum.set(key, total);
  }
  return sum;
}

export const negatePolynomial = (value: Polynomial): Polynomial => new Map([...value].map(([key, coefficient]) => [key, negateRational(coefficient)]));
export const subtractPolynomials = (left: Polynomial, right: Polynomial) => addPolynomials(left, negatePolynomial(right));

export function multiplyPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const product = new Map<string, Rational>();
  for (const [leftKey, leftValue] of left) {
    for (const [rightKey, rightValue] of right) {
      const key = multiplyMonomials(leftKey, rightKey);
      const total = addRationals(product.get(key) ?? ZERO, multiplyRationals(leftValue, rightValue));
      if (isZero(total)) product.delete(key);
      else product.set(key, total);
      if (product.size > MOST_TERMS) throw new PolynomialTooLarge();
    }
  }
  return product;
}

export function raisePolynomial(base: Polynomial, power: number): Polynomial {
  let result: Polynomial = CONSTANT_ONE;
  for (let step = 0; step < power; step += 1) result = multiplyPolynomials(result, base);
  return result;
}

export const isSamePolynomial = (left: Polynomial, right: Polynomial) => subtractPolynomials(left, right).size === 0;
export const isConstantPolynomial = (value: Polynomial) => [...value.keys()].every((key) => key === '');

/** The two differ only by a fixed factor, so as equations they say the same thing. */
export function areProportional(left: Polynomial, right: Polynomial): boolean {
  if (left.size !== right.size) return false;
  const [firstKey, firstValue] = [...left][0] ?? [];
  if (firstKey === undefined || firstValue === undefined) return true;
  const other = right.get(firstKey);
  if (other === undefined) return false;
  const factor = divideRationals(other, firstValue);
  return [...left].every(([key, value]) => {
    const match = right.get(key);
    return match !== undefined && isSameRational(multiplyRationals(value, factor), match);
  });
}

/** Coefficients in one letter, lowest power first, with none for the zero polynomial. */
export type OneLetterPolynomial = readonly Rational[];

export function toOneLetter(value: Polynomial, letter: string): OneLetterPolynomial {
  const coefficients: Rational[] = [];
  for (const [key, coefficient] of value) {
    const power = readMonomialKey(key).get(letter) ?? 0;
    coefficients[power] = coefficient;
  }
  return Array.from(coefficients, (coefficient) => coefficient ?? ZERO);
}

const trim = (value: OneLetterPolynomial): OneLetterPolynomial => {
  let length = value.length;
  while (length > 0 && isZero(value[length - 1] as Rational)) length -= 1;
  return value.slice(0, length);
};

/** The zero polynomial has degree -1. */
export const getDegree = (value: OneLetterPolynomial) => trim(value).length - 1;

function getRemainder(dividend: OneLetterPolynomial, divisor: OneLetterPolynomial): OneLetterPolynomial {
  const rest = [...trim(dividend)];
  const bottom = trim(divisor);
  const lead = bottom.at(-1) as Rational;
  while (rest.length >= bottom.length) {
    const shift = rest.length - bottom.length;
    const factor = divideRationals(rest.at(-1) as Rational, lead);
    bottom.forEach((coefficient, index) => {
      rest[index + shift] = subtractRationals(rest[index + shift] as Rational, multiplyRationals(coefficient, factor));
    });
    rest.pop();
    const trimmed = trim(rest);
    rest.length = trimmed.length;
  }
  return rest;
}

const getQuotient = (dividend: OneLetterPolynomial, divisor: OneLetterPolynomial): OneLetterPolynomial => {
  const rest = [...trim(dividend)];
  const bottom = trim(divisor);
  const lead = bottom.at(-1) as Rational;
  const quotient: Rational[] = [];
  for (let shift = rest.length - bottom.length; shift >= 0; shift -= 1) {
    const factor = divideRationals(rest[shift + bottom.length - 1] as Rational, lead);
    quotient[shift] = factor;
    bottom.forEach((coefficient, index) => {
      rest[index + shift] = subtractRationals(rest[index + shift] as Rational, multiplyRationals(coefficient, factor));
    });
  }
  return quotient;
};

export function getCommonDivisor(left: OneLetterPolynomial, right: OneLetterPolynomial): OneLetterPolynomial {
  let [first, second] = [trim(left), trim(right)];
  while (second.length > 0) [first, second] = [second, trim(getRemainder(first, second))];
  return first;
}

const getDerivative = (value: OneLetterPolynomial): OneLetterPolynomial => value.slice(1).map((coefficient, index) => multiplyRationals(coefficient, { numerator: BigInt(index + 1), denominator: 1n }));

/** The same roots, each once, so "does every root of this also solve that" is a single division. */
export function getWithSingleRoots(value: OneLetterPolynomial): OneLetterPolynomial {
  const common = getCommonDivisor(value, getDerivative(trim(value)));
  return getDegree(common) <= 0 ? trim(value) : getQuotient(value, common);
}

export const divides = (divisor: OneLetterPolynomial, dividend: OneLetterPolynomial) => trim(dividend).length === 0 || trim(getRemainder(dividend, divisor)).length === 0;

/** The one root of a polynomial of degree one. */
export const getLinearRoot = (value: OneLetterPolynomial): Rational => negateRational(divideRationals(value[0] ?? ZERO, value[1] as Rational));

export const getCoefficient = (value: Polynomial, key: string) => value.get(key) ?? ZERO;
