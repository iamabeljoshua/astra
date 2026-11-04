import { getMathParts, getTexProblem, type LinePart, type LineReading, MATH_LINE_MAX_CHARACTERS, type WriteReading } from '@astra/contracts';
import { canRenderTex } from '../math/tex-check.ts';
import { parseMath } from './math/parse-math.ts';

type TokenKind = 'word' | 'hard' | 'op' | 'number' | 'letter';

interface Token {
  raw: string;
  symbol: string;
  kind: TokenKind;
}

const FUNCTIONS: ReadonlySet<string> = new Set(['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs']);
const SUPERSCRIPTS: Readonly<Record<string, string>> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const NUMBER_WORDS: Readonly<Record<string, number>> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS_WORDS: Readonly<Record<string, number>> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SPOKEN_OPERATORS: Readonly<Record<string, string>> = { equals: '=', equal: '=', plus: '+', minus: '-', negative: '-', times: '*', over: '/' };
const SPOKEN_POWERS: Readonly<Record<string, string>> = { squared: '^2', cubed: '^3' };
const CLAIM_WORDS: ReadonlySet<string> = new Set(['so', 'then', 'thus', 'hence', 'therefore', 'answer', 'answer:', 'i', 'get', 'got', 'gives', 'is', 'that', 'it', "it's", 'which', 'means', 'and', 'now', 'ok', 'okay']);
const MANY_LETTERS = /^[xyzabcnt]+$/;
const LONE_LETTER = /^[A-Za-z]$/;
const MOST_PARTS = 40;
const LONGEST_TEX = 400;
const TRAILING_PUNCTUATION = /[?!,;:.]+$/;
const ENDS_A_CHUNK = /[,:;]$/;
const ALLOWED_IN_MATH = /^[0-9A-Za-zπ().^+\-*/=±<>≥≤|]+$/;
const LETTER_RUN = /[A-Za-z]+/g;
/** A-T is a base pair and 2H2O a molecule, and a student means neither as a minus sign or a product. */
const CAPITALS_JOINED = /^[A-Z](?:-[A-Z])+$/;
const CHEMICAL_FORMULA = /^\d+[A-Z]+\d/;
const NOT_STUDENT_TEXT = /\p{Cf}|\p{Co}|\p{Cs}|\p{Variation_Selector}|[^\P{Cc}\n\t]/gu;
const TOO_MANY_MARKS = /(\p{M}{4})\p{M}+/gu;

/** Strips control and invisible characters and long runs of combining marks, and keeps the indent. */
export function cleanTypedLine(text: string): string {
  return text.normalize('NFC').replace(NOT_STUDENT_TEXT, '').replace(TOO_MANY_MARKS, '$1').trimEnd();
}

export function cleanStudentText(text: string): string {
  return cleanTypedLine(text).trim();
}

function normalizeSymbols(text: string): string {
  return text
    .replace(/==+/g, '=')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => `^${[...run].map((character) => SUPERSCRIPTS[character]).join('')}`)
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/(?<![a-zA-Z])pi(?![a-zA-Z])/g, 'π')
    .replace(/√\s*(\d+|[a-z])/g, 'sqrt($1)');
}

function getClosingBracket(text: string, opening: number): number {
  let depth = 0;
  for (let index = opening; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')' && (depth -= 1) === 0) return index;
  }
  return -1;
}

function wrapBrackets(text: string, marker: string, makeTex: (inside: string) => string): string {
  let result = text;
  let at = result.indexOf(marker);
  while (at !== -1) {
    const end = getClosingBracket(result, at + marker.length - 1);
    if (end === -1) return result;
    result = `${result.slice(0, at)}${makeTex(result.slice(at + marker.length, end))}${result.slice(end + 1)}`;
    at = result.indexOf(marker);
  }
  return result;
}

const MIXED_NUMBER = /(?<![\d.^/])(\d+)\s+(\d+)\s*\/\s*(\d+)(?![\d.^a-zA-Z(])/g;
const SIMPLE_FRACTION = /(\d+(?:\.\d+)?|[a-zA-Z]|\))\s*\/\s*(\d+(?:\.\d+)?|[a-zA-Z])(?![\w^])/g;

export function plainToTex(plain: string): string {
  const withMixedNumbers = plain.replace(MIXED_NUMBER, (_, whole: string, top: string, bottom: string) => `${whole}\\frac{${top}}{${bottom}}`);
  const withRoots = wrapBrackets(withMixedNumbers.replace(/\s+/g, ''), 'sqrt(', (inside) => `\\sqrt{${inside}}`);
  const withPowers = wrapBrackets(withRoots, '^(', (inside) => `^{${inside}}`).replace(/\^(-?\d+(?:\.\d+)?|[a-zA-Z])/g, '^{$1}');
  return withPowers
    .replace(SIMPLE_FRACTION, (whole, top: string, bottom: string) => (top === ')' ? whole : `\\frac{${top}}{${bottom}}`))
    .replace(/π/g, '\\pi ')
    .replace(/(?<![a-zA-Z\\])(sin|cos|tan|log|ln)(?![a-zA-Z])/g, '\\$1 ')
    .replace(/\*/g, '\\cdot ')
    .replace(/±|\+-/g, '\\pm ')
    .replace(/≥/g, '\\ge ')
    .replace(/≤/g, '\\le ')
    .replace(/\|([^|]+)\|/g, '\\left|$1\\right|');
}

function hasOnlyMathLetters(compact: string): boolean {
  return (compact.match(LETTER_RUN) ?? []).every((run) => FUNCTIONS.has(run) || MANY_LETTERS.test(run) || LONE_LETTER.test(run));
}

function classifySymbol(symbol: string): TokenKind {
  const compact = symbol.replace(TRAILING_PUNCTUATION, '');
  if (compact === '' || !ALLOWED_IN_MATH.test(compact) || !hasOnlyMathLetters(compact) || CAPITALS_JOINED.test(compact) || CHEMICAL_FORMULA.test(compact)) return 'word';
  if (/^[=+\-*/<>≥≤]$/.test(compact)) return 'op';
  if (/^-?\d*\.?\d+$/.test(compact)) return 'number';
  if (LONE_LETTER.test(compact)) return 'letter';
  if (compact.includes('π') || (/[=^+*/±<>≥≤|()]/.test(compact) && /[0-9a-zA-Z]/.test(compact))) return 'hard';
  if (/^-?\d*\.?\d+[a-zA-Z]+/.test(compact) || /^-[a-zA-Z0-9]/.test(compact) || /[a-zA-Z0-9]-[a-zA-Z0-9]/.test(compact)) return 'hard';
  return FUNCTIONS.has(compact) ? 'hard' : 'word';
}

const toWord = (raw: string) => raw.toLowerCase().replace(TRAILING_PUNCTUATION, '');

function readSpokenNumber(raws: readonly string[], index: number): { symbol: string; used: number } | null {
  const [word, next, after] = [raws[index], raws[index + 1], raws[index + 2]].map((raw) => (raw === undefined ? '' : toWord(raw))) as [string, string, string];
  const hyphen = /^([a-z]+)-([a-z]+)$/.exec(word);
  if (hyphen && TENS_WORDS[hyphen[1] as string] !== undefined && NUMBER_WORDS[hyphen[2] as string] !== undefined) return { symbol: String((TENS_WORDS[hyphen[1] as string] as number) + (NUMBER_WORDS[hyphen[2] as string] as number)), used: 1 };
  const whole = TENS_WORDS[word] ?? NUMBER_WORDS[word];
  if (whole === undefined) return null;
  const ones = NUMBER_WORDS[next];
  if (TENS_WORDS[word] !== undefined && ones !== undefined && ones > 0 && ones < 10) return { symbol: String(whole + ones), used: 2 };
  if (next === 'point' && NUMBER_WORDS[after] !== undefined) return { symbol: `${whole}.${NUMBER_WORDS[after]}`, used: 3 };
  return { symbol: String(whole), used: 1 };
}

function readSpokenWords(raws: readonly string[], index: number): { symbol: string; used: number } {
  const raw = raws[index] as string;
  const word = toWord(raw);
  const [next, after] = [raws[index + 1], raws[index + 2]].map((other) => (other === undefined ? '' : toWord(other)));
  const number = readSpokenNumber(raws, index);
  if (number) return number;
  if (word === 'divided' && next === 'by') return { symbol: '/', used: 2 };
  if (word === 'square' && next === 'root' && after === 'of' && raws[index + 3] !== undefined) return { symbol: `sqrt(${readSpokenWords(raws, index + 3).symbol.replace(TRAILING_PUNCTUATION, '')})`, used: 3 + readSpokenWords(raws, index + 3).used };
  if (word === 'equal' && next === 'to') return { symbol: '=', used: 2 };
  if (word === 'is' && next === 'equal' && after === 'to') return { symbol: '=', used: 3 };
  if (word === 'is' && LONE_LETTER.test(toWord(raws[index - 1] ?? '')) && raws[index + 1] !== undefined && /^(-?\d|negative$|minus$)/.test(readSpokenWords(raws, index + 1).symbol + (next === 'negative' || next === 'minus' ? '' : ''))) return { symbol: '=', used: 1 };
  const spoken = SPOKEN_OPERATORS[word] ?? SPOKEN_POWERS[word];
  if (spoken) return { symbol: spoken, used: 1 };
  return { symbol: /^[XYZ]$/.test(raw.replace(TRAILING_PUNCTUATION, '')) || /^\d+[XYZ]$/.test(raw.replace(TRAILING_PUNCTUATION, '')) ? raw.toLowerCase() : raw, used: 1 };
}

function getTokens(text: string): Token[] {
  const raws = text.split(/\s+/).filter((raw) => raw !== '');
  const tokens: Token[] = [];
  for (let index = 0; index < raws.length; ) {
    const { symbol: spoken, used } = readSpokenWords(raws, index);
    const raw = raws.slice(index, index + used).join(' ');
    const ending = used > 1 || spoken !== raws[index] ? (TRAILING_PUNCTUATION.exec(raw)?.[0] ?? '') : '';
    const symbol = normalizeSymbols(`${spoken}${ending}`);
    tokens.push({ raw, symbol, kind: classifySymbol(symbol) });
    index += used;
  }
  return tokens;
}

function canReadEverySide(tex: string): boolean {
  const sides: string[] = [''];
  for (const part of getMathParts(tex)) {
    if (part.role === 'relation') sides.push('');
    else sides[sides.length - 1] += part.tex;
  }
  return sides.every((side) => parseMath(side) !== null);
}

/** Keeps a run a run only if it holds math, so "two apples" stays words and "a - the first" is not an equation. */
function getMathTex(run: readonly Token[]): string | null {
  const isComplete = run.some((token) => token.kind === 'hard');
  const hasOperator = run.some((token) => token.kind === 'op');
  const hasValue = run.some((token) => token.kind === 'number' || token.kind === 'letter');
  if (!isComplete && !(hasOperator && hasValue)) return null;
  const body = run.map((token) => token.symbol).join(' ').replace(TRAILING_PUNCTUATION, '');
  if (body.length > MATH_LINE_MAX_CHARACTERS) return null;
  const tex = plainToTex(body);
  if (!isComplete && !canReadEverySide(tex)) return null;
  return tex.length <= LONGEST_TEX && getTexProblem(tex) === null && canRenderTex(tex) ? tex : null;
}

/** Every symbol in spoken words, so "the answer is four." holds `4`. */
export function getSpokenSymbols(text: string): string[] {
  return getTokens(text).map(({ symbol }) => symbol.replace(TRAILING_PUNCTUATION, ''));
}

function getParts(tokens: readonly Token[]): LinePart[] {
  const parts: LinePart[] = [];
  const addWords = (text: string) => {
    const last = parts.at(-1);
    if (last?.type === 'words') last.text = `${last.text} ${text}`;
    else parts.push({ type: 'words', text });
  };
  let index = 0;
  while (index < tokens.length) {
    const start = index;
    if (tokens[index]?.kind === 'word') {
      index += 1;
      addWords((tokens[start] as Token).raw);
      continue;
    }
    while (index < tokens.length && tokens[index]?.kind !== 'word') {
      index += 1;
      if (ENDS_A_CHUNK.test(tokens[index - 1]?.raw ?? '')) break;
    }
    const run = tokens.slice(start, index);
    const tex = getMathTex(run);
    const text = run.map((token) => token.raw).join(' ');
    if (tex === null) addWords(text);
    else parts.push({ type: 'math', text: text.replace(TRAILING_PUNCTUATION, ''), tex });
  }
  return parts;
}

const isClaimWord = (word: string) => CLAIM_WORDS.has(word.toLowerCase().replace(/[,:]$/, ''));

const holdsOnlyClaimWords = (part: LinePart) => part.type === 'math' || part.text.split(/\s+/).every(isClaimWord) || /^[?!,;:.\s]*$/.test(part.text);

function getBareNumberTex(text: string): string | null {
  const bare = text.replace(TRAILING_PUNCTUATION, '');
  return /^-?\d*\.?\d+$/.test(bare) ? bare : null;
}

function toReading(text: string, parts: LinePart[], isAsking: boolean): LineReading {
  const maths = parts.filter((part) => part.type === 'math');
  const [only] = maths;
  if (only && maths.length === 1 && parts.every(holdsOnlyClaimWords)) return { kind: 'math', parts: [only], isAsking };
  if (maths.length > 0) return { kind: 'mixed', parts, isAsking };
  const bare = getBareNumberTex(text);
  return bare === null ? { kind: 'words', parts: [{ type: 'words', text }], isAsking } : { kind: 'math', parts: [{ type: 'math', text: bare, tex: bare }], isAsking };
}

export function readLine(rawText: string, reads?: WriteReading): LineReading {
  const line = cleanTypedLine(rawText);
  const text = line.trim();
  const isAsking = /\?\s*$|^is\b/i.test(text);
  if (reads !== undefined) return { kind: reads, parts: [{ type: 'words', text: reads === 'code' ? line : text }], isAsking };
  const parts = getParts(getTokens(text));
  return parts.length > MOST_PARTS ? { kind: 'words', parts: [{ type: 'words', text }], isAsking } : toReading(text, parts, isAsking);
}

export function getLineTex(reading: LineReading): string | null {
  const [part] = reading.parts;
  return reading.kind === 'math' && part?.type === 'math' ? part.tex : null;
}
