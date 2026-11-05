import { LEAD_WORDS } from '../live/tutor-lead.ts';

export type StudentWish = 'hold' | 'slower' | 'faster' | 'teach' | 'none';

const WORDS_NOT_ABOUT_GOING_ON = '(?:know|get|mind|care|understand|see)';
const NEGATIVE = String.raw`(?:don'?t|do not|never|not|won'?t|can'?t|cannot|cant|no need to)`;
const GOING_ON = String.raw`(?:go on|going on|keep going|keep teaching|carry on|carrying on|go ahead|tell me more|teach me more|teach me|show me more|explain more|move on|moving on|continue)`;
const SHORT_PAUSE = String.raw`(?:sec|second|minute|moment|min|bit|break)`;
const OPENING = String.raw`^\s*(?:(?:ok(?:ay)?|please|um+|uh+|hey|sorry|so|but|just|no|yes|yeah)[,.!]?\s+)*`;

const SAYS_NOT_TO_GO_ON = new RegExp(String.raw`\b${NEGATIVE}\s+(?!${WORDS_NOT_ABOUT_GOING_ON}\b)(?:\w+\s+){0,4}?${GOING_ON}\b`, 'i');
const SAYS_TO_KEEP_ON = /\b(?:don'?t|do not|never)\s+stop\b/i;
const NAMES_AN_EXERCISE = String.raw`(?!\s+(?:the\s+|more\s+|any\s+)?(?:exercises?|tasks?|problems?|practice|quiz(?:zes)?)\b)`;
const OPENS_ON_HOLD = new RegExp(`${OPENING}(?:stop|wait|hold on|hang on|pause|quiet|shush|shh+|hush|enough|that'?s enough|be quiet|shut up|no more|not now|one ${SHORT_PAUSE}|just a ${SHORT_PAUSE}|a ${SHORT_PAUSE}|(?:give|gimme) (?:me )?a ${SHORT_PAUSE}|let me (?:think|finish)|i need a ${SHORT_PAUSE})\\b${NAMES_AN_EXERCISE}`, 'i');
const ASKS_A_QUESTION = /\?\s*$|\b(?:what|why|how|who|when|where|which|does|is|are|can|could|do)\b/i;
const ASKS_TO_HOLD_ANYWHERE = new RegExp(String.raw`\b(?:please|can you|could you|would you|you can|you should)\s+(?:stop|pause|wait|be quiet|shut up|hold on|hang on)\b(?=\s*(?:talking|teaching|explaining|speaking|now|there|please|for now|a ${SHORT_PAUSE}|[.!?]*\s*$))|\bstop\s+(?:talking|teaching|explaining|speaking|the lesson|for now)\b|\b(?:can we|could we|let'?s|lets|i want to|i wanna|i'?d like to)\s+(?:stop|pause|take a break)\b(?=\s*(?:here|now|please|for now|for today|[.!?]*\s*$))|\bi(?:'ve| have|'ve got| got)?\s*(?:to|gotta)\s+go\s*[.!]*$|^\s*(?:ok(?:ay)?\s+)?(?:bye|goodbye|gtg)\b|\bleave me alone\b|\bbe quiet\b|\bshut up\b|\b(?:i\s+)?need a ${SHORT_PAUSE}\b|\bbrb\b|\bi don'?t want to (?:learn|do) this\b`, 'i');
const ASKS_FOR_SLOWER = new RegExp(`${OPENING}(?:slow(?:er)?(?: down)?|(?:go|talk|speak) (?:a bit |more )?slow(?:er|ly)?|not so fast|too fast)\\b|\\b(?:can|could) you (?:please )?(?:slow down|go slower|talk slower|speak slower)\\b|\\b(?:you'?re|you are|ur) (?:going |talking |speaking |moving )?too fast\\b`, 'i');
const ASKS_FOR_FASTER = new RegExp(`${OPENING}(?:speed up|go faster|talk faster|you can go faster)\\b`, 'i');

const WANTS_TEACHING = /\b(?:go on|keep going|keep teaching|carry on|go ahead|tell me more|teach me more|show me more|explain more|more please|what(?:'?s| is) next\b(?! to)|what else|and then what|then what|move on|next (?:one|idea|bit|part|thing))\b(?! (?:a|an|the|my|with) )|^\s*(?:please\s+)?(?:next|more|continue)(?:\s+please)?[.!]*\s*$/i;

const LEAD_LINES: ReadonlySet<string> = new Set(Object.values(LEAD_WORDS));

function asksToHold(words: string): boolean {
  if (SAYS_TO_KEEP_ON.test(words)) return false;
  return SAYS_NOT_TO_GO_ON.test(words) || ASKS_TO_HOLD_ANYWHERE.test(words) || (OPENS_ON_HOLD.test(words) && !ASKS_A_QUESTION.test(words));
}

const SAYS_THEY_ARE_LOST = /\b(?:don'?t|do not|didn'?t) (?:get|understand|follow)\b|\b(?:lost|confused)\b/i;

export const saysTheyAreLost = (words: string) => SAYS_THEY_ARE_LOST.test(words);

export function readStudentWish(words: string): StudentWish {
  if (LEAD_LINES.has(words.trim())) return 'none';
  if (asksToHold(words)) return 'hold';
  if (ASKS_FOR_SLOWER.test(words)) return 'slower';
  if (ASKS_FOR_FASTER.test(words)) return 'faster';
  return WANTS_TEACHING.test(words) ? 'teach' : 'none';
}
