import { getMathParts, getTexTokens, type WorkVerdict } from '@astra/contracts';
import { checkMathLine, checkMathStep, getChainLinks, isLastDigitSlip } from './check-math.ts';
import { isPolynomial, subtractFractions, toFraction } from './math/math-value.ts';
import { getLetters, parseMath } from './math/parse-math.ts';
import { getDegree, getLinearRoot, toOneLetter } from './math/polynomial.ts';
import { toFloat } from './math/rational.ts';

export interface StepInput {
  tex: string;
  problemTex: string | null;
  previousTex: string | null;
}

const RIGHT: WorkVerdict = { status: 'right' };
const UNKNOWN: WorkVerdict = { status: 'unknown' };

const CANNOT_TELL_WHICH_FRACTION = /\/\s*\d*\s*[a-zA-Z(\\]/;
const BARE_ANSWER = /^(?:-?\s*(?:\d+(?:\.\d+)?|\d*\\frac\{\d+\}\{\d+\}))$/;

type Sides = readonly (readonly string[])[];

const compact = (tex: string) => tex.replace(/\s/g, '');

function getSides(tex: string): Sides {
  const sides: string[][] = [[]];
  for (const part of getMathParts(tex)) {
    if (part.role === 'relation') sides.push([]);
    else if (part.role === 'term') (sides.at(-1) as string[]).push(compact(part.tex));
  }
  return sides;
}

const getLettersIn = (tex: string): ReadonlySet<string> => {
  const expression = parseMath(tex);
  return expression === null ? new Set() : getLetters(expression);
};

const hasLetterTerm = (terms: readonly string[]) => terms.some((term) => getTexTokens(term).some(({ text }) => /^[A-Za-z]$/.test(text)));

const isSubset = (small: readonly string[], large: readonly string[]) => small.length > 0 && small.every((term) => large.includes(term));

function isSingleLetterEquation(tex: string): boolean {
  const sides = getSides(tex);
  return sides.length === 2 && new Set(sides.flat().flatMap((term) => [...getLettersIn(term)])).size === 1;
}

function isAnswerClaim(tex: string): boolean {
  const sides = tex.split('=');
  if (sides.length !== 2) return false;
  const [left, right] = sides.map((side) => compact(side)) as [string, string];
  const isLetter = (side: string) => /^[A-Za-z]$/.test(side);
  const isNumbers = (side: string) => parseMath(side) !== null && getLettersIn(side).size === 0;
  return (isLetter(left) && isNumbers(right)) || (isLetter(right) && isNumbers(left));
}

/** A step carries a whole side with its letter over from the line before, or claims the answer. */
function isShownStep(beforeTex: string, afterTex: string): boolean {
  const links = getChainLinks(afterTex);
  if (links.length > 1) return links.some((link) => isShownStep(beforeTex, link));
  const [before, after] = [getSides(beforeTex), getSides(afterTex)];
  if (!isSingleLetterEquation(beforeTex) || after.length !== 2) return false;
  if (isAnswerClaim(afterTex)) return true;
  return before.some((beforeSide) => after.some((afterSide) => (isSubset(afterSide, beforeSide) && hasLetterTerm(afterSide)) || (isSubset(beforeSide, afterSide) && hasLetterTerm(beforeSide))));
}

function getWrongStep(problemTex: string, previousTex: string | null, tex: string, why: string): WorkVerdict {
  const isFromProblem = isShownStep(problemTex, tex);
  const isFromLastLine = previousTex !== null && isShownStep(previousTex, tex);
  if (!isFromProblem && !isFromLastLine) return UNKNOWN;
  const isOnlySlips = getChainLinks(tex).every((link) => checkMathStep(problemTex, link).status !== 'wrong' || isLastDigitSlip(problemTex, link));
  if (isOnlySlips) return UNKNOWN;
  const isBuiltOnWrongLine = previousTex !== null && checkMathStep(previousTex, tex).status === 'right';
  return { status: 'wrong', why, ...(isBuiltOnWrongLine ? { isBuiltOnWrongLine } : {}) };
}

/** Checks a typed math line, and calls it wrong only when it is shown to be a step of a single-letter equation. */
export function checkStep({ tex, problemTex, previousTex }: StepInput): WorkVerdict {
  if (CANNOT_TELL_WHICH_FRACTION.test(tex)) return UNKNOWN;
  if (problemTex === null) return checkMathLine(tex).status === 'right' ? RIGHT : UNKNOWN;
  const verdict = checkMathStep(problemTex, tex);
  if (verdict.status === 'right') return RIGHT;
  if (verdict.status === 'unknown' || !isSingleLetterEquation(problemTex)) return UNKNOWN;
  return getWrongStep(problemTex, previousTex, tex, verdict.why);
}

export function isFinishedAnswer(tex: string): boolean {
  const sides = tex.split('=').map(compact);
  if (sides.length < 2) return false;
  const [left, right] = [sides[0] as string, sides.at(-1) as string];
  return (/^[A-Za-z]$/.test(left) && BARE_ANSWER.test(right)) || (/^[A-Za-z]$/.test(right) && BARE_ANSWER.test(left));
}

export function getLinearAnswer(tex: string): { letter: string; value: number } | null {
  const sides = tex.split('=');
  if (sides.length !== 2) return null;
  const [left, right] = sides.map((side) => parseMath(side));
  if (!left || !right) return null;
  const letters = new Set([...getLetters(left), ...getLetters(right)]);
  const [letter] = letters;
  const [leftValue, rightValue] = [toFraction(left), toFraction(right)];
  if (letters.size !== 1 || letter === undefined || !leftValue || !rightValue) return null;
  const gap = subtractFractions(leftValue, rightValue);
  if (!isPolynomial(gap)) return null;
  const polynomial = toOneLetter(gap.top, letter);
  return getDegree(polynomial) === 1 ? { letter, value: toFloat(getLinearRoot(polynomial)) } : null;
}
