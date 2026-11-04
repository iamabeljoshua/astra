import { type Beat, getSpokenWords, parseBeat, type RichScene, type SceneCommand } from '@astra/contracts';
import { splitIntoShortLines } from './lesson/short-lines.ts';

const MARK = /\[\[([a-z0-9_-]+)\]\]/gi;
const NOMINAL_CHARACTERS_PER_SECOND = 15;
const SECONDS_AFTER_LAST_WORD = 2.2;
const MOMENT_DECIMALS = 3;

export interface MarkedWords {
  text: string;
  marks: { id: string; atWord: number; atCharacter: number }[];
}

export function readMarks(marked: string): MarkedWords {
  let text = '';
  let lastEnd = 0;
  const marks: MarkedWords['marks'] = [];
  for (const found of marked.matchAll(MARK)) {
    text += marked.slice(lastEnd, found.index);
    const leading = text.trimStart();
    marks.push({ id: (found[1] as string).toLowerCase(), atWord: getSpokenWords(leading).length, atCharacter: leading.replace(/\s+/g, ' ').length });
    lastEnd = found.index + found[0].length;
  }
  text += marked.slice(lastEnd);
  return { text: text.replace(/\s+/g, ' ').trim(), marks };
}

export function getNominalTiming(marked: string): { moments: Record<string, number>; durationSeconds: number } {
  const { text, marks } = readMarks(marked);
  const toSeconds = (characters: number) => Number((characters / NOMINAL_CHARACTERS_PER_SECOND).toFixed(MOMENT_DECIMALS));
  const moments = Object.fromEntries(marks.map(({ id, atCharacter }) => [id, toSeconds(atCharacter)]));
  return { moments, durationSeconds: Number((toSeconds(text.length) + SECONDS_AFTER_LAST_WORD).toFixed(MOMENT_DECIMALS)) };
}

function getRunCommands(target: RichScene['id'], marks: MarkedWords['marks'], index: number, wordsLeftInLine: number, wordCount: number): SceneCommand[] {
  const atWord = marks[index]?.atWord ?? 0;
  const next = marks[index + 1];
  const overWords = Math.max(1, Math.min(wordsLeftInLine, (next ? next.atWord : wordCount) - atWord));
  return [{ kind: 'runSimulation', target, action: 'play', ...(next ? { until: next.id } : {}), overWords }];
}

interface TakeLine {
  id: string;
  fromWord: number;
  words: readonly string[];
  wordCount: number;
  marks: MarkedWords['marks'];
  scene: RichScene;
  isFirst: boolean;
}

function getTakeLineBeat({ id, fromWord, words, wordCount, marks, scene, isFirst }: TakeLine): Beat {
  const script: Beat['script'] = isFirst ? [scene] : [];
  const first = marks[0];
  if (isFirst && first && first.atWord > 0) script.push({ kind: 'runSimulation', target: scene.id, action: 'play', until: first.id, overWords: Math.min(first.atWord, words.length) });
  words.forEach((word, wordIndex) => {
    marks.forEach((mark, markIndex) => {
      if (mark.atWord === fromWord + wordIndex) script.push(...getRunCommands(scene.id, marks, markIndex, words.length - wordIndex, wordCount));
    });
    script.push(`${word} `);
  });
  const parsed = parseBeat({ id, script, expectsReply: false });
  if (!parsed.ok) throw new Error(`scene beat ${id}: ${parsed.problem}`);
  return parsed.value;
}

/** The take runs across short lines, as a person talks. Each mark plays the scene on to the next mark as those words pass, and a run stops at its line's end, so the next mark starts on its own word. */
export function getTakeBeats({ id, marked, scene }: { id: string; marked: string; scene: RichScene }): Beat[] {
  const { text, marks } = readMarks(marked);
  const words = text.split(' ');
  let fromWord = 0;
  return splitIntoShortLines(text).map((line, index) => {
    const lineWords = words.slice(fromWord, fromWord + line.split(' ').length);
    const beat = getTakeLineBeat({ id: index === 0 ? id : `${id}-${index}`, fromWord, words: lineWords, wordCount: words.length, marks, scene, isFirst: index === 0 });
    fromWord += lineWords.length;
    return beat;
  });
}
