import { canRenderTex } from '@astra/board/tex-check';
import { getSpokenWords, parseSceneCommand } from '@astra/contracts';
import { findFirstObject, readJsonObject } from '../model-replies.ts';
import { readMarks } from '../narration.ts';
import { type LessonPlan, type OpeningLine, PlanRefused, type SceneWords } from '../scene-types.ts';
import { getPlanBeatProblems } from './lesson-beats.ts';

const MOST_LESSON_LINES = 8;
const MOST_NARRATION_WORDS = 90;
const FEWEST_MARKS = 2;
const MOST_NOTE_CHARACTERS = 40;

const readText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`the plan has no ${name}`);
  return value.trim();
};

// The parser is the safety check. KaTeX then says whether the board can set what got past it, as x^2^3 and \\frac{1} would not.
const canBoardSetTex = (tex: string) => parseSceneCommand({ kind: 'writeMath', id: 'line-math', tex, overWords: 1 }).ok && canRenderTex(tex);

function readLine(value: unknown): OpeningLine {
  const line = (value ?? {}) as Record<string, unknown>;
  const say = readText(line.say, 'opening line');
  const tex = typeof line.tex === 'string' && canBoardSetTex(line.tex) ? line.tex : undefined;
  const note = typeof line.note === 'string' && line.note.length <= MOST_NOTE_CHARACTERS ? line.note : undefined;
  return { say, ...(tex ? { tex } : note ? { note } : {}) };
}

const SENTENCE_START = /(?<=[.!?])\s+/;

// A long take is cut at whole sentences and keeps only what its marks still need, because a plan that runs over is still a good plan.
function trimSceneWords(narration: string, plan: string): SceneWords {
  let kept = '';
  for (const sentence of narration.split(SENTENCE_START)) {
    const next = kept === '' ? sentence : `${kept} ${sentence}`;
    if (getSpokenWords(readMarks(next).text).length > MOST_NARRATION_WORDS) break;
    kept = next;
  }
  const keptMarks = new Set(readMarks(kept).marks.map((mark) => mark.id));
  const droppedMarks = readMarks(narration).marks.map((mark) => mark.id).filter((id) => !keptMarks.has(id));
  return { narration: kept, plan: plan.split('\n').filter((line) => !droppedMarks.some((id) => line.trimStart().startsWith(`${id}:`))).join('\n') };
}

function readSceneWords(narrationValue: unknown, planValue: unknown): SceneWords {
  const words = trimSceneWords(readText(narrationValue, 'narration'), readText(planValue, 'plan'));
  const { marks } = readMarks(words.narration);
  if (marks.length < FEWEST_MARKS) throw new Error(`the narration has too few marks, or is too long to keep ${FEWEST_MARKS} of them`);
  if (new Set(marks.map((mark) => mark.id)).size !== marks.length) throw new Error('the narration repeats a mark');
  return words;
}

const FIRST_LINE = /"first"\s*:\s*|"opening"\s*:\s*\[/;

export function getFirstLineFromPartialText(text: string): OpeningLine | null {
  const found = FIRST_LINE.exec(text);
  const object = found ? findFirstObject(text.slice(found.index + found[0].length)) : null;
  if (!object) return null;
  try {
    return readLine(JSON.parse(object));
  } catch {
    return null;
  }
}

function readFinishedString(text: string, name: string): string | null {
  const found = new RegExp(`"${name}"\\s*:\\s*"`).exec(text);
  if (!found) return null;
  const start = found.index + found[0].length;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '"') return JSON.parse(text.slice(start - 1, index + 1)) as string;
  }
  return null;
}

export function getSceneWordsFromPartialText(text: string): SceneWords | null {
  try {
    const narration = readFinishedString(text, 'narration');
    const plan = readFinishedString(text, 'plan');
    return narration === null || plan === null ? null : readSceneWords(narration, plan);
  } catch {
    return null;
  }
}

export function getPlanFromText(text: string): LessonPlan {
  const reply = readJsonObject(text);
  if (reply.refused) throw new PlanRefused('the planner says a tutor should not teach this');
  const opening = [...(reply.first ? [reply.first] : []), ...(Array.isArray(reply.opening) ? (reply.opening as unknown[]) : [])];
  if (opening.length === 0) throw new Error('the plan has no opening');
  const plan: LessonPlan = {
    opening: opening.slice(0, MOST_LESSON_LINES).map(readLine),
    more: Array.isArray(reply.more) ? reply.more.slice(0, MOST_LESSON_LINES).map(readLine) : [],
    setup: readText(reply.setup, 'setup'),
    ...readSceneWords(reply.narration, reply.plan),
    close: readText(reply.close, 'closing question'),
  };
  const problems = getPlanBeatProblems(plan);
  if (problems.length > 0) throw new Error(`the plan holds a line the board would refuse: ${problems.join('; ')}`);
  return plan;
}
