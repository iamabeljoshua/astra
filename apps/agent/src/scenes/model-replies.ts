import type { FactError, RouteEngine, SceneRoute, SceneVerdict, SceneUsage } from './scene-types.ts';

const ENGINES: readonly RouteEngine[] = ['manimgx', 'kit', 'none'];
export const SAFETY_KIND = 'safety';
export const DANGEROUS_KIND = 'dangerous';
const CLEARED_NAME_KINDS = ['place', 'event', 'thing', 'figure'];
const MOST_TOPIC_CHARACTERS = 80;
const POINTS_AT_A_PERSON = /@|https?:|\b(my|me|mine|our|we)\b|\bi['’](m|ve|d|ll)\b/i;
const THE_LETTER_I = /\bi\b/gi;
const AFTER_MATH_I = /^\s*(squared|cubed|pi|theta|times|plus|minus|over|equals?|to the|\^|\d)/i;
const BEFORE_LAST_MATH_I = /\b(is|unit|letter|number|one|of|times|plus|minus|by|over|to|equals?),?\s*$/i;
const NUMBERED_WORD = /\b(Type|Class|Phase|Part|Act|Chapter|Stage|Grade|Level|Title|Book|Volume|War)\s+$/;
const NAME_BEFORE = /\b\p{Lu}[\p{L}'’-]*\s+$/u;
const LEADS_INTO_THE_PRONOUN = /\b(how|why|what|when|where|who|whom|which|can|could|should|would|will|shall|may|might|must|do|did|does|am|if|that|so|and|but|because|as|while|after|before|than|since|have|has|had|then|now|here|there|hi|hello|yes|no|please|thanks|sorry)\s+$/i;
const AFTER_A_RULER = /^(\s*$|['’]s\b|[,.;:?!)]|\s+(was|were|is|and|or|of|in|to|at|on|by|for|from|began|ended|started|ruled|died)\b)/;
const LONG_NUMBER = /\b\d{5,}\b/g;
const ROUND_NUMBER = /^[1-9]\d?0{3,}$/;
const MATH_WORD = /\b(power|powers|root|square|squared|cube|prime|factor|divisible|sum|product|times|plus|minus|divided)\b/i;
const LONGEST_MATH_NUMBER_DIGITS = 6;

// "World War I" and "Henry I" name a thing. The words after a ruler must read like a sentence about the ruler, because "Fractions I find hard" has the same capitals.
const isRomanOne = (letter: string, before: string, after: string) => letter === 'I' && (NUMBERED_WORD.test(before) || (NAME_BEFORE.test(before) && !LEADS_INTO_THE_PRONOUN.test(before) && AFTER_A_RULER.test(after)));

// A lone i is the pronoun unless the words around it make it the imaginary unit or a roman numeral, so a use nobody listed stays personal.
function hasPersonalI(topic: string): boolean {
  return [...topic.matchAll(THE_LETTER_I)].some(({ 0: letter, index }) => {
    const before = topic.slice(0, index);
    const after = topic.slice(index + 1);
    const isLast = after.replace(/[?.!]/g, '').trim() === '';
    return !AFTER_MATH_I.test(after) && !(isLast && BEFORE_LAST_MATH_I.test(before)) && !isRomanOne(letter, before, after);
  });
}

// A long number can be a phone number, a student number, or a postcode, unless it is round or the topic is plainly about numbers.
const hasPersonalNumber = (topic: string) => (topic.match(LONG_NUMBER) ?? []).some((digits) => !ROUND_NUMBER.test(digits) && !(digits.length <= LONGEST_MATH_NUMBER_DIGITS && MATH_WORD.test(topic)));

const pointsAtAPerson = (topic: string) => POINTS_AT_A_PERSON.test(topic) || hasPersonalI(topic) || hasPersonalNumber(topic);

export function findFirstObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let isInString = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (isInString) {
      if (character === '\\') index += 1;
      else if (character === '"') isInString = false;
    } else if (character === '"') isInString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && (depth -= 1) === 0) return text.slice(start, index + 1);
  }
  return null;
}

/** A reply nobody can read. The caller decides what that means, because a plain "yes" drew prose as often as a dangerous question did. */
export class UnreadableReply extends Error {}

export function readJsonObject(text: string): Record<string, unknown> {
  const found = findFirstObject(text);
  if (!found) throw new UnreadableReply('the model sent no JSON object');
  try {
    return JSON.parse(found) as Record<string, unknown>;
  } catch (error) {
    throw new UnreadableReply(`the model sent JSON that does not parse: ${String(error)}`);
  }
}

export function getRouteFromText(text: string): Omit<SceneRoute, keyof SceneUsage> {
  const reply = readJsonObject(text);
  if (reply.kind === SAFETY_KIND || reply.kind === DANGEROUS_KIND) return { engine: 'none', kind: reply.kind, topic: '' };
  const engine = ENGINES.find((name) => name === reply.engine) ?? 'none';
  const topic = typeof reply.topic === 'string' ? reply.topic.trim().slice(0, MOST_TOPIC_CHARACTERS) : '';
  const isSafeTopic = topic !== '' && !pointsAtAPerson(topic);
  return { engine: engine !== 'none' && !isSafeTopic ? 'none' : engine, kind: typeof reply.kind === 'string' ? reply.kind : 'unknown', topic: isSafeTopic ? topic : '' };
}

/** Only a name it was asked about, of a kind a lesson may say, and a reply it cannot read clears nothing. */
export function getClearedNames(names: readonly string[], text: string): ReadonlySet<string> {
  try {
    const { names: read } = readJsonObject(text);
    const entries = Array.isArray(read) ? (read as { name?: unknown; kind?: unknown }[]) : [];
    return new Set(names.filter((name) => entries.some((entry) => entry.name === name && typeof entry.kind === 'string' && CLEARED_NAME_KINDS.includes(entry.kind))));
  } catch {
    return new Set();
  }
}

const readErrors = (value: unknown): (FactError & { stillWrong?: unknown })[] => (Array.isArray(value) ? value.filter((entry): entry is FactError => typeof entry === 'object' && entry !== null && typeof (entry as FactError).what === 'string') : []);

export function getVerdictFromText(text: string): Omit<SceneVerdict, keyof SceneUsage> {
  const reply = readJsonObject(text);
  if (reply.verdict !== 'pass' && reply.verdict !== 'fail') throw new Error('the review gave no verdict it could read');
  const found = readErrors(reply.errors);
  const errors = found.filter(({ stillWrong }) => stillWrong !== false);
  // A reviewer can work a claim out and find it true while writing the finding, so a fail whose findings all cleared themselves is a pass.
  return { isPass: errors.length === 0 && (reply.verdict === 'pass' || found.length > 0), errors };
}
