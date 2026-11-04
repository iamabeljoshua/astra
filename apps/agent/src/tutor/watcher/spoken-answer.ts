import type { Task } from '@astra/contracts';
import { getLineTex, readLine } from '@astra/board/shared';

export type SpokenExpected = 'math' | 'words';

export type SpokenDecision =
  | { act: 'talk'; why: string }
  | { act: 'line'; tex: string }
  | { act: 'askModel'; expects: SpokenExpected }
  | { act: 'pick'; part: string }
  | { act: 'place'; placed: (string | null)[] };

export interface SpokenPart {
  part: string;
  label: string;
}

const TALK_OPENING = /^\s*(wait|hold on|sorry|why|what|how|when|where|who|which|can|could|would|should|do|does|did|is it|are|am i|help|stop|repeat|again|never mind|i don'?t|i do not|i'?m (confused|lost|stuck|not sure)|i am (confused|lost|stuck|not sure)|thanks|thank you|hello|hi|hey|ok|okay|give me|show me|tell me|explain|yes|yeah|yep|no|nope|right|sure|go on|um+|uh+|hm+|mm+|let me|one sec)\b/i;
const HOLDS_MATH_WORDS = /\b(equals?|plus|minus|times|over|squared|cubed|divided|root|negative)\b|\d|=/i;
const SMALL_WORDS: ReadonlySet<string> = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'then', 'first', 'next', 'last', 'after', 'that', 'is', 'it', 'its', 'goes', 'with']);

const toWords = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const isAsking = (text: string) => /\?\s*$/.test(text) || TALK_OPENING.test(text);

const getKeyWords = (text: string) => toWords(text).filter((word) => !SMALL_WORDS.has(word));

function getMentions(text: string, names: readonly string[]): { name: string; at: number }[] {
  const words = toWords(text);
  const allKeys = names.map(getKeyWords);
  return names.flatMap((name, index) => {
    const own = (allKeys[index] as string[]).filter((key) => allKeys.every((keys, other) => other === index || !keys.includes(key)));
    const at = words.findIndex((word) => own.includes(word));
    return at === -1 ? [] : [{ name, at }];
  });
}

function getSpokenCompact(text: string): string {
  const math = readLine(text).parts.flatMap((part) => (part.type === 'math' ? [part.tex] : []));
  if (math.length === 1) return (math[0] as string).replace(/\s/g, '');
  const reading = readLine(`${text} = 0`);
  const tex = getLineTex(reading);
  return tex ? tex.replace(/\s/g, '').replace(/=0$/, '') : '';
}

const toPartKey = (part: string) => part.replace(/\s/g, '').replace(/^[+-]/, '');

function decidePick(text: string, parts: readonly SpokenPart[]): SpokenDecision {
  const named = getMentions(text, parts.map(({ label }) => label));
  if (named.length === 1) return { act: 'pick', part: (parts.find(({ label }) => label === named[0]?.name) as SpokenPart).part };
  const spoken = toPartKey(getSpokenCompact(text.replace(/\b(the|term|one|i'?d|start|with|pick|deal|first)\b/gi, ' ').trim()));
  const matches = parts.filter(({ part }) => toPartKey(part) === spoken);
  return spoken !== '' && matches.length === 1 ? { act: 'pick', part: (matches[0] as SpokenPart).part } : { act: 'talk', why: 'it does not clearly name one part' };
}

function splitClauses(text: string): string[] {
  return text.split(/[,;.]|\band\b|\bthen\b/i).map((clause) => clause.trim()).filter((clause) => clause !== '');
}

function decidePairs(text: string, task: Task & { way: 'place' }): SpokenDecision | null {
  const placed: (string | null)[] = task.slots.map(() => null);
  for (const clause of splitClauses(text)) {
    const [items, slots] = [getMentions(clause, task.items), getMentions(clause, task.slots)];
    if (items.length !== 1 || slots.length !== 1) return null;
    placed[task.slots.indexOf((slots[0] as { name: string }).name)] = (items[0] as { name: string }).name;
  }
  return placed.includes(null) ? null : { act: 'place', placed };
}

function decidePlace(text: string, task: Task & { way: 'place' }): SpokenDecision {
  const items = getMentions(text, task.items).sort((first, second) => first.at - second.at);
  const hasSlotNames = getMentions(text, task.slots).length > 0;
  if (hasSlotNames) return decidePairs(text, task) ?? { act: 'talk', why: 'it does not clearly place every item' };
  if (items.length < task.slots.length) return { act: 'talk', why: 'it does not clearly name every choice' };
  return { act: 'place', placed: items.slice(0, task.slots.length).map(({ name }) => name) };
}

function decideWrite(text: string, task: Task & { way: 'write' }): SpokenDecision {
  if (task.reads === 'code') return { act: 'talk', why: 'lines of code are typed' };
  if (task.reads === 'words') return { act: 'askModel', expects: 'words' };
  const reading = readLine(text);
  const tex = getLineTex(reading);
  if (tex !== null && !reading.isAsking) return { act: 'line', tex };
  if (task.accepts || !task.on) return { act: 'askModel', expects: 'words' };
  return HOLDS_MATH_WORDS.test(text) ? { act: 'askModel', expects: 'math' } : { act: 'talk', why: 'it holds no math and this task is math' };
}

export function decideSpoken(text: string, task: Task | null, parts: readonly SpokenPart[]): SpokenDecision {
  if (!task) return { act: 'talk', why: 'no task is open' };
  if (isAsking(text)) return { act: 'talk', why: 'it is a question or a word to the tutor' };
  switch (task.way) {
    case 'write':
      return decideWrite(text, task);
    case 'pick':
      return decidePick(text, parts);
    case 'place':
      return decidePlace(text, task);
    case 'drag':
      return { act: 'talk', why: 'a point is dragged' };
  }
}
