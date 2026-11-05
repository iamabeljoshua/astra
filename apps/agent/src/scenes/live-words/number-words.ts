const SMALL_NUMBERS: Readonly<Record<string, number>> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Readonly<Record<string, number>> = { hundred: 100, thousand: 1000, million: 1_000_000, billion: 1_000_000_000, trillion: 1_000_000_000_000 };
const AMOUNT_WORDS: Readonly<Record<string, number>> = { half: 0.5, halves: 0.5, quarter: 0.25, quarters: 0.25, twice: 2, double: 2, doubles: 2, triple: 3, triples: 3, thrice: 3, dozen: 12, third: 3, thirds: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const MEASURE_WORDS: ReadonlySet<string> = new Set(['second', 'seconds', 'minute', 'minutes', 'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'meter', 'meters', 'metre', 'metres', 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'mile', 'miles', 'foot', 'feet', 'inch', 'inches', 'yard', 'yards', 'gram', 'grams', 'kilo', 'kilos', 'kilogram', 'kilograms', 'percent', 'degree', 'degrees', 'dollar', 'dollars', 'pound', 'pounds', 'point']);
const TOKEN = /\d+(?:\.\d+)?|\p{L}+/gu;
const DIGIT_GROUP_COMMA = /(?<=\d),(?=\d{3}\b)/g;

const isNumberWord = (word: string | undefined) => word !== undefined && (Object.hasOwn(SMALL_NUMBERS, word) || Object.hasOwn(SCALES, word));

function getWholeNumber(words: readonly string[]): number {
  let total = 0;
  let group = 0;
  for (const word of words) {
    const scale = SCALES[word];
    if (scale === undefined) group += SMALL_NUMBERS[word] ?? 0;
    else if (scale === 100) group = Math.max(group, 1) * scale;
    else {
      total += Math.max(group, 1) * scale;
      group = 0;
    }
  }
  return total + group;
}

function readDecimals(tokens: readonly string[], from: number): { value: number; next: number } {
  let digits = '';
  let next = from;
  for (let word = tokens[next]; word !== undefined && (SMALL_NUMBERS[word] ?? 10) < 10; word = tokens[next]) {
    digits += String(SMALL_NUMBERS[word]);
    next += 1;
  }
  return { value: digits === '' ? 0 : Number(`0.${digits}`), next };
}

function readNumberRun(tokens: readonly string[], from: number): { value: number; next: number } {
  const words: string[] = [];
  let next = from;
  while (isNumberWord(tokens[next]) || (tokens[next] === 'and' && Object.hasOwn(SCALES, tokens[next - 1] ?? '') && isNumberWord(tokens[next + 1]))) {
    if (tokens[next] !== 'and') words.push(tokens[next] as string);
    next += 1;
  }
  if (tokens[next] !== 'point' || (SMALL_NUMBERS[tokens[next + 1] ?? ''] ?? 10) >= 10) return { value: getWholeNumber(words), next };
  const decimals = readDecimals(tokens, next + 1);
  return { value: getWholeNumber(words) + decimals.value, next: decimals.next };
}

// "One" is mostly a pronoun in speech, as in "this one", so alone it counts only in front of a measure.
const isBareOne = (tokens: readonly string[], start: number, next: number) => next === start + 1 && tokens[start] === 'one' && !MEASURE_WORDS.has(tokens[next] ?? '');

/** Every amount a line says, in digits or in words. A sign is not read, so "negative one" and "minus one" are both 1. */
export function getNumbersSaid(text: string): number[] {
  const tokens = (text.toLowerCase().replace(DIGIT_GROUP_COMMA, '').match(TOKEN) ?? []) as string[];
  const numbers: number[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] as string;
    if (/^\d/.test(token)) {
      numbers.push(Number(token));
      index += 1;
    } else if (isNumberWord(token)) {
      const run = readNumberRun(tokens, index);
      if (!isBareOne(tokens, index, run.next)) numbers.push(run.value);
      index = run.next;
    } else {
      const amount = AMOUNT_WORDS[token];
      if (amount !== undefined) numbers.push(amount);
      index += 1;
    }
  }
  return numbers;
}
