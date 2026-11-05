import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonReader } from '../../providers/anthropic.ts';
import { getTutorVoiceRules } from '../../providers/anthropic.scenes.ts';
import { TUTOR_PROMPT } from '../../tutor/prompt.ts';
import { readMarks } from '../narration.ts';
import { isSameTopic } from '../../tutor/scene-screen.ts';
import type { StoredScene } from '../scene-types.ts';
import { getNumbersSaid } from './number-words.ts';

export interface StudentNote {
  kind: string;
  about: string;
  detail?: string;
}

/** What the tutor already holds that these words may draw on. It has no name or id, and none of it is ever saved with a scene. */
export interface StudentFacts {
  level: string | null;
  interests: readonly string[];
  notes: readonly StudentNote[];
  justSaid: string;
  studentSaid: string;
}

const MOST_TOKENS = 700;
const WRITE_LIMIT_MS = 6000;
const MOST_WORDS_JUST_SAID = 70;
const MOST_STUDENT_CHARACTERS = 300;
const WORK_KINDS: ReadonlySet<string> = new Set(['showed', 'struggled']);
const SPEECH_SCHEMA = { type: 'object', additionalProperties: false, required: ['setup', 'narration', 'close'], properties: { setup: { type: 'string' }, narration: { type: 'string' }, close: { type: 'string' } } };

const getSystem = () => readFileSync(join(import.meta.dirname, '../prompts/scene-words.md'), 'utf8').replace('{{VOICE}}', getTutorVoiceRules(TUTOR_PROMPT.system));

const getLastWords = (text: string, most: number) => text.split(/\s+/).filter(Boolean).slice(-most).join(' ');

const getAllowedNumberList = ({ plan, declared, values }: StoredScene) => [...new Set([...getNumbersSaid(`${plan.setup} ${readMarks(plan.narration).text} ${plan.close}`), ...Object.values(declared).flatMap(({ default: start, lo, hi }) => [start, lo, hi]), ...Object.values(values)])].sort((first, second) => first - second);

// A note on another idea has no place in these words, so only this idea's notes leave the tutor.
const getThisIdeaNotes = (notes: readonly StudentNote[], topic: string) => notes.filter(({ kind, about }) => WORK_KINDS.has(kind) && isSameTopic(about, topic)).map(({ kind, detail }) => ({ kind, ...(detail ? { detail } : {}) }));

function getAskText(scene: StoredScene, student: StudentFacts): string {
  const { setup, narration, close, plan } = scene.plan;
  const ask = {
    topic: scene.topic,
    saved: { setup, narration, close },
    shows: { plan, parts: scene.parts, labels: scene.recipe?.labels.map(({ text, sub }) => (sub ? `${text}: ${sub}` : text)) ?? [], declared: scene.declared, values: scene.values },
    moments: readMarks(narration).marks.map(({ id }) => id),
    numbers_you_may_say: getAllowedNumberList(scene),
    student: { level: student.level, interests: student.interests, notes_on_this_idea: getThisIdeaNotes(student.notes, scene.topic) },
    just_said: getLastWords(student.justSaid, MOST_WORDS_JUST_SAID),
    student_said: student.studentSaid.slice(0, MOST_STUDENT_CHARACTERS),
  };
  return JSON.stringify(ask);
}

/** The one model call for one scene played. What it returns is not trusted until `checkSceneSpeech` has read it. */
export const writeSceneSpeech = (reader: JsonReader, scene: StoredScene, student: StudentFacts) => reader.read({ system: getSystem(), text: getAskText(scene, student), schema: SPEECH_SCHEMA, timeoutMs: WRITE_LIMIT_MS, mostTokens: MOST_TOKENS });
