import type { FactError, RouteEngine, SceneRoute, SceneVerdict, SceneUsage } from './scene-types.ts';

const ENGINES: readonly RouteEngine[] = ['manimgx', 'kit', 'none'];
const MOST_TOPIC_CHARACTERS = 80;
const POINTS_AT_A_PERSON = /@|https?:|\b(my|me|mine|our|we)\b|\bi['’](m|ve|d|ll)\b/i;
const THE_LETTER_I = /\bi\b/gi;
const AFTER_MATH_I = /^\s*(squared|cubed|pi|theta|times|plus|minus|over|equals?|to the|\^|\d)/i;
const BEFORE_LAST_MATH_I = /\b(is|unit|letter|number|one|of|times|plus|minus|by|over|to|equals?),?\s*$/i;
const LONG_NUMBER = /\b\d{5,}\b/g;
const ROUND_NUMBER = /^[1-9]\d?0{3,}$/;
const MATH_WORD = /\b(power|powers|root|square|squared|cube|prime|factor|divisible|sum|product|times|plus|minus|divided)\b/i;
const LONGEST_MATH_NUMBER_DIGITS = 6;

// A lone i is the pronoun unless the words around it make it the imaginary unit, so a use nobody listed stays personal.
function hasPersonalI(topic: string): boolean {
  return [...topic.matchAll(THE_LETTER_I)].some(({ index }) => {
    const before = topic.slice(0, index);
    const after = topic.slice(index + 1);
    const isLast = after.replace(/[?.!]/g, '').trim() === '';
    return !AFTER_MATH_I.test(after) && !(isLast && BEFORE_LAST_MATH_I.test(before));
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

export function readJsonObject(text: string): Record<string, unknown> {
  const found = findFirstObject(text);
  if (!found) throw new Error('the model sent no JSON object');
  return JSON.parse(found) as Record<string, unknown>;
}

export function getRouteFromText(text: string): Omit<SceneRoute, keyof SceneUsage> {
  const reply = readJsonObject(text);
  const engine = ENGINES.find((name) => name === reply.engine) ?? 'none';
  const topic = typeof reply.topic === 'string' ? reply.topic.trim().slice(0, MOST_TOPIC_CHARACTERS) : '';
  const isSafeTopic = topic !== '' && !pointsAtAPerson(topic);
  return { engine: engine !== 'none' && !isSafeTopic ? 'none' : engine, kind: typeof reply.kind === 'string' ? reply.kind : 'unknown', topic: isSafeTopic ? topic : '' };
}

const readErrors = (value: unknown): FactError[] => (Array.isArray(value) ? value.filter((entry): entry is FactError => typeof entry === 'object' && entry !== null && typeof (entry as FactError).what === 'string') : []);

export function getVerdictFromText(text: string): Omit<SceneVerdict, keyof SceneUsage> {
  const reply = readJsonObject(text);
  if (reply.verdict !== 'pass' && reply.verdict !== 'fail') throw new Error('the review gave no verdict it could read');
  const errors = readErrors(reply.errors);
  return { isPass: reply.verdict === 'pass' && errors.length === 0, errors };
}
