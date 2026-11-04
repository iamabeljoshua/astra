import { type LessonPlan, type LessonStep, toCleanLine } from './lesson-plan.ts';

export interface CardIdea {
  title: string;
  lines: readonly string[];
  hasScene: boolean;
}

export interface CardMaterial {
  title: string;
  ideas: readonly CardIdea[];
}

const MOST_IDEAS = 6;
const MOST_LINES_AN_IDEA = 10;
const MOST_LINE_CHARACTERS = 160;
const MOST_TITLE_CHARACTERS = 80;
const AN_EXERCISE_ON_THIS_IDEA = 'One short problem on this idea, with its numbers on the board if it has any.';

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
  return title === '' || ideas.length === 0 ? null : { title, ideas };
}

const toStep = ({ title, lines, hasScene }: CardIdea): LessonStep => ({ teach: title, exercise: AN_EXERCISE_ON_THIS_IDEA, ...(lines.length > 0 ? { material: lines } : {}), ...(hasScene ? { picture: title } : {}) });

export const toCardPlan = ({ title, ideas }: CardMaterial): LessonPlan => ({ topic: title, kind: 'teachFirst', steps: ideas.map(toStep) });

export function getCardPictures({ steps }: LessonPlan, shelfTitles: readonly string[]): (string | null)[] | null {
  if (!steps.some(({ picture }) => picture)) return null;
  return steps.map(({ picture }) => (picture && shelfTitles.includes(picture) ? picture : null));
}
