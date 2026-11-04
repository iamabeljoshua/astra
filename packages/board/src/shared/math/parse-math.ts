import { getTexTokens, type TexToken } from '@astra/contracts';
import { type Rational, readDecimal } from './rational.ts';

export type MathExpression =
  | { kind: 'number'; value: Rational }
  | { kind: 'pi' }
  | { kind: 'letter'; name: string }
  | { kind: 'sum' | 'difference' | 'product' | 'quotient' | 'power'; left: MathExpression; right: MathExpression }
  | { kind: 'negative'; of: MathExpression }
  | { kind: 'root'; degree: MathExpression | null; of: MathExpression }
  | { kind: 'call'; name: '\\ln' | '\\log' | '\\exp'; of: MathExpression };

class CannotRead extends Error {}

// Sine and friends stay out, because \sin 30 is 0.5 only in degrees, and a line does not say which it means.
const FUNCTIONS: ReadonlySet<string> = new Set(['\\ln', '\\log', '\\exp']);
const GREEK_LETTER = /^\\(alpha|beta|gamma|delta|theta|lambda|mu|omega|phi|rho|sigma|tau)$/;
const PLAIN_LETTER = /^[A-Za-z]$/;
const FUNCTION_LETTER = /^[fghFGH]$/;
const SKIPPED: ReadonlySet<string> = new Set(['\\left', '\\right', '\\,', '\\;', '\\:', '\\!', '\\ ', '\\displaystyle', '\\quad', '\\qquad']);
const TIMES: ReadonlySet<string> = new Set(['*', '\\times', '\\cdot']);
const DIVIDE: ReadonlySet<string> = new Set(['/', '\\div']);
const FRACTIONS: ReadonlySet<string> = new Set(['\\frac', '\\dfrac', '\\tfrac']);
const CLOSING: ReadonlyMap<string, string> = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
const LONGEST_LETTER_RUN = 2;
const WRITTEN_FUNCTION_NAMES: ReadonlySet<string> = new Set(['ln', 'lg']);

const isNumberToken = (token: string | undefined) => token !== undefined && /^\d/.test(token);

// mass, sin, and ln written in plain letters read as products, so a word is never judged.
function hasWordInLetters(tokens: readonly string[]): boolean {
  let run = '';
  for (const token of tokens) {
    run = PLAIN_LETTER.test(token) ? `${run}${token}` : '';
    if (run.length > LONGEST_LETTER_RUN || WRITTEN_FUNCTION_NAMES.has(run)) return true;
  }
  return false;
}

// Refuses notation it does not know, so unknown TeX reads as "unknown" and never as a false verdict.
function createParser(tokens: readonly string[]) {
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const expect = (token: string) => {
    if (next() !== token) throw new CannotRead();
  };

  const readGroup = (): MathExpression => {
    expect('{');
    const value = readSum();
    expect('}');
    return value;
  };

  function readSum(): MathExpression {
    let value = readProduct();
    for (let token = peek(); token === '+' || token === '-'; token = peek()) {
      next();
      value = { kind: token === '+' ? 'sum' : 'difference', left: value, right: readProduct() };
    }
    return value;
  }

  const startsFactor = (token: string | undefined) => token !== undefined && (/^[\dA-Za-z(]/.test(token) || token.startsWith('\\')) && !TIMES.has(token) && !DIVIDE.has(token);

  // "1 000" and "6 / 2(3)" each have two readings, and a verdict needs one.
  const checkImplicitFactor = (token: string | undefined, followsDivision: boolean) => {
    if (isNumberToken(token) || followsDivision) throw new CannotRead();
  };

  function readProduct(): MathExpression {
    let value = readSigned();
    let followsDivision = false;
    for (let token = peek(); token !== undefined && (TIMES.has(token) || DIVIDE.has(token) || startsFactor(token)); token = peek()) {
      const isDivide = DIVIDE.has(token);
      if (TIMES.has(token) || isDivide) next();
      else checkImplicitFactor(token, followsDivision);
      value = { kind: isDivide ? 'quotient' : 'product', left: value, right: readSigned() };
      followsDivision = isDivide;
    }
    return value;
  }

  function readSigned(): MathExpression {
    if (peek() === '-') {
      next();
      return { kind: 'negative', of: readSigned() };
    }
    if (peek() === '+') next();
    return readPower();
  }

  function readPower(): MathExpression {
    const base = readAtom();
    if (peek() !== '^') return base;
    next();
    return { kind: 'power', left: base, right: peek() === '{' ? readGroup() : readAtom() };
  }

  const readRoot = (): MathExpression => {
    if (peek() !== '[') return { kind: 'root', degree: null, of: readGroup() };
    next();
    const degree = readSum();
    expect(']');
    return { kind: 'root', degree, of: readGroup() };
  };

  // f(x) and s(2) read as products to a parser and as a function to a student.
  const checkNotFunctionCall = (letter: string) => {
    if (peek() !== '(') return;
    if (FUNCTION_LETTER.test(letter) || (isNumberToken(tokens[position + 1]) && tokens[position + 2] === ')')) throw new CannotRead();
  };

  function readLetter(token: string): MathExpression {
    if (peek() !== '_') {
      checkNotFunctionCall(token);
      return { kind: 'letter', name: token };
    }
    next();
    const subscript = next();
    if (subscript !== '{') return { kind: 'letter', name: `${token}_${subscript}` };
    const parts: string[] = [];
    for (let part = next(); part !== '}'; part = next()) {
      if (part === undefined) throw new CannotRead();
      parts.push(part);
    }
    return { kind: 'letter', name: `${token}_${parts.join('')}` };
  }

  function readNumber(token: string): MathExpression {
    const value = readDecimal(token);
    if (value === null) throw new CannotRead();
    return { kind: 'number', value };
  }

  function readAtom(): MathExpression {
    const token = next();
    if (token === undefined) throw new CannotRead();
    if (isNumberToken(token)) return readNumber(token);
    if (PLAIN_LETTER.test(token) || GREEK_LETTER.test(token)) return readLetter(token);
    if (token === '\\pi') return { kind: 'pi' };
    if (FUNCTIONS.has(token)) return { kind: 'call', name: token as '\\ln', of: readPower() };
    if (FRACTIONS.has(token)) return { kind: 'quotient', left: readGroup(), right: readGroup() };
    if (token === '\\sqrt') return readRoot();
    const closing = CLOSING.get(token);
    if (closing === undefined) throw new CannotRead();
    const inner = readSum();
    expect(closing);
    return inner;
  }

  return {
    readWhole() {
      const value = readSum();
      if (position !== tokens.length) throw new CannotRead();
      return value;
    },
  };
}

// 2\frac{1}{2} is two and a half to a student and two times a half to a parser, so it is not judged.
const hasMixedNumber = (tokens: readonly string[]) => tokens.some((token, index) => isNumberToken(token) && FRACTIONS.has(tokens[index + 1] ?? ''));

export function parseMath(tex: string): MathExpression | null {
  const tokens = getTexTokens(tex).map((token: TexToken) => token.text).filter((text) => !SKIPPED.has(text));
  if (tokens.length === 0 || hasMixedNumber(tokens) || hasWordInLetters(tokens)) return null;
  try {
    return createParser(tokens).readWhole();
  } catch (error) {
    if (error instanceof CannotRead) return null;
    throw error;
  }
}

/** Every letter the line names, with pi kept out, because a line with only pi in it is arithmetic. */
export function getLetters(expression: MathExpression): ReadonlySet<string> {
  switch (expression.kind) {
    case 'letter':
      return new Set([expression.name]);
    case 'number':
    case 'pi':
      return new Set();
    case 'negative':
    case 'call':
      return getLetters(expression.of);
    case 'root':
      return new Set([...getLetters(expression.of), ...(expression.degree ? getLetters(expression.degree) : [])]);
    default:
      return new Set([...getLetters(expression.left), ...getLetters(expression.right)]);
  }
}
