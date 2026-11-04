import { type Beat, getSpokenWords, parseBeat, type RichScene, type SceneCommand } from '@astra/contracts';

const MARK = /\[\[([a-z0-9_-]+)\]\]/gi;
const NOMINAL_CHARACTERS_PER_SECOND = 15;
const SECONDS_AFTER_LAST_WORD = 2.2;
const MOMENT_DECIMALS = 3;

export interface MarkedWords {
  text: string;
  /** Each mark, in order, with the word it sits on. */
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

/** A take is made on nominal times, because the same take plays under any voice. Each moment then lands on its word through overWords. */
export function getNominalTiming(marked: string): { moments: Record<string, number>; durationSeconds: number } {
  const { text, marks } = readMarks(marked);
  const toSeconds = (characters: number) => Number((characters / NOMINAL_CHARACTERS_PER_SECOND).toFixed(MOMENT_DECIMALS));
  const moments = Object.fromEntries(marks.map(({ id, atCharacter }) => [id, toSeconds(atCharacter)]));
  return { moments, durationSeconds: Number((toSeconds(text.length) + SECONDS_AFTER_LAST_WORD).toFixed(MOMENT_DECIMALS)) };
}

function getRunCommands(target: RichScene['id'], marks: MarkedWords['marks'], index: number, wordCount: number): SceneCommand[] {
  const atWord = marks[index]?.atWord ?? 0;
  const next = marks[index + 1];
  const overWords = Math.max(1, (next ? next.atWord : wordCount) - atWord);
  return [{ kind: 'runSimulation', target, action: 'play', ...(next ? { until: next.id } : {}), overWords }];
}

/** Turns marked narration into one beat. The scene takes the board on its first word, and each mark plays it on to the next mark as those words pass. */
export function getSceneBeat({ id, marked, scene, expectsReply = false }: { id: string; marked: string; scene: RichScene; expectsReply?: boolean }): Beat {
  const { text, marks } = readMarks(marked);
  const words = text.split(' ');
  const script: Beat['script'] = [scene];
  const first = marks[0];
  if (first && first.atWord > 0) script.push({ kind: 'runSimulation', target: scene.id, action: 'play', until: first.id, overWords: first.atWord });
  words.forEach((word, wordIndex) => {
    marks.forEach((mark, markIndex) => {
      if (mark.atWord === wordIndex) script.push(...getRunCommands(scene.id, marks, markIndex, words.length));
    });
    script.push(`${word} `);
  });
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(`scene beat ${id}: ${parsed.problem}`);
  return parsed.value;
}
