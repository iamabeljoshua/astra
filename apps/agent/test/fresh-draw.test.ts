import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getCoreSource, getPartCatalogue } from '../src/scenes/recipe/catalogue.ts';
import { readFreshDrawing, toFreshScene } from '../src/scenes/recipe/fresh-drawing.ts';
import { createRecipeWork, type FreshTools, type RecipeWriter } from '../src/scenes/recipe/recipe-work.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { SceneRoute } from '../src/scenes/scene-types.ts';
import type { TopicRuns } from '../src/scenes/lesson/topic-runs.ts';
import { getTutorSceneBeats } from '../src/tutor/tutor-scenes.ts';

const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const ROUTE: SceneRoute = { engine: 'kit', kind: 'physics-object', topic: 'how helicopters fly', ...USAGE };
const STUDENT = 'maya';
const NO_FIT = JSON.stringify({ t: 'fit', in: false, topic: 'helicopters', why: 'no part shows one' });
const FITS = JSON.stringify({ t: 'fit', in: true, topic: 'how helicopters fly' });
const LOOK = JSON.stringify({ t: 'say', m: 'look', text: 'So this is a helicopter, hanging still above the ground.' });
const SPIN = JSON.stringify({ t: 'say', m: 'spin', text: 'Because its long blades spin, they push the air down.' });
const CODE = "function scene(kit) { return { render(t) { kit.sky({}); kit.label('Blades', { x: 100, y: 100, alpha: kit.env(t, 'spin', null) }); } }; }";
const DRAWING = [FITS, LOOK, SPIN, '```js', CODE, '```'].join('\n');

const flush = () => new Promise((resolve) => setTimeout(resolve, 120));

function setUp({ recipeText = NO_FIT, drawingText = DRAWING, isGood = true, canDrawRecipes = true, mostDrawings = 6 }: { recipeText?: string; drawingText?: string; isGood?: boolean; canDrawRecipes?: boolean; mostDrawings?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fresh-draw-'));
  const store = createSceneStore(root);
  const write = vi.fn<RecipeWriter['write']>(async () => ({ text: recipeText, ...USAGE }));
  const writeDrawing = vi.fn<FreshTools['writer']['write']>(async () => ({ text: drawingText, ...USAGE }));
  const read = vi.fn<FreshTools['reviewer']['read']>(async () => ({ isGood, reasons: isGood ? [] : ['a fault'], ...USAGE }));
  let drawings = 0;
  const fresh: FreshTools = {
    writer: { write: writeDrawing },
    reviewer: { read },
    claimDrawing: () => (drawings += 1) <= mostDrawings,
  };
  const makeWork = (studentId = STUDENT, live: { liveRuns?: TopicRuns; canWriteLive?: boolean } = {}) =>
    createRecipeWork({
      ...live,
      router: { route: vi.fn(async () => ROUTE) },
      writer: { write },
      reviewer: { read: vi.fn(async () => ({ isGood: true, reasons: [], ...USAGE })) },
      nameReader: { clear: async () => new Set() },
      matcher: { match: async () => '' },
      store,
      storeRoot: root,
      getParts: () => getPartCatalogue(),
      getCore: getCoreSource,
      getLevel: () => null,
      trace: () => {},
      fresh,
      request: 'how helicopters fly',
      isCard: false,
      studentId,
      canPlayTakes: true,
      canDrawRecipes,
      getNowMs: () => performance.now(),
      onChange: () => {},
    });
  return { root, store, write, writeDrawing, read, makeWork };
}

describe('reading a drawing', () => {
  it('reads its lines and code, and keeps only what it needs', () => {
    const read = readFreshDrawing(DRAWING);
    expect(read).toMatchObject({ isOk: true, drawing: { topic: 'how helicopters fly', code: CODE } });
  });

  it('says no line whose moment the code never uses, because nothing on screen would match it', () => {
    const extra = JSON.stringify({ t: 'say', m: 'never-drawn', text: 'And the tail rotor stops it spinning the other way.' });
    const read = readFreshDrawing([FITS, LOOK, SPIN, extra, '```js', CODE, '```'].join('\n'));
    expect(read.isOk && read.drawing.says.map(({ m }) => m)).toEqual(['look', 'spin']);
  });

  it.each([
    ['a writer that cannot draw it', NO_FIT, 'could not draw'],
    ['no code', [FITS, LOOK, SPIN].join('\n'), 'no code block'],
    ['one line', [FITS, LOOK, '```js', CODE, '```'].join('\n'), 'fewer than two'],
    ['code with no scene function', [FITS, LOOK, SPIN, '```js', 'const a = 1;', '```'].join('\n'), 'no function scene'],
    ['code that reaches outside', [FITS, LOOK, SPIN, '```js', `${CODE} fetch('x');`, '```'].join('\n'), 'reaches outside'],
    ['an address in the code', [FITS, LOOK, SPIN, '```js', `${CODE} // www.example.test`, '```'].join('\n'), 'an address'],
  ])('refuses %s', (_name, text, problem) => {
    const read = readFreshDrawing(text);
    expect(!read.isOk && read.problems.join(' ')).toContain(problem);
  });

  it('plays by its lines, with no parts, on the Canvas engine', () => {
    const read = readFreshDrawing(DRAWING);
    if (!read.isOk) throw new Error('the drawing should read');
    const scene = toFreshScene({ drawing: read.drawing, key: getSceneKey('how helicopters fly', { ownerId: STUDENT }), costUsd: 0.02, writeMs: 10 });
    expect(scene).toMatchObject({ engine: 'canvas', parts: [], moments: { look: 0 } });
    expect(getTutorSceneBeats({ plan: scene.plan, scene, number: 1 }).at(-1)?.expectsReply).toBeFalsy();
  });
});

describe('the chain', () => {
  const runToPicture = async (work: ReturnType<ReturnType<typeof setUp>['makeWork']>) => {
    work.desk.ask(work.request);
    await vi.waitFor(() => expect(work.desk.getState().kind).toMatch(/ready|failed|declined/));
    return work.desk.getState();
  };

  it('draws fresh when no part fits, and saves nothing for others until the page and the read agree', async () => {
    const { writeDrawing, read, store, makeWork } = setUp();
    const work = makeWork();
    const state = await runToPicture(work);
    expect(state.kind === 'ready' && state.scene.engine).toBe('canvas');
    expect(writeDrawing).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    await expect(store.listShared()).resolves.toEqual([]);
    work.notePage?.(true);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    await expect(store.listShared()).resolves.toHaveLength(1);
  });

  it('keeps the picture but shares no copy when the read holds it', async () => {
    const { store, makeWork } = setUp({ isGood: false });
    const work = makeWork();
    const state = await runToPicture(work);
    work.notePage?.(true);
    await flush();
    expect(state.kind).toBe('ready');
    await expect(store.listShared()).resolves.toEqual([]);
    expect(store.find(getSceneKey('how helicopters fly', { ownerId: STUDENT }))?.engine).toBe('canvas');
  });

  it('takes back a drawing the page refused, reads nothing, and draws again next time', async () => {
    const { read, writeDrawing, store, makeWork } = setUp();
    const first = makeWork();
    await runToPicture(first);
    first.notePage?.(false);
    await flush();
    expect(read).not.toHaveBeenCalled();
    expect(store.find(getSceneKey('how helicopters fly', { ownerId: STUDENT }))).toBeNull();
    await runToPicture(makeWork());
    expect(writeDrawing).toHaveBeenCalledTimes(2);
  });

  it('is instant the second time for the same student, with no model written to', async () => {
    const { writeDrawing, write, makeWork } = setUp();
    await runToPicture(makeWork());
    const second = makeWork();
    const state = await runToPicture(second);
    expect(state.kind === 'ready' && state.scene.engine).toBe('canvas');
    expect(writeDrawing).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('skips the parts on a page with no WebGL', async () => {
    const { write, writeDrawing, makeWork } = setUp({ canDrawRecipes: false });
    await runToPicture(makeWork());
    expect(write).not.toHaveBeenCalled();
    expect(writeDrawing).toHaveBeenCalledTimes(1);
  });

  it('stops at the lesson limit, with no picture', async () => {
    const { writeDrawing, makeWork } = setUp({ mostDrawings: 0 });
    const state = await runToPicture(makeWork());
    expect(state.kind).toBe('failed');
    expect(writeDrawing).not.toHaveBeenCalled();
  });

  it('falls back to words when the writer cannot draw it', async () => {
    const { makeWork } = setUp({ drawingText: NO_FIT });
    expect((await runToPicture(makeWork())).kind).toBe('failed');
  });
});

describe('live 3D, at the end of the chain', () => {
  const makeLiveRuns = () => vi.fn<TopicRuns['join']>(() => ({ plan: Promise.resolve('nothing' as const), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: false as const, reasons: ['refused'] }), leave: () => {} }));

  it('stays out when a fresh drawing lands', async () => {
    const { makeWork } = setUp();
    const join = makeLiveRuns();
    const work = makeWork(STUDENT, { liveRuns: { join }, canWriteLive: true });
    work.desk.ask(work.request);
    await flush();
    await flush();
    expect(work.desk.getState().kind).toBe('ready');
    expect(join).not.toHaveBeenCalled();
  });

  it('writes only after parts and a fresh drawing have both come to nothing', async () => {
    const { makeWork, write, writeDrawing } = setUp({ drawingText: NO_FIT });
    const join = makeLiveRuns();
    const work = makeWork(STUDENT, { liveRuns: { join }, canWriteLive: true });
    work.desk.ask(work.request);
    await flush();
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeDrawing).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledTimes(1);
  });
});

describe('a copy saved under other words', () => {
  it('stops before paying for a drawing, and spends none of the lesson\'s limit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fresh-draw-'));
    const store = createSceneStore(root);
    const read = readFreshDrawing(DRAWING);
    if (!read.isOk) throw new Error('the drawing should read');
    await store.saveChecked(toFreshScene({ drawing: read.drawing, key: getSceneKey('helicopters', { ownerId: STUDENT }), costUsd: 0, writeMs: 1 }), [], []);
    const writeDrawing = vi.fn<FreshTools['writer']['write']>(async () => ({ text: DRAWING, ...USAGE }));
    const claimDrawing = vi.fn(() => true);
    const work = createRecipeWork({
      router: { route: async () => ROUTE },
      writer: { write: async () => ({ text: NO_FIT, ...USAGE }) },
      reviewer: { read: async () => ({ isGood: true, reasons: [], ...USAGE }) },
      nameReader: { clear: async () => new Set() },
      matcher: { match: async () => 'helicopters' },
      store,
      storeRoot: root,
      getParts: () => getPartCatalogue(),
      getCore: getCoreSource,
      getLevel: () => null,
      trace: () => {},
      fresh: { writer: { write: writeDrawing }, reviewer: { read: async () => ({ isGood: true, reasons: [], ...USAGE }) }, claimDrawing },
      request: 'how helicopters fly',
      isCard: false,
      studentId: STUDENT,
      canPlayTakes: true,
      getNowMs: () => performance.now(),
      onChange: () => {},
    });
    work.desk.ask(work.request);
    await vi.waitFor(() => expect(work.desk.getState().kind).toMatch(/ready|failed|declined/));
    expect(work.desk.getState().kind).toBe('ready');
    expect(writeDrawing).not.toHaveBeenCalled();
    expect(claimDrawing).not.toHaveBeenCalled();
  });
});

describe('the prompt', () => {
  it('holds the tutor voice mark and the rule that words match the screen', () => {
    const prompt = readFileSync(join(import.meta.dirname, '../src/scenes/prompts/fresh-draw.md'), 'utf8');
    expect(prompt).toContain('{{VOICE}}');
    expect(prompt).toContain('Each line says what is on screen');
  });
});
