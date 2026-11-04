import { getSpokenWords } from '@astra/contracts';

const USUAL_LINE_WORDS = 25;
const MOST_LINE_WORDS = 45;
const SENTENCE_END = /(?<=[.!?])\s+/;
const BREATH_MARK = /(?<=[,;:])\s+/;

const countWords = (text: string) => getSpokenWords(text).length;

function joinWhileTheyFit(pieces: readonly string[]): string[] {
  const lines: string[] = [];
  for (const piece of pieces) {
    const last = lines.at(-1);
    if (last !== undefined && countWords(last) + countWords(piece) <= USUAL_LINE_WORDS) lines[lines.length - 1] = `${last} ${piece}`;
    else lines.push(piece);
  }
  return lines;
}

function cutByCount(text: string): string[] {
  const words = getSpokenWords(text);
  return Array.from({ length: Math.ceil(words.length / USUAL_LINE_WORDS) }, (_, index) => words.slice(index * USUAL_LINE_WORDS, (index + 1) * USUAL_LINE_WORDS).join(' '));
}

function splitSentence(sentence: string): string[] {
  if (countWords(sentence) <= USUAL_LINE_WORDS) return [sentence];
  return joinWhileTheyFit(sentence.split(BREATH_MARK)).flatMap((piece) => (countWords(piece) <= MOST_LINE_WORDS ? [piece] : cutByCount(piece)));
}

/** A person pauses to breathe, so a line ends at a sentence where it can, usually under 25 words and never past 45. */
export function splitIntoShortLines(text: string): string[] {
  const plain = text.replace(/\s+/g, ' ').trim();
  return countWords(plain) <= USUAL_LINE_WORDS ? [plain] : joinWhileTheyFit(plain.split(SENTENCE_END).flatMap(splitSentence));
}
