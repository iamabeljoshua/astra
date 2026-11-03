const PHRASE_SEPARATOR = /[,;]|\band\b/i;
const LIKING_LEAD_IN = /^(i\s+)?(really\s+)?(love|like|enjoy)\s+/i;
const MAX_WORDS_BESIDE_INTEREST = 1;
const REFUSING_WORDS = new Set([
  'anti',
  'boring',
  'dislike',
  'dislikes',
  'except',
  'hate',
  'hated',
  'hates',
  'never',
  'no',
  'non',
  'not',
  'quit',
  'sucks',
  'without',
]);

export function toWordSearchText(text: string): string {
  return ` ${text.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export function splitIntoPhrases(studentInterest: string): string[] {
  return studentInterest.split(PHRASE_SEPARATOR);
}

// A student types freely, and a pick's reason repeats the claim, so only a short phrase with no refusal counts as liking the word.
export function readsAsLiking(phrase: string, interestWord: string): boolean {
  const statement = phrase.trim().replace(LIKING_LEAD_IN, '');
  const hasRefusal = toWordSearchText(statement).trim().split(' ').some((word) => REFUSING_WORDS.has(word));
  return !hasRefusal && countWords(statement) - countWords(interestWord) <= MAX_WORDS_BESIDE_INTEREST;
}
