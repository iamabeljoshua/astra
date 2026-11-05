import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonReader } from '../../providers/anthropic.ts';
import { getTutorVoiceRules } from '../../providers/anthropic.scenes.ts';
import { TUTOR_PROMPT } from '../../tutor/prompt.ts';
import { readMarks } from '../narration.ts';
import { isSameTopic } from '../../tutor/scene-screen.ts';
import type { StoredScene } from '../scene-types.ts';
import { countWords, type SceneSpeech } from './check-speech.ts';
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

const MOST_TOKENS = 700;
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

const getWordCounts = ({ setup, narration, close }: SceneSpeech) => ({ setup: countWords(setup), moments: Object.fromEntries(Object.entries(getSavedMoments(narration)).map(([id, said]) => [id, countWords(said)])), close: countWords(close) });

function getSchemaGuidedBySavedMoments({ setup, narration }: SceneSpeech) {
  const saved = Object.entries(getSavedMoments(narration));
  const moments = { type: 'object', additionalProperties: false, required: saved.map(([id]) => id), properties: Object.fromEntries(saved.map(([id, said]) => [id, { type: 'string', description: `Saved says: ${said} At most ${countWords(said)} words.` }])) };
  return { type: 'object', additionalProperties: false, required: ['setup', 'moments', 'close'], properties: { setup: { type: 'string', description: `At most ${Math.max(LONGEST_SETUP_WORDS, countWords(setup))} words.` }, moments, close: { type: 'string' } } };
}

function toSceneSpeech(answer: unknown): unknown {
  const { setup, moments, close } = (answer ?? {}) as Record<string, unknown>;
  if (typeof moments !== 'object' || moments === null) return answer;
  const narration = Object.entries(moments as Record<string, unknown>).map(([id, words]) => (id === BEFORE_FIRST_MOMENT ? String(words) : `[[${id}]] ${String(words)}`)).join(' ');
  return { setup, narration, close };
}

const getThisIdeaNotes = (notes: readonly StudentNote[], topic: string) => notes.filter(({ kind, about }) => WORK_KINDS.has(kind) && isSameTopic(about, topic)).map(({ kind, detail }) => ({ kind, ...(detail ? { detail } : {}) }));

function getAskText({ scene, student, askedAbout }: SceneWordsAsk): string {
  const { setup, narration, close, plan } = scene.plan;
  const ask = {
    topic: scene.topic,
    saved: { setup, narration, close },
    shows: { plan, parts: scene.parts, labels: scene.recipe?.labels.map(({ text, sub }) => (sub ? `${text}: ${sub}` : text)) ?? [], declared: scene.declared, values: scene.values },
    word_counts: getWordCounts(scene.plan),
    numbers_you_may_say: getAllowedNumberList(scene),
    student: { level: student.level, interests: student.interests, notes_on_this_idea: getThisIdeaNotes(student.notes, scene.topic) },
    just_said: getLastWords(student.justSaid, MOST_WORDS_JUST_SAID),
    student_said: student.studentSaid.slice(0, MOST_STUDENT_CHARACTERS),
    asked_about: askedAbout.slice(0, MOST_STUDENT_CHARACTERS),
  };
  return JSON.stringify(ask);
}

export async function writeSceneSpeech(reader: JsonReader, ask: SceneWordsAsk) {
  const { answer, costUsd } = await reader.read({ system: getSystem(), text: getAskText(ask), schema: getSchemaGuidedBySavedMoments(ask.scene.plan), timeoutMs: WRITE_LIMIT_MS, mostTokens: MOST_TOKENS });
  return { answer: toSceneSpeech(answer), costUsd };
}
