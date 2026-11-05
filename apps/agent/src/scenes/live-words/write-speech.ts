import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonReader } from '../../providers/anthropic.ts';
import { getTutorVoiceRules } from '../../providers/anthropic.scenes.ts';
import { TUTOR_PROMPT } from '../../tutor/prompt.ts';
import { readMarks } from '../narration.ts';
import { isSameTopic } from '../../tutor/scene-screen.ts';
import type { StoredScene } from '../scene-types.ts';
import type { SceneSpeech } from './check-speech.ts';
import { getNumbersSaid } from './number-words.ts';

export interface StudentNote {
  kind: string;
  about: string;
  detail?: string;
}

export interface StudentFacts {
  level: string | null;
  interests: readonly string[];
  notes: readonly StudentNote[];
  justSaid: string;
  studentSaid: string;
}

export interface SceneWordsAsk {
  scene: StoredScene;
  student: StudentFacts;
  askedAbout: string;
}

const MOST_TOKENS = 250;
const LONGEST_SETUP_WORDS = 16;
const WRITE_LIMIT_MS = 6000;
const MOST_WORDS_JUST_SAID = 70;
const MOST_STUDENT_CHARACTERS = 300;
const WORK_KINDS: ReadonlySet<string> = new Set(['showed', 'struggled']);
const BEFORE_FIRST_MOMENT = 'before_first_moment';

const getSystem = () => readFileSync(join(import.meta.dirname, '../prompts/scene-words.md'), 'utf8').replace('{{VOICE}}', getTutorVoiceRules(TUTOR_PROMPT.system));

const getLastWords = (text: string, most: number) => text.split(/\s+/).filter(Boolean).slice(-most).join(' ');

const getAllowedNumberList = ({ plan, declared, values }: StoredScene) => [...new Set([...getNumbersSaid(`${plan.setup} ${readMarks(plan.narration).text} ${plan.close}`), ...Object.values(declared).flatMap(({ default: start, lo, hi }) => [start, lo, hi]), ...Object.values(values)])].sort((first, second) => first - second);

function getSavedMoments(narration: string): Record<string, string> {
  const { text, marks } = readMarks(narration);
  const words = text.split(/\s+/).filter(Boolean);
  const before = marks[0]?.atWord ?? 0;
  return Object.fromEntries([...(before > 0 ? [[BEFORE_FIRST_MOMENT, words.slice(0, before).join(' ')] as const] : []), ...marks.map(({ id, atWord }, index) => [id, words.slice(atWord, marks[index + 1]?.atWord ?? words.length).join(' ')] as const)]);
}

// Two shapes that stay the same for every scene, so the provider compiles each once and the cached prompt survives.
const SETUP_FIELD = { type: 'string', description: `One sentence of at most ${LONGEST_SETUP_WORDS} words.` };
const SLOWER_FIELD = { type: 'object', additionalProperties: false, required: ['moment', 'words'], properties: { moment: { type: 'string' }, words: { type: 'string' } } };
const SETUP_SCHEMA = { type: 'object', additionalProperties: false, required: ['setup'], properties: { setup: SETUP_FIELD } };
const SLOWER_SCHEMA = { type: 'object', additionalProperties: false, required: ['setup', 'slower'], properties: { setup: SETUP_FIELD, slower: SLOWER_FIELD } };

const getThisIdeaNotes = (notes: readonly StudentNote[], topic: string) => notes.filter(({ kind, about }) => WORK_KINDS.has(kind) && isSameTopic(about, topic)).map(({ kind, detail }) => ({ kind, ...(detail ? { detail } : {}) }));

const hasStruggled = (notes: readonly { kind: string }[]) => notes.some(({ kind }) => kind === 'struggled');

const isWholeSentence = (words: string) => /[.?!]$/.test(words);

function toSceneSpeech(answer: unknown, saved: SceneSpeech): unknown {
  const { setup, slower } = (answer ?? {}) as { setup?: unknown; slower?: { moment?: unknown; words?: unknown } };
  const moments = getSavedMoments(saved.narration);
  if (slower !== undefined) {
    if (typeof slower.moment !== 'string' || !(slower.moment in moments) || typeof slower.words !== 'string') return { setup, narration: '', close: saved.close };
    if (isWholeSentence(moments[slower.moment] ?? '')) moments[slower.moment] = slower.words;
  }
  const narration = Object.entries(moments).map(([id, words]) => (id === BEFORE_FIRST_MOMENT ? words : `[[${id}]] ${words}`)).join(' ');
  return { setup, narration, close: saved.close };
}

function getAskText({ scene, student, askedAbout }: SceneWordsAsk, notes: readonly { kind: string }[]): string {
  const { setup, narration, close, plan } = scene.plan;
  const ask = {
    topic: scene.topic,
    saved: { setup, moments: getSavedMoments(narration), close },
    shows: plan,
    student: { level: student.level, notes_on_this_idea: notes },
    just_said: getLastWords(student.justSaid, MOST_WORDS_JUST_SAID),
    student_said: student.studentSaid.slice(0, MOST_STUDENT_CHARACTERS),
    asked_about: askedAbout.slice(0, MOST_STUDENT_CHARACTERS),
    ...(hasStruggled(notes) ? { numbers_you_may_say: getAllowedNumberList(scene) } : {}),
  };
  return JSON.stringify(ask);
}

export async function writeSceneSpeech(reader: JsonReader, ask: SceneWordsAsk) {
  const notes = getThisIdeaNotes(ask.student.notes, ask.scene.topic);
  const { answer, costUsd } = await reader.read({ system: getSystem(), text: getAskText(ask, notes), schema: hasStruggled(notes) ? SLOWER_SCHEMA : SETUP_SCHEMA, timeoutMs: WRITE_LIMIT_MS, mostTokens: MOST_TOKENS });
  return { answer: toSceneSpeech(answer, ask.scene.plan), costUsd };
}
