import type { SceneEngine } from '@astra/contracts';

export const SCENE_THEMES = ['light', 'dark'] as const;
export type SceneTheme = (typeof SCENE_THEMES)[number];

export interface SceneUsage {
  model: string;
  ms: number;
  costUsd: number;
}

/** The only thing a writer reads. It has a topic and shared truth, and no field that could hold a student. */
export interface SceneBrief {
  topic: string;
  /** What the tutor says, with [[moment]] marks on the words each visual belongs to. */
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

/** Reports and never rewrites, so what passes is exactly what was written. */
export interface SceneReviewer {
  review(request: { brief: SceneBrief; code: string; sheets: readonly Buffer[] }, signal: AbortSignal): Promise<SceneVerdict>;
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

/** The stand-in tutor's words for one lesson, until M3.7's brain writes them live. */
export interface LessonPlan {
  opening: readonly OpeningLine[];
  /** More to say on the plain board, used only while a scene is still being made. */
  more?: readonly OpeningLine[];
  setup: string;
  narration: string;
  plan: string;
  close: string;
}

export interface LessonPlanner {
  plan(topic: string, signal: AbortSignal): Promise<LessonPlan & SceneUsage>;
}

export interface DeclaredValue {
  name: string;
  default: number;
  lo: number;
  hi: number;
}

export type SceneStatus = 'checked' | 'rejected';

/** Everything a version change needs to make the takes again with no model call. */
export interface StoredScene {
  id: string;
  topic: string;
  status: SceneStatus;
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
  /** A person has not looked at this scene. M3.14's library flow can set it. */
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

export type UsageListener = (usage: SceneUsage & { role: 'writer' | 'reviewer' | 'router' | 'planner' }) => void;
