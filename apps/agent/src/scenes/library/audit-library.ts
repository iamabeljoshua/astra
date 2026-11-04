import { getSpokenWords } from '@astra/contracts';
import { getCodeProblems, getPlanNames, getPlanProblems } from '../content-check.ts';
import { getSpokenLines } from '../lesson/lesson-beats.ts';
import { readMarks } from '../narration.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore, getSceneKey } from '../scene-store.ts';
import { getLibraryList } from './library-list.ts';
import { getLibraryLineProblems } from './write-entry.ts';

const USUAL_LINE_WORDS = 25;
const SOME_DIGIT = /\d/;
/** The spoken list also holds what a line writes on the board, where a digit is right. */
const BOARD_LINE = 'On the board:';

// Runs every free check again on what is stored, and prints each capitalised name it finds, so a person can read the library's whole cast in one look.
const store = createSceneStore(getSceneStoreRoot());
const list = getLibraryList();
const names = new Map<string, string[]>();
let voiceCharacters = 0;
let lines = 0;
let savedCount = 0;
for (const entry of list) {
  const scene = store.find(getSceneKey(entry.title));
  if (!scene) continue;
  savedCount += 1;
  const found = getPlanNames(entry.title, scene.plan);
  for (const name of found) names.set(name, [...(names.get(name) ?? []), entry.id]);
  const spoken = getSpokenLines(scene.plan);
  lines += spoken.length;
  voiceCharacters += [readMarks(scene.narration).text, ...(scene.plan.more ?? []).map(({ say }) => say), scene.plan.close].join(' ').length;
  const problems = [...getPlanProblems(entry.title, scene.plan, new Set(found)), ...getLibraryLineProblems(scene.plan), ...getCodeProblems(scene.code), ...spoken.filter((line) => SOME_DIGIT.test(line) && !line.startsWith(BOARD_LINE)).map((line) => `a digit in speech: ${line}`),...spoken.flatMap((line) => line.split(/(?<=[.!?])\s+/)).filter((sentence) => getSpokenWords(sentence).length > USUAL_LINE_WORDS).map((sentence) => `a long sentence: ${sentence}`)];
  if (problems.length > 0) console.log(JSON.stringify({ entry: entry.id, problems }));
  if (scene.layoutNotes.length > 0) console.log(JSON.stringify({ entry: entry.id, layoutNotes: scene.layoutNotes }));
}
console.log(JSON.stringify({ saved: savedCount, of: list.length, lines, voiceCharactersPerScene: savedCount > 0 ? Math.round(voiceCharacters / savedCount) : 0 }));
console.log(JSON.stringify(Object.fromEntries([...names].sort(([first], [second]) => first.localeCompare(second)).map(([name, ids]) => [name, ids.length > 2 ? ids.length : ids.join(',')]))));
