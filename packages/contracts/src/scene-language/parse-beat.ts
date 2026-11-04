import { type Beat, BEAT_LIMITS, getScriptText, getSpokenWords } from './beat.ts';
import { getOverlappingSlider, getSlidersAfter } from './board-check.ts';
import { readBeatId } from './ids.ts';
import { readSceneCommand } from './parse-command.ts';
import { checkStorableText, fail, type CheckedFields, getField, type ParseResult, type Place, readBoolean, readFields, readList, toParseResult } from './read.ts';
import type { SceneCommand, Slider } from './scene-command.ts';

const MAX_SCRIPT_PARTS = 200;
const BEAT_KEYS = ['id', 'script', 'expectsReply'];
const HOLDS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const ONLY_ZERO_WIDTH = /^\p{Cf}+$/u;

function countCommands(script: Beat['script']): number {
  return script.filter((part) => typeof part !== 'string').length;
}

function getCreatedIds(script: Beat['script']): string[] {
  return script.flatMap((part) => (typeof part !== 'string' && 'id' in part ? [part.id] : []));
}

const SAME_SPEED_TWO_WAYS = 'no two sliders on one flight that say the same speed two ways';

function getSlidersIn(script: Beat['script']): readonly Slider[] {
  return script.reduce<readonly Slider[]>((sliders, part) => (typeof part === 'string' ? sliders : getSlidersAfter(part, sliders)), []);
}

function checkSliders(script: Beat['script'], place: Place): void {
  script.forEach((part, index) => {
    if (typeof part !== 'string' && part.kind === 'slider' && getOverlappingSlider(part, getSlidersIn(script.slice(0, index)))) fail(place, SAME_SPEED_TWO_WAYS);
  });
}

function checkWords(words: string[], place: Place): void {
  if (!words.some((word) => HOLDS_LETTER_OR_DIGIT.test(word))) fail(place, 'at least one spoken word');
  if (words.some((word) => ONLY_ZERO_WIDTH.test(word))) fail(place, 'no word made only of zero-width characters');
  if (words.length > BEAT_LIMITS.words) fail(place, `at most ${BEAT_LIMITS.words} words`);
}

function checkScript(script: Beat['script'], place: Place): void {
  const text = getScriptText(script);
  checkStorableText(text, place);
  if (countCommands(script) > BEAT_LIMITS.commands) fail(place, `at most ${BEAT_LIMITS.commands} commands`);
  const createdIds = getCreatedIds(script);
  if (new Set(createdIds).size !== createdIds.length) fail(place, 'each id to be created once');
  checkSliders(script, place);
  checkWords(getSpokenWords(text), place);
  if (text.length > BEAT_LIMITS.characters) fail(place, `at most ${BEAT_LIMITS.characters} characters`);
}

function readScriptPlaces(fields: CheckedFields): Place[] {
  return readList(fields.at('script'), { maxLength: MAX_SCRIPT_PARTS, readItem: (part) => part });
}

function readCheckedBeat(fields: CheckedFields, script: Beat['script']): Beat {
  checkScript(script, fields.at('script'));
  return { id: readBeatId(fields.at('id')), script, expectsReply: readBoolean(fields.at('expectsReply')) };
}

export function readBeat(place: Place): Beat {
  const fields = readFields(place, BEAT_KEYS);
  const script = readScriptPlaces(fields).map((part): string | SceneCommand =>
    typeof part.value === 'string' ? part.value : readSceneCommand(part),
  );
  return readCheckedBeat(fields, script);
}

/** Checks a beat from a source that must already be right: the wire, the database, or a hand-written test deck. */
export function parseBeat(value: unknown): ParseResult<Beat> {
  return toParseResult(() => readBeat({ value, path: 'beat' }));
}

export interface WrittenBeat {
  beat: Beat;
  droppedCommandProblems: string[];
}

function readPartThatFits(part: Place, script: Beat['script']): string | SceneCommand {
  if (typeof part.value === 'string') return part.value;
  const command = readSceneCommand(part);
  if (countCommands(script) === BEAT_LIMITS.commands) fail(part, `no more than ${BEAT_LIMITS.commands} commands in a beat`);
  if ('id' in command && getCreatedIds(script).includes(command.id)) fail(getField(part, 'id'), 'an id not yet created in this beat');
  if (command.kind === 'slider' && getOverlappingSlider(command, getSlidersIn(script))) fail(part, SAME_SPEED_TWO_WAYS);
  return command;
}

function keepWhatFits(parts: Place[]): { script: Beat['script']; droppedCommandProblems: string[] } {
  const script: Beat['script'] = [];
  const droppedCommandProblems: string[] = [];
  for (const part of parts) {
    const kept = toParseResult(() => readPartThatFits(part, script));
    if (kept.ok) script.push(kept.value);
    else droppedCommandProblems.push(kept.problem);
  }
  return { script, droppedCommandProblems };
}

/** Checks a beat the model wrote. Its words have already played, so a command that cannot stand is dropped and reported. */
export function parseWrittenBeat(value: unknown): ParseResult<WrittenBeat> {
  return toParseResult(() => {
    const fields = readFields({ value, path: 'beat' }, BEAT_KEYS);
    const { script, droppedCommandProblems } = keepWhatFits(readScriptPlaces(fields));
    return { beat: readCheckedBeat(fields, script), droppedCommandProblems };
  });
}
