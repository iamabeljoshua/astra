import { describeRational, getExactPlaces, getLetters, getNumberValue, type MathExpression, type NumberValue, parseMath, type Rational, readDecimal, toFloatValue } from '@astra/board/shared';

export type ComputeAnswer = { ok: true; value: string; about?: string } | { ok: false; problem: string };

export type PlotValuesAnswer = { ok: true; points: readonly (readonly [number, string])[] } | { ok: false; problem: string };

const SIGNIFICANT_DIGITS = 6;
const FEWEST_POINTS = 2;
const MOST_POINTS = 21;
const MOST_PLOT_PLACES = 6;

const toAboutText = (value: number) => String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));

function toExactDecimal(value: Rational): string {
  const places = getExactPlaces(value);
  if (places === null) return describeRational(value);
  const scale = 10n ** BigInt(places);
  const scaled = (value.numerator * scale) / value.denominator;
  const digits = (scaled < 0n ? -scaled : scaled).toString().padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const sign = scaled < 0n ? '-' : '';
  return places === 0 ? `${sign}${whole}` : `${sign}${whole}.${digits.slice(-places)}`;
}

function describeAnswer(value: NumberValue): ComputeAnswer {
  if (value.kind === 'undefined') return { ok: false, problem: 'that is not defined, as dividing by zero is not' };
  if (value.kind === 'open') return { ok: false, problem: 'that does not come to one number' };
  if (value.kind === 'real') return { ok: true, value: toAboutText(value.value), about: toAboutText(value.value) };
  return getExactPlaces(value.value) === null ? { ok: true, value: describeRational(value.value), about: toAboutText(toFloatValue(value)) } : { ok: true, value: toExactDecimal(value.value) };
}

function toNumberExpression(value: number): MathExpression | null {
  const magnitude = readDecimal(String(Math.abs(value)));
  if (!magnitude) return null;
  return value < 0 ? { kind: 'negative', of: { kind: 'number', value: magnitude } } : { kind: 'number', value: magnitude };
}

function substitute(expression: MathExpression, values: Readonly<Record<string, number>>): MathExpression {
  switch (expression.kind) {
    case 'number':
    case 'pi':
      return expression;
    case 'letter': {
      const value = values[expression.name];
      return (value !== undefined && toNumberExpression(value)) || expression;
    }
    case 'negative':
      return { kind: 'negative', of: substitute(expression.of, values) };
    case 'call':
      return { ...expression, of: substitute(expression.of, values) };
    case 'root':
      return { ...expression, of: substitute(expression.of, values), degree: expression.degree && substitute(expression.degree, values) };
    default:
      return { ...expression, left: substitute(expression.left, values), right: substitute(expression.right, values) };
  }
}

// A letter is compared by the name the parser gave it, so \lambda and x both work, and what is left over is named back to the model.
function evaluate(expression: string, values: Readonly<Record<string, number>>): ComputeAnswer {
  const parsed = parseMath(expression);
  if (!parsed) return { ok: false, problem: `could not read ${expression}` };
  const filled = substitute(parsed, values);
  const missing = [...getLetters(filled)];
  if (missing.length > 0) return { ok: false, problem: `needs a value for ${missing.join(', ')}` };
  return describeAnswer(getNumberValue(filled));
}

export const compute = ({ expression, values }: { expression: string; values: Readonly<Record<string, number>> }): ComputeAnswer => evaluate(expression, values);

const toPlotInput = (value: number) => Number(value.toFixed(MOST_PLOT_PLACES));

export function plotValues({ expression, letter, from, to, points }: { expression: string; letter: string; from: number; to: number; points: number }): PlotValuesAnswer {
  if (!Number.isInteger(points) || points < FEWEST_POINTS || points > MOST_POINTS) return { ok: false, problem: `points must be a whole number from ${FEWEST_POINTS} to ${MOST_POINTS}` };
  const step = (to - from) / (points - 1);
  const rows: (readonly [number, string])[] = [];
  for (let index = 0; index < points; index += 1) {
    const input = toPlotInput(from + step * index);
    const answer = evaluate(expression, { [letter]: input });
    if (!answer.ok) return { ok: false, problem: `at ${letter} = ${input}: ${answer.problem}` };
    rows.push([input, answer.about ?? answer.value]);
  }
  return { ok: true, points: rows };
}

