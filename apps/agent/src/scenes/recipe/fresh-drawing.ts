import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { getCodeProblems } from '../content-check.ts';
import type { SceneKey, StoredScene } from '../scene-types.ts';
import { addRecipeLine, createRecipeDraft, type RecipeLine, type SceneRecipe } from './recipe.ts';
import { toRecipeScene } from './recipe-scene.ts';

const FEWEST_SAYS = 2;
const MOST_CODE_LINES = 140;
const MOST_CODE_CHARACTERS = 24_000;
const FENCED_CODE = /```(?:js|javascript)?[ \t]*\n([\s\S]*?)```/;
const SCENE_FUNCTION = /function\s+scene\s*\(\s*kit\s*\)/;
/** The worker's wall stops all of these anyway, and code that names them was not written to draw. */
const REACHES_OUT = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|localStorage|sessionStorage|document|globalThis|eval|Function|navigator|parent|Worker)\b/;
const ADDRESS = /https?:|www\./i;

export interface FreshDrawing {
  topic: string;
  says: readonly RecipeLine[];
  code: string;
}

export type ReadDrawing = { isOk: true; drawing: FreshDrawing } | { isOk: false; problems: readonly string[] };

function getFreshCodeProblems(code: string): string[] {
  return [
    ...(SCENE_FUNCTION.test(code) ? [] : ['no function scene(kit)']),
    ...(REACHES_OUT.test(code) ? [`it reaches outside: ${code.match(REACHES_OUT)?.[0]}`] : []),
    ...(ADDRESS.test(code) ? ['an address in the code'] : []),
    ...(code.split('\n').length > MOST_CODE_LINES || code.length > MOST_CODE_CHARACTERS ? ['the code is too long'] : []),
    ...getCodeProblems(code),
  ];
}

/** The first line opens on what is already there, and any other line whose moment the code never names has nothing on screen to match its words. */
const getLinesTheDrawingShows = (says: readonly RecipeLine[], code: string) => says.filter(({ m }, index) => index === 0 || code.includes(`'${m}'`) || code.includes(`"${m}"`) || code.includes(`\`${m}\``));

export function readFreshDrawing(text: string): ReadDrawing {
  const codeStart = text.indexOf('```');
  const draft = createRecipeDraft();
  for (const line of (codeStart < 0 ? text : text.slice(0, codeStart)).split('\n')) addRecipeLine(draft, line);
  if (draft.fit.kind === 'noFit') return { isOk: false, problems: [`the writer could not draw it: ${draft.fit.why}`] };
  if (draft.fit.kind === 'unknown') return { isOk: false, problems: ['the reply has no fit line'] };
  if (draft.says.length < FEWEST_SAYS) return { isOk: false, problems: ['fewer than two spoken lines'] };
  const code = text.match(FENCED_CODE)?.[1]?.trim();
  if (!code) return { isOk: false, problems: ['no code block'] };
  const problems = getFreshCodeProblems(code);
  if (problems.length > 0) return { isOk: false, problems };
  const says = getLinesTheDrawingShows(draft.says, code);
  return says.length < FEWEST_SAYS ? { isOk: false, problems: ['the drawing shows too few of its lines'] } : { isOk: true, drawing: { topic: draft.fit.topic, says, code } };
}

/** A drawing plays by its lines as a recipe does, and a recipe with no parts is what holds those lines. */
export function toFreshScene({ drawing, key, costUsd, writeMs }: { drawing: FreshDrawing; key: SceneKey; costUsd: number; writeMs: number }): StoredScene {
  const recipe: SceneRecipe = { topic: drawing.topic, stage: 'studio', says: drawing.says, items: [], moves: [], labels: [], arrows: [], flows: [], gauges: [], cams: [] };
  return { ...toRecipeScene({ recipe, code: drawing.code, key, costUsd, writeMs }), engine: 'canvas', engineVersion: SCENE_ENGINE_VERSIONS.canvas };
}
