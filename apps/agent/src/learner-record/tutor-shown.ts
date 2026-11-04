import { getSpokenSymbols, readLine } from '@astra/board/shared';
import { getCues, type LineReading } from '@astra/contracts';
import type { TurnSummary } from '../tutor/brain.ts';

/** A number the tutor said this many turns ago is more likely to be talk than a giveaway. A whole line stays a giveaway all room. */
const TURNS_A_SAID_NUMBER_COUNTS = 3;

const COUNTS: Readonly<Record<string, number>> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PARTS: Readonly<Record<string, number>> = { half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10 };
const SAID_FRACTION = new RegExp(`\\b(${Object.keys(COUNTS).join('|')})[ -](${Object.keys(PARTS).join('|')})\\b`, 'gi');
const ENDS_A_SENTENCE = /(?<=[.!?;:])\s+/;
const FRACTION = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/;
const NUMBER = /^-?\d*\.?\d+$/;

const toCompactTex = (tex: string) => tex.toLowerCase().replace(/\s+/g, '').replace(/\\[dt]frac/g, '\\frac').replace(/\\left|\\right|\\,/g, '');

const getSides = (tex: string) => toCompactTex(tex).split('=');

/** The same whichever way round the equals sign is written. */
const toLineKey = (tex: string) => getSides(tex).toSorted().join('=');

function toValueKey(side: string): string | null {
  const plain = side.replace(/\\frac\{(-?[\d.]+)\}\{([\d.]+)\}/, '$1/$2');
  const fraction = FRACTION.exec(plain);
  if (fraction) return (Number(fraction[1]) / Number(fraction[2])).toFixed(6);
  return NUMBER.test(plain) ? Number(plain).toFixed(6) : null;
}

const getValueKeys = (sides: readonly string[]) => sides.flatMap((side) => toValueKey(side) ?? []);

const getMathTexes = ({ parts }: LineReading) => parts.flatMap((part) => (part.type === 'math' ? [part.tex] : []));

const toDigits = (spoken: string) => spoken.replace(SAID_FRACTION, (_whole, count: string, part: string) => `${COUNTS[count.toLowerCase()]}/${PARTS[part.toLowerCase()]}`);

export interface TutorShown {
  addTurn(turn: Pick<TurnSummary, 'spokenText' | 'beats'>): void;
  /** Whether the tutor wrote this line, or said its answer, before the student did. */
  hasShown(line: string): boolean;
}

// What a student copied is not what they showed, however it was written down. So this compares math, both ways round, and also the answers themselves, because "x is one half" gives away `x = 1/2` with no line on the board.
export function createTutorShown(): TutorShown {
  const lineKeys = new Set<string>();
  let turnsOfValues: ReadonlySet<string>[] = [];

  return {
    addTurn({ spokenText, beats }) {
      const commands = beats.flatMap((beat) => getCues(beat).map(({ command }) => command));
      const written = commands.flatMap((command) => ('tex' in command && typeof command.tex === 'string' ? [command.tex] : []));
      const writtenAsText = commands.flatMap((command) => ('text' in command && typeof command.text === 'string' ? [command.text] : []));
      const spoken = toDigits(spokenText);
      const fromSentences = [...writtenAsText, ...spoken.split(ENDS_A_SENTENCE)].flatMap((sentence) => getMathTexes(readLine(sentence)));
      const shownTexes = [...written, ...fromSentences];
      for (const tex of shownTexes) lineKeys.add(toLineKey(tex));
      const saidValues = getSpokenSymbols(spoken).flatMap((symbol) => symbol.split('='));
      turnsOfValues = [...turnsOfValues, new Set([...shownTexes.flatMap((tex) => getValueKeys(getSides(tex))), ...getValueKeys(saidValues)])].slice(-TURNS_A_SAID_NUMBER_COUNTS);
    },
    hasShown(line) {
      if (lineKeys.has(toLineKey(line))) return true;
      return getMathTexes(readLine(line)).some((tex) => lineKeys.has(toLineKey(tex)) || getValueKeys(getSides(tex)).some((value) => turnsOfValues.some((values) => values.has(value))));
    },
  };
}
