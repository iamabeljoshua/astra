import type { ComputeAnswer, PlotValuesAnswer } from './compute.ts';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];
const DIGITS_IN_A_GROUP = 3;
const MOST_WHOLE_DIGITS = DIGITS_IN_A_GROUP * SCALES.length;
/** A longer table would run past the 45 words a stretch may hold, so only its two ends are said. */
const MOST_ROWS_SAID = 5;

function sayUnderAThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const restWords = rest < ONES.length ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 === 0 ? '' : `-${ONES[rest % 10]}`}`;
  if (hundreds === 0) return restWords as string;
  return rest === 0 ? `${ONES[hundreds]} hundred` : `${ONES[hundreds]} hundred ${restWords}`;
}

function sayWhole(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length, scale = 0; end > 0; end -= DIGITS_IN_A_GROUP, scale += 1) {
    const group = Number(digits.slice(Math.max(0, end - DIGITS_IN_A_GROUP), end));
    if (group > 0) groups.unshift(`${sayUnderAThousand(group)}${scale > 0 ? ` ${SCALES[scale]}` : ''}`);
  }
  return groups.length > 0 ? groups.join(' ') : (ONES[0] as string);
}

/** The prompt has the model write numbers as words for the voice, so code does too. Null means it is too long to say or is not a plain number. */
export function sayNumber(text: string): string | null {
  const [, sign, whole, places] = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text) ?? [];
  if (whole === undefined || whole.length > MOST_WHOLE_DIGITS) return null;
  const decimal = places ? ` point ${[...places].map((digit) => ONES[Number(digit)]).join(' ')}` : '';
  return `${sign ? 'minus ' : ''}${sayWhole(whole)}${decimal}`;
}

export function sayComputeAnswer(answer: ComputeAnswer): string | null {
  if (!answer.ok) return null;
  const words = sayNumber(answer.about ?? answer.value);
  return words && `It comes to ${answer.about === undefined ? '' : 'about '}${words}.`;
}

export function sayPlotAnswer(answer: PlotValuesAnswer): string | null {
  if (!answer.ok) return null;
  const rows = answer.points.length <= MOST_ROWS_SAID ? answer.points : [answer.points[0], answer.points.at(-1)];
  const parts = rows.map((row) => {
    const [input, value] = row as readonly [number, string];
    const inputWords = sayNumber(String(input));
    const valueWords = sayNumber(value);
    return inputWords && valueWords && `at ${inputWords} it's ${valueWords}`;
  });
  if (parts.some((part) => !part)) return null;
  const said = parts.join(', ');
  return `${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
}

export const saySourceAnswer = (answer: { found: true; site: string } | { found: false }): string => (answer.found ? `I found a page on ${answer.site}.` : "I couldn't find a page for that, and I won't guess at one.");
