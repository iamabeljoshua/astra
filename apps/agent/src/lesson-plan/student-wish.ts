import { readLine } from '@astra/board/shared';
import type { LineWish } from '../tutor/line-read/read-line.ts';

const WHOLE_LINES: Readonly<Partial<Record<LineWish, readonly string[]>>> = {
  stop: ['stop', 'please stop', 'stop please', 'stop talking', 'please stop talking', 'stop teaching', 'wait', 'wait please', 'please wait', 'hold on', 'hang on', 'one sec', 'one second', 'sec', 'thinking', 'give me a second', 'give me a minute', 'let me think', 'let me see', 'be quiet', 'shut up', 'pause'],
  leave: ['bye', 'goodbye', 'gotta go', 'i have to go', 'i have to go now', 'see you later'],
  lost: ['im lost', 'i am lost', 'i dont get it', 'i dont understand', 'im confused'],
  go_on: ['go on', 'go on please', 'please go on', 'keep going', 'keep teaching', 'keep teaching me', 'continue', 'please continue', 'lets continue', 'next', 'next please', 'more', 'more please', 'ok next', 'ok go on', 'ok keep going', 'ok move on', 'move on', 'carry on', 'teach me more', 'tell me more', 'show me more', 'whats next', 'what is next', 'and then what', 'what else', 'dont stop'],
  slower: ['slow down', 'slow down please', 'please slow down', 'too fast', 'go slower'],
  faster: ['speed up', 'go faster'],
  filler: ['ok', 'okay', 'k', 'thanks', 'thank you', 'ok thanks', 'cool', 'hmm', 'hm', 'mm', 'mhm', 'um', 'uh', 'er', 'ah', 'oh'],
};

const WISH_OF_LINE: ReadonlyMap<string, LineWish> = new Map(Object.entries(WHOLE_LINES).flatMap(([wish, lines]) => lines.map((line) => [line, wish as LineWish] as const)));

const toPlainLine = (words: string) => words.toLowerCase().replace(/[.,!?'’…]/g, '').replace(/\s+/g, ' ').trim();

export function getPlainWish(words: string): LineWish | null {
  const known = WISH_OF_LINE.get(toPlainLine(words));
  if (known) return known;
  return readLine(words).kind === 'math' ? 'talk' : null;
}

export const isHoldWish = (wish: string | null) => wish === 'stop' || wish === 'leave' || wish === 'lost';
