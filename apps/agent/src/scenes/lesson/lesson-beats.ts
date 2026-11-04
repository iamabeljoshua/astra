import { type Beat, type ElementId, getSpokenWords, parseBeat, type RichScene } from '@astra/contracts';
import { getSceneBeat } from '../narration.ts';
import type { OpeningLine } from '../scene-types.ts';

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
