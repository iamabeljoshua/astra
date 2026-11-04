/** Muse spells a hum its own way, "MMMM." or "Mhm", so these match by shape and not by list. */
const HUM_SHAPE = /^(m+|h+m+|m+h+m*|m+-?h+m+|m+-m+|u+h+|u+h+-?h+u+h+|a+h+|a+h+-?h*a+)$/;
const REACTION_WORDS = new Set(['uh', 'huh', 'uh-huh', 'uhuh', 'uh-uh', 'mm', 'mmm', 'mhm', 'mhmm', 'mm-hm', 'mm-hmm', 'mmhmm', 'mm-mm', 'hm', 'hmm', 'hmmm', 'aha', 'ah', 'oh', 'ooh', 'yeah', 'yes', 'yep', 'yup', 'ok', 'okay', 'right', 'sure', 'wow', 'um', 'umm', 'uhm', 'hum']);
const REACTION_PHRASES = [['i', 'see'], ['got', 'it']];
const FILLER_WORDS = new Set(['um', 'umm', 'uhm', 'er', 'erm', 'well', 'so', 'okay', 'ok', 'like']);
const FILLER_PHRASES = [['let', 'me', 'think'], ['let', 'me', 'see'], ['give', 'me', 'a', 'second'], ['one', 'second'], ['i', 'think']];

export function getWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?()"]+/)
    .map((word) => word.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
}

function isMadeOf(words: readonly string[], singles: ReadonlySet<string>, phrases: readonly (readonly string[])[]): boolean {
  if (words.length === 0) return false;
  for (let index = 0; index < words.length; ) {
    const phrase = phrases.find((candidate) => candidate.every((word, offset) => words[index + offset] === word));
    if (phrase) index += phrase.length;
    else if (singles.has(words[index] as string) || HUM_SHAPE.test(words[index] as string)) index += 1;
    else return false;
  }
  return true;
}

/** "Uh-huh" and its real spellings, which keep the tutor talking. A number is always a real word. */
export const isSmallReaction = (text: string) => isMadeOf(getWords(text), REACTION_WORDS, REACTION_PHRASES);

/** "Hmm, let me think", which keeps the student's turn open. */
export const isFiller = (text: string) => isMadeOf(getWords(text), FILLER_WORDS, FILLER_PHRASES);

export const hasWords = (text: string) => getWords(text).length > 0;

/** A typed line that truly asks something. One word such as "ok?", or math such as "x = 3?", is a check and not a question. */
export const asksAQuestion = (text: string) => /\?\s*$/.test(text) && getWords(text).filter((word) => /[a-z]{2}/.test(word)).length >= 2;

// Words of a final the tutor already answered from its partial, which only count again when the student has spoken since.
export function dropWordsAlreadyAnswered(text: string, answered: string): string {
  const words = text.trim().split(/\s+/);
  const answeredWords = getWords(answered);
  let kept = 0;
  while (kept < answeredWords.length && kept < words.length && getWords(words[kept] as string).join('') === answeredWords[kept]) kept += 1;
  return words.slice(kept).join(' ');
}
