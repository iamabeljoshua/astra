import { type LessonPlan, type LessonStep, toCleanLine } from './lesson-plan.ts';

export interface CardIdea {
  title: string;
  lines: readonly string[];
  hasScene: boolean;
}

export interface CardMaterial {
  title: string;
  subject?: string;
  ideas: readonly CardIdea[];
}

const MOST_IDEAS = 6;
const MOST_LINES_AN_IDEA = 10;
const MOST_LINE_CHARACTERS = 160;
const MOST_TITLE_CHARACTERS = 80;
const AN_EXERCISE_ON_THIS_IDEA = 'One short problem on this idea, with its numbers on the board if it has any.';
const A_QUIZ_ON_THIS_IDEA = 'A quiz on the board about this idea: a pick, a match, events to put in order, or a blank to fill.';
/** Subjects where a lesson is quizzed on the board and nothing is calculated, whatever numbers its lines happen to hold. */
const SUBJECTS_WITH_NOTHING_TO_WORK_OUT: ReadonlySet<string> = new Set(['History', 'Philosophy', 'Art', 'Music', 'Literature']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function parseIdea(value: unknown): CardIdea | null {
  if (!isRecord(value)) return null;
  const title = toCleanLine(value.title, MOST_TITLE_CHARACTERS);
  const lines = (Array.isArray(value.lines) ? value.lines : []).map((line) => toCleanLine(line, MOST_LINE_CHARACTERS)).filter(Boolean).slice(0, MOST_LINES_AN_IDEA);
  return title === '' ? null : { title, lines, hasScene: value.hasScene === true };
}

export function parseCardMaterial(value: unknown): CardMaterial | null {
  if (!isRecord(value)) return null;
  const title = toCleanLine(value.title, MOST_TITLE_CHARACTERS);
  const ideas = (Array.isArray(value.ideas) ? value.ideas : []).map(parseIdea).filter((idea) => idea !== null).slice(0, MOST_IDEAS);
  const subject = toCleanLine(value.subject, MOST_TITLE_CHARACTERS);
  return title === '' || ideas.length === 0 ? null : { title, ...(subject ? { subject } : {}), ideas };
}

const toStep = ({ title, lines, hasScene }: CardIdea, exercise: string): LessonStep => ({ teach: title, exercise, ...(lines.length > 0 ? { material: lines } : {}), ...(hasScene ? { picture: title } : {}) });

export function toCardPlan({ title, subject, ideas }: CardMaterial): LessonPlan {
  const isQuizOnly = subject !== undefined && SUBJECTS_WITH_NOTHING_TO_WORK_OUT.has(subject);
  return { topic: title, kind: 'teachFirst', ...(isQuizOnly ? { isQuizOnly } : {}), steps: ideas.map((idea) => toStep(idea, isQuizOnly ? A_QUIZ_ON_THIS_IDEA : AN_EXERCISE_ON_THIS_IDEA)) };
}

export function getCardPictures({ steps }: LessonPlan, shelfTitles: readonly string[]): (string | null)[] | null {
  if (!steps.some(({ picture }) => picture)) return null;
  return steps.map(({ picture }) => (picture && shelfTitles.includes(picture) ? picture : null));
}
