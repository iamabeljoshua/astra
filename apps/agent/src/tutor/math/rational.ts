/** An exact number. The denominator is always positive and shares no factor with the numerator. */
export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

const DECIMAL_NUMBER = /^(\d+)(?:\.(\d+))?$/;
const ROOT_SEARCH_LIMIT_BITS = 4096;

function getCommonFactor(first: bigint, second: bigint): bigint {
  let [left, right] = [first < 0n ? -first : first, second < 0n ? -second : second];
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

export function makeRational(numerator: bigint, denominator = 1n): Rational {
  const factor = getCommonFactor(numerator, denominator) * (denominator < 0n ? -1n : 1n);
  return { numerator: numerator / factor, denominator: denominator / factor };
}

export const ZERO = makeRational(0n);
export const ONE = makeRational(1n);

export const addRationals = (left: Rational, right: Rational) => makeRational(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
export const multiplyRationals = (left: Rational, right: Rational) => makeRational(left.numerator * right.numerator, left.denominator * right.denominator);
export const negateRational = ({ numerator, denominator }: Rational): Rational => ({ numerator: -numerator, denominator });
export const subtractRationals = (left: Rational, right: Rational) => addRationals(left, negateRational(right));
export const invertRational = ({ numerator, denominator }: Rational) => makeRational(denominator, numerator);
export const divideRationals = (left: Rational, right: Rational) => multiplyRationals(left, invertRational(right));
export const isZero = ({ numerator }: Rational) => numerator === 0n;
export const isSameRational = (left: Rational, right: Rational) => left.numerator === right.numerator && left.denominator === right.denominator;
export const compareRationals = (left: Rational, right: Rational) => (left.numerator * right.denominator - right.numerator * left.denominator > 0n ? 1 : isSameRational(left, right) ? 0 : -1);
export const getAbsolute = (value: Rational): Rational => (value.numerator < 0n ? negateRational(value) : value);

export function readDecimal(text: string): Rational | null {
  const [, whole, fraction = ''] = DECIMAL_NUMBER.exec(text) ?? [];
  return whole === undefined ? null : makeRational(BigInt(`${whole}${fraction}`), 10n ** BigInt(fraction.length));
}

export function toFloat({ numerator, denominator }: Rational): number {
  const value = Number(numerator) / Number(denominator);
  if (Number.isFinite(value)) return value;
  const shift = BigInt(Math.max(numerator.toString().length, denominator.toString().length) - 300);
  return Number(numerator / 10n ** shift) / Number(denominator / 10n ** shift);
}

export function raiseToWhole(base: Rational, power: number): Rational {
  return makeRational(base.numerator ** BigInt(power), base.denominator ** BigInt(power));
}

function getWholeRoot(value: bigint, degree: number): bigint | null {
  if (value < 2n) return value;
  let [low, high] = [1n, 1n << BigInt(Math.ceil(value.toString(2).length / degree) + 1)];
  while (low <= high) {
    const middle = (low + high) / 2n;
    const power = middle ** BigInt(degree);
    if (power === value) return middle;
    if (power < value) low = middle + 1n;
    else high = middle - 1n;
  }
  return null;
}

/** The exact root of a non-negative number, or null when it has no exact root. */
export function getExactRoot({ numerator, denominator }: Rational, degree: number): Rational | null {
  if (numerator.toString(2).length > ROOT_SEARCH_LIMIT_BITS || denominator.toString(2).length > ROOT_SEARCH_LIMIT_BITS) return null;
  const [top, bottom] = [getWholeRoot(numerator, degree), getWholeRoot(denominator, degree)];
  return top === null || bottom === null ? null : makeRational(top, bottom);
}

/** How many decimal places write this number exactly, or null when its decimals never end. */
export function getExactPlaces({ denominator }: Rational): number | null {
  let [rest, twos, fives] = [denominator, 0, 0];
  while (rest % 2n === 0n) [rest, twos] = [rest / 2n, twos + 1];
  while (rest % 5n === 0n) [rest, fives] = [rest / 5n, fives + 1];
  return rest === 1n ? Math.max(twos, fives) : null;
}

/** Says a number as a teacher would write it: 19.6 when its decimals end, and 1/3 when they do not. */
export function describeRational(value: Rational): string {
  const places = getExactPlaces(value);
  if (places === null) return `${value.numerator}/${value.denominator}`;
  const scaled = value.numerator * 10n ** BigInt(places) / value.denominator;
  const digits = (scaled < 0n ? -scaled : scaled).toString().padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const sign = scaled < 0n ? '-' : '';
  return places === 0 ? `${sign}${whole}` : `${sign}${whole}.${digits.slice(-places)}`;
}
