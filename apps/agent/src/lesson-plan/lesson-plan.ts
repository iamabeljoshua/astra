export const LESSON_KINDS = ['handsOn', 'teachFirst'] as const;

/** A direct question goes straight to the board. A topic, a lesson, or a wish to understand teaches first. */
export type LessonKind = (typeof LESSON_KINDS)[number];

/** One stretch of a lesson, which ends when the student finishes its exercise. */
export interface LessonStep {
  /** The idea to teach first, in a few words. A direct question has none, because it starts on the exercise. */
  teach: string | null;
  /** One short thing to do together on the board. */
  exercise: string;
}

export interface LessonPlan {
  topic: string;
  kind: LessonKind;
  steps: readonly LessonStep[];
}

/** What one thing the student said does to the lesson. */
export type PlanMove = { move: 'stay' } | { move: 'new'; plan: LessonPlan } | { move: 'back'; topic: string };

const MOST_TOPIC_CHARACTERS = 80;
const MOST_STEP_CHARACTERS = 160;
const MOST_STEPS = 5;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Trims to one clean line, because what the planner writes reaches the page and the database. Empty means nothing usable. */
function toCleanLine(value: unknown, mostCharacters: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Cs}￼]/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, mostCharacters).join('').trim();
}

function parseStep(value: unknown): LessonStep | null {
  if (!isRecord(value)) return null;
  const exercise = toCleanLine(value.exercise, MOST_STEP_CHARACTERS);
  return exercise === '' ? null : { teach: toCleanLine(value.teach, MOST_STEP_CHARACTERS) || null, exercise };
}

function parsePlan(value: Record<string, unknown>): LessonPlan | null {
  const topic = toCleanLine(value.topic, MOST_TOPIC_CHARACTERS);
  const kind = LESSON_KINDS.find((option) => option === value.kind);
  const steps = (Array.isArray(value.steps) ? value.steps : []).map(parseStep).filter((step) => step !== null).slice(0, MOST_STEPS);
  return topic !== '' && kind && steps.length > 0 ? { topic, kind, steps } : null;
}

/** Reads the planner's answer. Null means it said nothing usable, so the tutor teaches on with what it has. */
export function parsePlanMove(value: unknown): PlanMove | null {
  if (!isRecord(value)) return null;
  if (value.move === 'stay') return { move: 'stay' };
  if (value.move === 'back') {
    const topic = toCleanLine(value.topic, MOST_TOPIC_CHARACTERS);
    return topic === '' ? null : { move: 'back', topic };
  }
  if (value.move !== 'new') return null;
  const plan = parsePlan(value);
  return plan && { move: 'new', plan };
}

/** A title stays on a shared device, so these keep the one it had. A list cannot catch everything, and the planner's own `stay` holds the rest. */
const NOT_FOR_A_TITLE = /\b(?:groom(?:ing|ed|er|ers|s)?|abus(?:e|ed|er|ers|ive|ing)|consent|rap(?:e|ed|ist)|molest\w*|incest|sex\w*|porn\w*|nudes?|pregnan\w*|abortions?|contracepti\w*|birth control|stds?|stis?|hiv|antidepressants?|depress(?:ed|ion)|anxiety|self[- ]?harm\w*|suicid\w*|overdos\w*|eating disorders?|anorexi\w*|bulimi\w*|drugs?|cocaine|heroin|cannabis|vap(?:e|ing)|alcoholi\w*|addict\w*|medications?|pills?|domestic violence|trafficking)\b/i;
const NAMES_NO_TOPIC = /\b(?:new|another|different|next|other)\s+(?:topic|subject|activity|lesson|thing)\b|\bsomething\s+(?:else|new|different)\b/i;

export const isSensitive = (words: string) => NOT_FOR_A_TITLE.test(words.replace(/great depression/gi, ''));

const isForATitle = (topic: string, said: string) => !NAMES_NO_TOPIC.test(topic) && !isSensitive(topic) && !isSensitive(said);

/** What code holds a planner's answer to, whatever the planner said. */
export const getTrustedMove = (move: PlanMove, said: string): PlanMove => (move.move === 'new' && !isForATitle(move.plan.topic, said) ? { move: 'stay' } : move);
