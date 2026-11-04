import { type Beat, type ElementId, getSpokenWords, parseBeat, type RichScene } from '@astra/contracts';
import { getSceneBeat, readMarks } from '../narration.ts';
import type { LessonPlan, OpeningLine } from '../scene-types.ts';

const MOST_OVER_WORDS = 6;

function toBeat(id: string, script: Beat['script'], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problem}`);
  return parsed.value;
}

export const getSpokenBeat = (id: string, words: string, expectsReply = false) => toBeat(id, [words], expectsReply);

export function getLineBeat(id: string, { say, tex, note }: OpeningLine): Beat {
  const overWords = Math.min(getSpokenWords(say).length, MOST_OVER_WORDS);
  if (tex) return toBeat(id, [{ kind: 'writeMath', id: `${id}-math` as ElementId, tex, overWords }, say]);
  if (note) return toBeat(id, [{ kind: 'text', id: `${id}-note` as ElementId, text: note, handwritten: true, overWords }, say]);
  return toBeat(id, [say]);
}

export function getSceneBeats({ setup, narration, scene }: { setup: string; narration: string; scene: RichScene }): Beat[] {
  return [getSpokenBeat('scene-setup', setup), getSceneBeat({ id: 'scene-take', marked: narration, scene })];
}

export function getSpokenLines(plan: LessonPlan): string[] {
  return [...plan.opening.map(({ say }) => say), ...(plan.more ?? []).map(({ say }) => say), plan.setup, readMarks(plan.narration).text, plan.close];
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
    ...plan.opening.flatMap((line, index) => getBeatProblem(() => getLineBeat(`line-${index}`, line))),
    ...(plan.more ?? []).flatMap((line, index) => getBeatProblem(() => getLineBeat(`more-${index}`, line))),
    ...getBeatProblem(() => getSpokenBeat('close', plan.close, true)),
  ];
}

export const getSceneBeatProblems = (request: Parameters<typeof getSceneBeats>[0]): string[] => getBeatProblem(() => getSceneBeats(request));
