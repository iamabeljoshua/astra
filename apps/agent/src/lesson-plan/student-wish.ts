import { readLine } from '@astra/board/shared';
import type { LineWish } from '../tutor/line-read/read-line.ts';

const WHOLE_LINES: Readonly<Partial<Record<LineWish, readonly string[]>>> = {
  stop: ['stop', 'please stop', 'stop please', 'stop talking', 'please stop talking', 'stop teaching', 'be quiet', 'shut up', 'pause'],
  wait: ['wait', 'wait please', 'please wait', 'hold on', 'hang on', 'one sec', 'one second', 'sec', 'thinking', 'give me a second', 'give me a minute', 'let me think', 'let me see'],
  leave: ['bye', 'goodbye', 'gotta go', 'i have to go', 'i have to go now', 'see you later'],
  lost: ['im lost', 'i am lost', 'i dont get it', 'i dont understand', 'im confused'],
  go_on: ['go on', 'go on please', 'please go on', 'keep going', 'keep teaching', 'keep teaching me', 'continue', 'please continue', 'lets continue', 'next', 'next please', 'more', 'more please', 'move on', 'carry on', 'teach me more', 'tell me more', 'show me more', 'whats next', 'what is next', 'and then what', 'what else', 'dont stop'],
  slower: ['slow down', 'slow down please', 'please slow down', 'too fast', 'go slower'],
  faster: ['speed up', 'go faster'],
  filler: ['ok', 'okay', 'k', 'thanks', 'thank you', 'ok thanks', 'cool', 'hmm', 'hm', 'mm', 'mhm', 'um', 'uh', 'er', 'ah', 'oh', 'the', 'and'],
};

const WISH_OF_LINE: ReadonlyMap<string, LineWish> = new Map(Object.entries(WHOLE_LINES).flatMap(([wish, lines]) => lines.map((line) => [line, wish as LineWish] as const)));

const OPENING_SOUND = /^(?:ok(?:ay)?|um+|uh+|hm+)\s+(?=\S)/;

const toPlainLine = (words: string) => words.toLowerCase().replace(/[.,!?'’…]/g, '').replace(/\s+/g, ' ').trim();

export function getPlainWish(words: string): LineWish | null {
  const line = toPlainLine(words);
  const known = WISH_OF_LINE.get(line) ?? WISH_OF_LINE.get(line.replace(OPENING_SOUND, ''));
  if (known) return known;
  return readLine(words).kind === 'math' ? 'talk' : null;
}

export const isHoldWish = (wish: string | null) => wish === 'stop' || wish === 'wait' || wish === 'leave' || wish === 'lost';

const JUST_A_SOUND = /^(?:h+m+|u+m+|u+h+|e+r+|m+|a+h+|o+h+|the|and)$/;

/** A nod says they are with the tutor, and a sound may only be them thinking. */
export const isJustASound = (words: string) => JUST_A_SOUND.test(toPlainLine(words));
