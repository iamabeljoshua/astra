import type { SceneEngine } from '@astra/contracts';

export const SCENE_THEMES = ['light', 'dark'] as const;
export type SceneTheme = (typeof SCENE_THEMES)[number];

export interface SceneUsage {
  model: string;
  ms: number;
  costUsd: number;
}

export interface SceneBrief {
  topic: string;
  narration: string;
  plan: string;
  moments: Readonly<Record<string, number>>;
  durationSeconds: number;
}

export interface SceneRepair {
  problems: readonly string[];
  code: string;
}

export interface WrittenScene extends SceneUsage {
  code: string;
}

export interface SceneWriter {
  name: string;
  write(brief: SceneBrief, repair: SceneRepair | null, signal: AbortSignal): Promise<WrittenScene>;
}

export interface FactError {
  moment: string;
  what: string;
  truth: string;
  confidence: string;
}

export interface SceneVerdict extends SceneUsage {
  isPass: boolean;
  errors: readonly FactError[];
}

export interface ReviewRequest {
  brief: SceneBrief;
  code: string;
  sheets: readonly { theme: SceneTheme; bytes: Buffer }[];
  /** Every line the tutor could say, because the opening, more, and closing lines are not in the narration. */
  spokenLines: readonly string[];
}

export interface SceneReviewer {
  review(request: ReviewRequest, signal: AbortSignal): Promise<SceneVerdict>;
}

export type RouteEngine = SceneEngine | 'kit' | 'none';

export interface SceneRoute extends SceneUsage {
  engine: RouteEngine;
  kind: string;
  topic: string;
}

export interface SceneRouter {
  route(request: string, signal: AbortSignal): Promise<SceneRoute>;
}

export interface OpeningLine {
  say: string;
  tex?: string;
  note?: string;
}

export interface LessonPlan {
  opening: readonly OpeningLine[];
  more?: readonly OpeningLine[];
  setup: string;
  narration: string;
  plan: string;
  close: string;
  hasNoModel?: boolean;
}

/** What the writer needs from a plan, which the planner streams before the plan is whole. */
export type SceneWords = Pick<LessonPlan, 'narration' | 'plan'>;

/** Why a lesson has no words of its own: nothing to teach, a student who may be hurt and needs the help line, or a dangerous question that gets a calm decline. */
export type NoLesson = 'nothing' | 'unsafe' | 'declined';

export interface PlanHooks {
  onFirstLine?(line: OpeningLine): void;
  onSceneWords?(words: SceneWords): void;
  /** What was wrong with the last try, for a second one. */
  note?: string;
}

export interface LessonPlanner {
  plan(topic: string, signal: AbortSignal, hooks?: PlanHooks): Promise<LessonPlan & SceneUsage>;
}

/** The planner said this topic asks for something a tutor should not teach. */
export class PlanRefused extends Error {
  /** help: a student is hurting themselves or being hurt. dangerous: the specifics could hurt someone. person: it cannot be taught without naming a living or private person, which is no danger to anyone. */
  refusedFor: 'help' | 'dangerous' | 'person';

  constructor(message: string, refusedFor: PlanRefused['refusedFor'] = 'dangerous') {
    super(message);
    this.refusedFor = refusedFor;
  }

  get wantsHelp(): boolean {
    return this.refusedFor === 'help';
  }
}

export interface NameReader {
  /** Which of these capitalised words a lesson may say. Anything it cannot vouch for is left out. */
  clear(names: readonly string[], signal: AbortSignal): Promise<ReadonlySet<string>>;
}

export interface DeclaredValue {
  name: string;
  default: number;
  lo: number;
  hi: number;
}

/** Null for a scene any student may see, which only a library card's title can make. Otherwise the one student who may see it. */
export type SceneOwner = string | null;

export interface SceneScope {
  ownerId?: SceneOwner;
  values?: Readonly<Record<string, number>>;
}

export interface SceneKey {
  id: string;
  topic: string;
  ownerId: SceneOwner;
}

/** The store holds no run a review refused, only these words, so nobody pays to write it again soon and a person can read why. */
export interface SceneRefusal {
  key: SceneKey;
  code: string;
  plan: LessonPlan;
  review: readonly FactError[];
  savedAt: string;
}

/** Tries that ended in an error or a refusal. They allow a retry later, up to a bound, because a review can refuse a true scene. */
export interface SceneTrouble {
  tries: number;
  lastAtMs: number;
  wasRefused?: boolean;
}

export interface StoredScene {
  id: string;
  topic: string;
  ownerId: SceneOwner;
  status: 'checked';
  engine: SceneEngine;
  engineVersion: string;
  code: string;
  narration: string;
  plan: LessonPlan;
  moments: Readonly<Record<string, number>>;
  parts: readonly string[];
  durationSeconds: number;
  declared: Readonly<Record<string, DeclaredValue>>;
  values: Readonly<Record<string, number>>;
  review: readonly FactError[];
  layoutNotes: readonly string[];
  isCheckedByPerson: boolean;
  takeBytes: Readonly<Record<SceneTheme, number>>;
  trace: SceneTrace;
  savedAt: string;
}

export interface SceneTrace {
  writer: string;
  attempts: number;
  writeMs: number;
  renderMs: number;
  reviewMs: number;
  totalMs: number;
  costUsd: number;
  problems: readonly string[];
}

export type UsageListener = (usage: SceneUsage & { role: 'writer' | 'reviewer' | 'router' | 'planner' | 'names' }) => void;
