import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withoutFillerOpener } from '../../lesson-plan/lesson-rules.ts';
import { getClaimProblem } from '../../tutor/board-memory.ts';
import { isSameTopic } from '../../tutor/scene-screen.ts';
import { getLineProblems, getLineNames, isAboutBeingUnsafe, isOnlyAskingForHelp } from '../content-check.ts';
import type { MadeScene } from '../make-scene.ts';
import { DANGEROUS_KIND, SAFETY_KIND } from '../model-replies.ts';
import { createSceneDesk, type SceneDesk, type SceneState } from '../scene-desk.ts';
import { getSceneKey, type SceneStore } from '../scene-store.ts';
import type { NameReader, SceneRoute, SceneRouter, SceneUsage, StoredScene } from '../scene-types.ts';
import type { PartCatalogue } from './catalogue.ts';
import { addRecipeLine, checkRecipe, compileRecipe, createRecipeDraft, type RecipeLine, type SceneRecipe } from './recipe.ts';
import { readFreshDrawing, toFreshScene, type FreshDrawing } from './fresh-drawing.ts';
import { toRecipeScene } from './recipe-scene.ts';

const ROUTER_LIMIT_MS = 6000;
const MATCH_LIMIT_MS = 6000;
const RECIPE_LIMIT_MS = 12_000;
/** Sonnet took 20 s at worst in the lab, on a machine at load 60. */
const FRESH_LIMIT_MS = 32_000;
const NAME_LIMIT_MS = 3000;
const LEVEL_KEYS = ['middle_school', 'high_school', 'university', 'out_of_school'];
const NO_ROUTE = { engine: 'none', kind: 'none', topic: '', model: 'none', ms: 0, costUsd: 0 } as const;
const SAVED_ROUTE = { engine: 'kit', kind: 'saved', model: 'none', ms: 0, costUsd: 0 } as const;
export interface RecipeAsk {
  topic: string;
  level: string | null;
}

export interface SceneMatcher {
  match(topic: string, titles: readonly string[], signal: AbortSignal): Promise<string>;
}

export interface RecipeWriter {
  write(ask: RecipeAsk, parts: PartCatalogue, signal: AbortSignal): Promise<{ text: string } & SceneUsage>;
}

export interface RecipeVerdict extends SceneUsage {
  isGood: boolean;
  reasons: readonly string[];
}

export interface RecipeReviewer {
  read(request: { recipe: SceneRecipe; parts: PartCatalogue }, signal: AbortSignal): Promise<RecipeVerdict>;
}

export interface FreshWriter {
  write(ask: RecipeAsk, signal: AbortSignal): Promise<{ text: string } & SceneUsage>;
}

export interface FreshReviewer {
  read(drawing: FreshDrawing, signal: AbortSignal): Promise<RecipeVerdict>;
}

export interface FreshTools {
  writer: FreshWriter;
  reviewer: FreshReviewer;
  /** False once this lesson has made all the drawings it may. */
  canDraw(): boolean;
  /** Counted once written, because a drawing stopped by a saved copy or a part that fits is not one the lesson has. */
  noteDrawn(): void;
}

export interface SceneWork {
  request: string;
  desk: SceneDesk;
  leave(): void;
  /** What the page made of the scene. A fresh drawing is read and shared only once its frame check has passed, and one the check refused is not kept. */
  notePage?(isDrawn: boolean): void;
}

export interface SceneWorkInput {
  request: string;
  isCard: boolean;
  studentId: string;
  canPlayTakes: boolean;
  canDrawRecipes?: boolean;
  getNowMs(): number;
  onChange(state: SceneState, atMs: number): void;
}

export interface RecipeWorkTools {
  router: SceneRouter;
  writer: RecipeWriter;
  reviewer: RecipeReviewer;
  nameReader: NameReader;
  matcher: SceneMatcher;
  store: SceneStore;
  storeRoot: string;
  getParts(): PartCatalogue;
  getCore(): string;
  getLevel(): string | null;
  trace(name: string, fields?: Record<string, unknown>): void;
  fresh?: FreshTools | null;
}

const getLevelValues = (level: string | null): Record<string, number> => ({ level: level === null ? -1 : LEVEL_KEYS.indexOf(level) });

const getSharedKey = (topic: string, level: string | null) => getSceneKey(topic, { values: getLevelValues(level) });

function appendLine(root: string, file: string, line: object): void {
  mkdirSync(root, { recursive: true });
  appendFileSync(join(root, file), `${JSON.stringify(line)}\n`);
}

const MISSES_FILE = 'part-misses.jsonl';
const REVIEWS_FILE = 'recipe-reviews.jsonl';

async function getCleanLines({ topic, says, nameReader, signal }: { topic: string; says: readonly RecipeLine[]; nameReader: NameReader; signal: AbortSignal }): Promise<{ says: readonly RecipeLine[]; problems: readonly string[] }> {
  const clean = says.map(({ m, text }) => ({ m, text: withoutFillerOpener(text) }));
  const names = [...new Set(clean.flatMap(({ text }) => getLineNames(topic, { say: text })))];
  const cleared = names.length > 0 ? await nameReader.clear(names, AbortSignal.any([AbortSignal.timeout(NAME_LIMIT_MS), signal])).catch(() => new Set<string>()) : new Set<string>();
  const refused = names.filter((name) => !cleared.has(name));
  return { says: clean, problems: [...clean.flatMap(({ text }) => [...getLineProblems(topic, { say: text }, cleared), ...(getClaimProblem(text) ? ['it claims a feeling'] : [])]), ...(refused.length > 0 ? [`names not cleared: ${refused.join(', ')}`] : [])] };
}

/** An exact saved scene if there is one, else whichever lands first of a matched saved scene and a new picture, from parts when a part fits and drawn fresh when none does. */
export function createRecipeWork({ router, writer, reviewer, nameReader, matcher, store, storeRoot, getParts, getCore, getLevel, trace, fresh = null, request, isCard, studentId, canPlayTakes, canDrawRecipes = true, getNowMs, onChange }: RecipeWorkTools & SceneWorkInput): SceneWork {
  const leaving = new AbortController();
  const stopDrawing = new AbortController();
  const askedAtMs = getNowMs();
  const level = getLevel();
  const ownKey = (topic: string) => getSceneKey(topic, { ownerId: studentId });
  const canPlayEngine = ({ engine }: StoredScene) => (engine === 'canvas' ? fresh !== null : engine === 'kit' ? canDrawRecipes : canPlayTakes);
  const isPlayableHere = (scene: StoredScene | null) => (scene && canPlayEngine(scene) ? scene : null);
  const findPlayable = (topic: string) => isPlayableHere(store.find(getSceneKey(topic))) ?? isPlayableHere(store.find(getSharedKey(topic, level))) ?? isPlayableHere(store.find(ownKey(topic)));
  let drawing: Promise<StoredScene> | null = null;
  let matching: Promise<StoredScene> | null = null;
  let routedTopic = request;
  let drawingOnPage: { scene: StoredScene; drawing: FreshDrawing } | null = null;
  const isStopping = () => leaving.signal.aborted || stopDrawing.signal.aborted;
  const noteTime = (name: string, fields: Record<string, unknown> = {}) => trace(name, { text: request, afterMs: Math.round(getNowMs() - askedAtMs), ...fields });

  const reviewBehind = async (scene: StoredScene, read: () => Promise<RecipeVerdict>) => {
    const startedAt = getNowMs();
    const verdict = await read().catch((error: unknown) => ({ isGood: false, reasons: [`no review: ${String(error)}`], model: 'none', ms: 0, costUsd: 0 }));
    noteTime('recipeReviewed', { isGood: verdict.isGood, reasons: verdict.reasons, reviewMs: Math.round(getNowMs() - startedAt) });
    appendLine(storeRoot, REVIEWS_FILE, { atIso: new Date().toISOString(), topic: scene.topic, isGood: verdict.isGood, reasons: verdict.reasons, costUsd: verdict.costUsd });
    if (!verdict.isGood || !routedTopic) return;
    const key = getSharedKey(routedTopic, level);
    if (!store.find(key)) await store.saveChecked({ ...scene, id: key.id, topic: key.topic, ownerId: null }, [], []).catch((error: unknown) => noteTime('recipeShareFailed', { problem: String(error) }));
  };

  const drawFresh = async (tools: FreshTools, partFits: AbortSignal): Promise<StoredScene> => {
    if (!tools.canDraw()) throw new Error('this lesson has made all its fresh drawings');
    const signal = AbortSignal.any([AbortSignal.timeout(FRESH_LIMIT_MS), leaving.signal, stopDrawing.signal, partFits]);
    noteTime('freshStarted');
    const reply = await tools.writer.write({ topic: request, level }, signal);
    tools.noteDrawn();
    noteTime('freshWritten', { writeMs: Math.round(reply.ms), costUsd: reply.costUsd });
    const read = readFreshDrawing(reply.text);
    if (!read.isOk) throw new Error(read.problems.join('; '));
    const { says, problems } = await getCleanLines({ topic: request, says: read.drawing.says, nameReader, signal });
    if (problems.length > 0) throw new Error(`the words were refused: ${problems.join('; ')}`);
    const drawing = { ...read.drawing, says };
    const scene = await store.saveChecked(toFreshScene({ drawing, key: ownKey(request), costUsd: reply.costUsd, writeMs: reply.ms }), [], []);
    drawingOnPage = { scene, drawing };
    return scene;
  };

  const drawFromParts = async (): Promise<StoredScene | 'noPart'> => {
    const signal = AbortSignal.any([AbortSignal.timeout(RECIPE_LIMIT_MS), leaving.signal, stopDrawing.signal]);
    const parts = getParts();
    const reply = await writer.write({ topic: request, level }, parts, signal).catch((error: unknown) => {
      if (!fresh || isStopping()) throw error;
      return null;
    });
    if (!reply) return 'noPart';
    noteTime('recipeWritten', { writeMs: Math.round(reply.ms), costUsd: reply.costUsd });
    const draft = createRecipeDraft();
    for (const line of reply.text.split('\n')) addRecipeLine(draft, line);
    if (draft.fit.kind === 'noFit') appendLine(storeRoot, MISSES_FILE, { atIso: new Date().toISOString(), topic: request, why: draft.fit.why, level });
    const checked = checkRecipe(draft, parts);
    if (!checked.isOk && fresh) return 'noPart';
    if (!checked.isOk) throw new Error(checked.problems.join('; '));
    const { says, problems } = await getCleanLines({ topic: request, says: checked.recipe.says, nameReader, signal });
    if (problems.length > 0) throw new Error(`the words were refused: ${problems.join('; ')}`);
    const recipe = { ...checked.recipe, says };
    noteTime('recipeChecked', { parts: recipe.items.map(({ part }) => part), dropped: checked.dropped, unreadLines: draft.unreadLines });
    const key = ownKey(request);
    const scene = await store.saveChecked(toRecipeScene({ recipe, code: compileRecipe(recipe, { core: getCore(), parts }), key, costUsd: reply.costUsd, writeMs: reply.ms }), [], []);
    void reviewBehind(scene, () => reviewer.read({ recipe, parts: getParts() }, leaving.signal));
    return scene;
  };

  // Every token is time the student waits, so the drawing starts beside the parts and the first answer that a part fits stops it, at about a third of a cent.
  const draw = async (): Promise<StoredScene> => {
    if (!fresh) {
      const fromParts = canDrawRecipes ? await drawFromParts() : 'noPart';
      if (fromParts === 'noPart') throw new Error('this page cannot draw from parts');
      return fromParts;
    }
    const partFits = new AbortController();
    const drawn = drawFresh(fresh, partFits.signal);
    drawn.catch(() => {});
    const fromParts = canDrawRecipes ? await drawFromParts() : 'noPart';
    if (fromParts === 'noPart') return drawn;
    partFits.abort();
    return fromParts;
  };

  const match = async (): Promise<StoredScene> => {
    const shelf = [...(await store.listShared()), ...(fresh ? await store.listOwned(studentId) : [])];
    const titles = [...new Set(shelf.map(({ topic }) => topic))];
    if (titles.length === 0) throw new Error('nothing saved');
    const title = await matcher.match(request, titles, AbortSignal.any([AbortSignal.timeout(MATCH_LIMIT_MS), leaving.signal]));
    const found = titles.includes(title) && isSameTopic(request, title) ? findPlayable(title) : null;
    noteTime('sceneMatched', { title: found ? title : '' });
    if (!found) throw new Error('no saved scene fits');
    stopDrawing.abort();
    return found;
  };

  const getFirstPicture = async (): Promise<MadeScene> => {
    if (!drawing || !matching) return { isOk: false, reasons: ['the saved scene is gone'] };
    try {
      const scene = await Promise.any([drawing, matching.then((found) => (stopDrawing.abort(), found))]);
      return { isOk: true, scene };
    } catch (error) {
      const reasons = error instanceof AggregateError ? error.errors.map(String) : [String(error)];
      noteTime('recipeNoPicture', { reasons });
      return { isOk: false, reasons };
    }
  };

  const isStopRoute = (route: SceneRoute) => route.kind === SAFETY_KIND || route.kind === DANGEROUS_KIND || (!isCard && isAboutBeingUnsafe(route.topic));

  const getRoute = async (): Promise<SceneRoute> => {
    if (!isCard && (isOnlyAskingForHelp(request) || isAboutBeingUnsafe(request))) return { ...NO_ROUTE, kind: SAFETY_KIND };
    const saved = findPlayable(request);
    if (saved) return { ...SAVED_ROUTE, topic: request };
    drawing = draw();
    matching = match();
    drawing.catch(() => {});
    matching.catch(() => {});
    const route = await router.route(request, AbortSignal.any([AbortSignal.timeout(ROUTER_LIMIT_MS), leaving.signal]));
    noteTime('sceneRouted', { kind: route.kind, engine: route.engine, routed: route.topic, routeMs: Math.round(route.ms) });
    if (leaving.signal.aborted || isStopRoute(route) || route.engine === 'none') {
      stopDrawing.abort();
      return { ...route, engine: 'none', topic: '' };
    }
    routedTopic = route.topic;
    return { ...route, engine: 'kit', topic: isCard ? request : route.topic || request };
  };

  const desk = createSceneDesk({
    getNowMs,
    onChange,
    drawsEngine: 'kit',
    route: getRoute,
    async make({ topic }) {
      const saved = findPlayable(topic);
      if (saved) {
        stopDrawing.abort();
        return { isOk: true, scene: saved };
      }
      return getFirstPicture();
    },
  });

  return {
    request,
    desk,
    leave() {
      leaving.abort();
    },
    notePage(isDrawn) {
      const waiting = drawingOnPage;
      drawingOnPage = null;
      if (!waiting || !fresh) return;
      noteTime('freshOnPage', { isDrawn });
      if (isDrawn) void reviewBehind(waiting.scene, () => fresh.reviewer.read(waiting.drawing, leaving.signal));
      else void store.forget(ownKey(request));
    },
  };
}
