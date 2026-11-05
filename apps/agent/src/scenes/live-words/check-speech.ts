import { isAboutSafety } from '../../tutor/beat-text-reader.ts';
import { getClaimProblem } from '../../tutor/board-memory.ts';
import { getLineProblems } from '../content-check.ts';
import { getSceneBeatProblems, getSpokenBeats } from '../lesson/lesson-beats.ts';
import { readMarks } from '../narration.ts';
import { getSceneCommand } from '../scene-desk.ts';
import type { ElementId } from '@astra/contracts';
import type { LessonPlan, StoredScene } from '../scene-types.ts';
import { getNumbersSaid } from './number-words.ts';

/** What a scene says. The picture, its moments, and its take stay the saved ones. */
export type SceneSpeech = Pick<LessonPlan, 'setup' | 'narration' | 'close'>;

export type SpeechProblemKind = 'shape' | 'marks' | 'number' | 'name' | 'banned' | 'length' | 'beats';

export interface SpeechProblem {
  kind: SpeechProblemKind;
  detail: string;
}

export type SpeechCheck = { isOk: true; speech: SceneSpeech } | { isOk: false; problems: readonly SpeechProblem[] };

const SHORTEST_SHARE = 0.7;
const LONGEST_SHARE = 1.4;
const LONGEST_SETUP_WORDS = 20;
const FEWEST_WORDS_A_MOMENT = 2;
const SAME_NUMBER_WITHIN = 1e-6;
const NOT_SPEECH = /[[\]{}<>*#_\\\n\u2013\u2014]/;

const TELLS_WHAT_IT_KNOWS: readonly RegExp[] = [/\bi\s+(?:remember|recall|know|noticed|heard)\b/i, /\byou\s+(?:told|mentioned|struggled|got stuck|had trouble|found (?:this|that|it) hard)\b/i, /\blast (?:time|session|lesson|week)\b/i, /\b(?:earlier|previous|past|other) (?:session|lesson)s?\b/i, /\byour (?:notes?|profile|interests?|record|level|history|favou?rite)\b/i, /\b(?:since|because|as|given)\s+you(?:'re| are)?\s+(?:like|love|enjoy|into|a fan|play)/i, /\byou\s+(?:like|love|enjoy)\b/i, /\b(?:you(?:'re| are)|as) an? [\p{L}]+ (?:fan|player|lover)\b/iu];
const TUTOR_NEVER_SAYS: readonly RegExp[] = [/\b(?:amazing|incredible|mind-blowing|fascinating|great question|at its core|it's worth noting|in essence|let's explore|delve|key takeaway|the secret|the trick|clever|surprise)\b/i, /(?:^|[.?!]\s+)(?:now\s+)?(?:here's|here is|there's a)\b/i];
const POINTS_AT_THE_MACHINERY: readonly RegExp[] = [/\b(?:loading|as you can see|this (?:animation|video|scene)|the (?:animation|video|scene))\b/i];

const getSpokenText = ({ setup, narration, close }: SceneSpeech) => [setup, readMarks(narration).text, close].filter(Boolean).join(' ');
const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
const toWordKey = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function getShapeProblems(written: SceneSpeech): SpeechProblem[] {
  const fields = [written.setup, readMarks(written.narration).text, written.close];
  return fields.some((text) => NOT_SPEECH.test(text)) ? [{ kind: 'shape', detail: 'holds something that is not speech' }] : [];
}

function getMarkProblems(saved: SceneSpeech, written: SceneSpeech): SpeechProblem[] {
  const savedMarks = readMarks(saved.narration).marks;
  const { marks, text } = readMarks(written.narration);
  if (marks.map(({ id }) => id).join(' ') !== savedMarks.map(({ id }) => id).join(' ')) return [{ kind: 'marks', detail: `${marks.map(({ id }) => id).join(' ')} against ${savedMarks.map(({ id }) => id).join(' ')}` }];
  if (savedMarks[0]?.atWord === 0 && marks[0]?.atWord !== 0) return [{ kind: 'marks', detail: 'words come before the first moment' }];
  const wordCount = countWords(text);
  const short = marks.find((mark, index) => (marks[index + 1]?.atWord ?? wordCount) - mark.atWord < FEWEST_WORDS_A_MOMENT);
  return short ? [{ kind: 'marks', detail: `${short.id} has almost no words` }] : [];
}

function getAllowedNumbers(scene: StoredScene): number[] {
  const declared = Object.values(scene.declared).flatMap(({ default: start, lo, hi }) => [start, lo, hi]);
  return [...getNumbersSaid(getSpokenText(scene.plan)), ...declared, ...Object.values(scene.values)];
}

function getNumberProblems(scene: StoredScene, written: SceneSpeech): SpeechProblem[] {
  const allowed = getAllowedNumbers(scene);
  const extra = getNumbersSaid(getSpokenText(written)).filter((number) => !allowed.some((known) => Math.abs(known - number) < SAME_NUMBER_WITHIN));
  return extra.length > 0 ? [{ kind: 'number', detail: `not in the saved words: ${[...new Set(extra)].join(', ')}` }] : [];
}

const getKnownWords = (scene: StoredScene, interests: readonly string[]) => new Set([getSpokenText(scene.plan), scene.plan.plan, scene.topic, ...interests].join(' ').split(/\s+/).map(toWordKey));

// A capital inside a sentence that the saved words never used is a name no check has cleared, and clearing one would be a second model call.
function getNameProblems(scene: StoredScene, written: SceneSpeech, interests: readonly string[]): SpeechProblem[] {
  const known = getKnownWords(scene, interests);
  const text = getSpokenText(written);
  const inside = text.split(/(?<=[.?!])\s+/).flatMap((sentence) => sentence.split(/\s+/).slice(1)).flatMap((word) => word.split('-'));
  const names = inside.filter((word) => /^\p{Lu}/u.test(word) && !/^I(?:'|$)/.test(word) && !known.has(toWordKey(word)));
  const lineProblems = getLineProblems(scene.topic, { say: text });
  return [...(names.length > 0 ? [{ kind: 'name' as const, detail: names.join(', ') }] : []), ...lineProblems.map((detail) => ({ kind: 'banned' as const, detail }))];
}

function getBannedProblems(written: SceneSpeech): SpeechProblem[] {
  const text = getSpokenText(written);
  const patterns = [...TELLS_WHAT_IT_KNOWS, ...TUTOR_NEVER_SAYS, ...POINTS_AT_THE_MACHINERY].filter((pattern) => pattern.test(text));
  return [...patterns.map((pattern) => ({ kind: 'banned' as const, detail: String(text.match(pattern)?.[0]).trim() })), ...(getClaimProblem(text) ? [{ kind: 'banned' as const, detail: 'it claims a feeling' }] : []), ...(isAboutSafety(text) ? [{ kind: 'banned' as const, detail: 'it reads like a safety line' }] : [])];
}

function getLengthProblems(saved: SceneSpeech, written: SceneSpeech): SpeechProblem[] {
  const share = countWords(getSpokenText(written)) / Math.max(countWords(getSpokenText(saved)), 1);
  const problems: SpeechProblem[] = [];
  if (share < SHORTEST_SHARE || share > LONGEST_SHARE) problems.push({ kind: 'length', detail: `${share.toFixed(2)} of the saved length` });
  if (countWords(written.setup) > Math.max(LONGEST_SETUP_WORDS, countWords(saved.setup))) problems.push({ kind: 'length', detail: 'the setup runs long' });
  if (written.setup.trim() === '') problems.push({ kind: 'length', detail: 'no setup' });
  if (saved.close.trim() !== '' && !written.close.trim().endsWith('?')) problems.push({ kind: 'length', detail: 'the close asks no question' });
  if (saved.close.trim() === '' && written.close.trim() !== '') problems.push({ kind: 'length', detail: 'a close the scene does not have' });
  return problems;
}

function getBeatProblems(scene: StoredScene, written: SceneSpeech): SpeechProblem[] {
  try {
    const sceneCommand = getSceneCommand(scene, 'scene-check' as ElementId);
    if (written.close !== '') getSpokenBeats('close', written.close, true);
    return getSceneBeatProblems({ setup: written.setup, narration: written.narration, scene: sceneCommand }).map((detail) => ({ kind: 'beats', detail }));
  } catch (error) {
    return [{ kind: 'beats', detail: String(error) }];
  }
}

const isSceneSpeech = (written: unknown): written is SceneSpeech => {
  const { setup, narration, close } = (written ?? {}) as Record<string, unknown>;
  return typeof setup === 'string' && typeof narration === 'string' && typeof close === 'string';
};

const toPlainText = (text: string) => text.replace(/[\u2018\u2019]/g, "'").trim();

const toTrimmed = ({ setup, narration, close }: SceneSpeech): SceneSpeech => ({ setup: toPlainText(setup), narration: toPlainText(narration), close: toPlainText(close) });

/** Code's word on a reply. Only a reply with no problem at all plays, because the saved words are always there. */
export function checkSceneSpeech({ scene, written, interests }: { scene: StoredScene; written: unknown; interests: readonly string[] }): SpeechCheck {
  if (!isSceneSpeech(written)) return { isOk: false, problems: [{ kind: 'shape', detail: 'not the three fields' }] };
  const speech = toTrimmed(written);
  const problems = [...getShapeProblems(speech), ...getMarkProblems(scene.plan, speech), ...getNumberProblems(scene, speech), ...getNameProblems(scene, speech, interests), ...getBannedProblems(speech), ...getLengthProblems(scene.plan, speech), ...getBeatProblems(scene, speech)];
  return problems.length > 0 ? { isOk: false, problems } : { isOk: true, speech };
}
