import { type Beat, type ElementId, getSpokenWords, parseBeat, type RichScene } from '@astra/contracts';
import { getTakeBeats, readMarks } from '../narration.ts';
import type { LessonPlan, OpeningLine } from '../scene-types.ts';
import { splitIntoShortLines } from './short-lines.ts';

const MOST_OVER_WORDS = 6;

function toBeat(id: string, script: Beat['script'], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problem}`);
  return parsed.value;
}

export const getSpokenBeats = (id: string, words: string, expectsReply = false): Beat[] => splitIntoShortLines(words).map((line, index, lines) => toBeat(index === 0 ? id : `${id}-${index}`, [line], expectsReply && index === lines.length - 1));

function getBoardCommand(id: string, { tex, note }: OpeningLine, spokenWords: string): Beat['script'] {
  const overWords = Math.min(getSpokenWords(spokenWords).length, MOST_OVER_WORDS);
  if (tex) return [{ kind: 'writeMath', id: `${id}-math` as ElementId, tex, overWords }];
  if (note) return [{ kind: 'text', id: `${id}-note` as ElementId, text: note, handwritten: true, overWords }];
  return [];
}

export const getLineBeats = (id: string, line: OpeningLine): Beat[] => splitIntoShortLines(line.say).map((words, index) => (index === 0 ? toBeat(id, [...getBoardCommand(id, line, words), words]) : toBeat(`${id}-${index}`, [words])));

export const getSceneBeats = ({ setup, narration, scene }: { setup: string; narration: string; scene: RichScene }): Beat[] => [...getSpokenBeats('scene-setup', setup), ...getTakeBeats({ id: 'scene-take', marked: narration, scene })];

const getLineWords = ({ say, tex, note }: OpeningLine) => [say, ...(tex ? [`On the board: ${tex}`] : []), ...(note ? [`On the board: ${note}`] : [])];

export function getSpokenLines(plan: LessonPlan): string[] {
  return [...plan.opening.flatMap(getLineWords), ...(plan.more ?? []).flatMap(getLineWords), plan.setup, readMarks(plan.narration).text, plan.close];
}

function getBeatProblem(makeBeat: () => unknown): string[] {
  try {
    makeBeat();
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

/** The lesson builds its beats with these same functions, so what passes here cannot be refused later. */
export function getPlanBeatProblems(plan: LessonPlan): string[] {
  return [
    ...plan.opening.flatMap((line, index) => getBeatProblem(() => getLineBeats(`line-${index}`, line))),
    ...(plan.more ?? []).flatMap((line, index) => getBeatProblem(() => getLineBeats(`more-${index}`, line))),
    ...getBeatProblem(() => getSpokenBeats('close', plan.close, true)),
  ];
}

export const getSceneBeatProblems = (request: Parameters<typeof getSceneBeats>[0]): string[] => getBeatProblem(() => getSceneBeats(request));
