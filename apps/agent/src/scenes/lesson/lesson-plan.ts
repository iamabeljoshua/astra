import { getSpokenWords, getTexProblem } from '@astra/contracts';
import { readJsonObject } from '../model-replies.ts';
import { readMarks } from '../narration.ts';
import type { LessonPlan, OpeningLine } from '../scene-types.ts';

const MOST_OPENING_LINES = 4;
const MOST_LINE_WORDS = 30;
const MOST_NARRATION_WORDS = 58;
const FEWEST_MARKS = 2;
const MOST_NOTE_CHARACTERS = 40;

const readText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`the plan has no ${name}`);
  return value.trim();
};

function readLine(value: unknown): OpeningLine {
  const line = (value ?? {}) as Record<string, unknown>;
  const say = readText(line.say, 'opening line');
  if (getSpokenWords(say).length > MOST_LINE_WORDS) throw new Error('an opening line is too long');
  const tex = typeof line.tex === 'string' && getTexProblem(line.tex) === null ? line.tex : undefined;
  const note = typeof line.note === 'string' && line.note.length <= MOST_NOTE_CHARACTERS ? line.note : undefined;
  return { say, ...(tex ? { tex } : note ? { note } : {}) };
}

function readNarration(value: unknown): string {
  const narration = readText(value, 'narration');
  const { text, marks } = readMarks(narration);
  if (marks.length < FEWEST_MARKS) throw new Error('the narration has too few marks');
  if (new Set(marks.map((mark) => mark.id)).size !== marks.length) throw new Error('the narration repeats a mark');
  if (getSpokenWords(text).length > MOST_NARRATION_WORDS) throw new Error('the narration is too long');
  return narration;
}

export function getPlanFromText(text: string): LessonPlan {
  const reply = readJsonObject(text);
  if (!Array.isArray(reply.opening) || reply.opening.length === 0) throw new Error('the plan has no opening');
  return {
    opening: reply.opening.slice(0, MOST_OPENING_LINES).map(readLine),
    more: Array.isArray(reply.more) ? reply.more.slice(0, MOST_OPENING_LINES).map(readLine) : [],
    setup: readText(reply.setup, 'setup'),
    narration: readNarration(reply.narration),
    plan: readText(reply.plan, 'plan'),
    close: readText(reply.close, 'closing question'),
  };
}
