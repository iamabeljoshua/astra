import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getKitSpokenLines } from '../src/scenes/kit-code-check.ts';
import { canTryAfterRefusal, makeScene } from '../src/scenes/make-scene.ts';
import type { RenderResult, RenderWorker } from '../src/scenes/render-worker.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneReviewer, SceneWriter } from '../src/scenes/scene-types.ts';

const PLAN: LessonPlan = { opening: [{ say: 'A derivative measures change.' }], setup: 'Watch the point.', narration: '[[curve]] Here is the curve. [[tangent]] And here is its slope at one point.', plan: 'curve: draw y equals x squared\ntangent: the tangent at x equals one', close: 'What is the slope there?' };

const makeWriter = (name: string, code = 'class Lesson(Lesson2D): pass', onWrite?: () => void): SceneWriter => ({ name, write: async () => { onWrite?.(); return { code, model: name, ms: 100, costUsd: 0.1 }; } });

const goodRender: RenderResult = { isOk: true, takes: [{ theme: 'light', bytes: Buffer.from('light'), makeMs: 1, seconds: 8, parts: ['curve'] }, { theme: 'dark', bytes: Buffer.from('dark'), makeMs: 1, seconds: 8, parts: ['curve'] }], sheets: [{ theme: 'light', bytes: Buffer.from('png') }, { theme: 'dark', bytes: Buffer.from('png') }], layoutProblems: [], layoutNotes: [], declared: {}, ms: 50 };
const passing: SceneReviewer = { review: async () => ({ isPass: true, errors: [], model: 'fake', ms: 10, costUsd: 0.01 }) };
const failing: SceneReviewer = { review: async () => ({ isPass: false, errors: [{ moment: 'tangent', what: 'the slope label says 3 and the code computes 2', truth: 'the slope is 2', confidence: 'high' }], model: 'fake', ms: 10, costUsd: 0.01 }) };

function setUp({ renders = [goodRender], reviewer = passing }: { renders?: RenderResult[]; reviewer?: SceneReviewer } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scene-store-'));
  const store = createSceneStore(root);
  let call = 0;
  const jobs: Parameters<RenderWorker>[0][] = [];
  const worker: RenderWorker = async (job) => {
    jobs.push(job);
    return renders[Math.min(call++, renders.length - 1)] as RenderResult;
  };
  return { root, store, worker, jobs, reviewer };
}

describe('making a scene', () => {
  it('saves a scene that passes, with code, moments, and a take per theme', async () => {
    const { store, worker, reviewer, jobs } = setUp();
    const made = await makeScene({ writers: [makeWriter('first')], reviewer, worker, store }, { topic: 'What a derivative measures', plan: PLAN });
    expect(made.isOk).toBe(true);
    const saved = store.find(getSceneKey('What a derivative measures'));
    expect(saved?.status).toBe('checked');
    expect(saved?.code).toContain('class Lesson');
    expect(Object.keys(saved?.moments ?? {})).toEqual(['curve', 'tangent']);
    expect(saved?.takeBytes).toEqual({ light: 5, dark: 4 });
    expect(saved?.engineVersion).toBe('0.1.1');
    expect(jobs[0]?.themes).toEqual(['light', 'dark']);
  });

  it('hands over to the fallback, with the reasons, when the gate fails, and does not race them', async () => {
    const { store, worker, reviewer } = setUp({ renders: [{ isOk: false, stage: 'gate', reasons: ['import os is not allowed'], ms: 5 }, goodRender] });
    const seen: (string | null)[] = [];
    const fallback: SceneWriter = { name: 'fallback', write: async (_brief, repair) => { seen.push(repair?.problems[0] ?? null); return { code: 'class Lesson: pass', model: 'fallback', ms: 100, costUsd: 0.1 }; } };
    let firstCalls = 0;
    const made = await makeScene({ writers: [makeWriter('first', 'import os', () => (firstCalls += 1)), fallback], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(true);
    expect(firstCalls).toBe(1);
    expect(seen).toEqual(['import os is not allowed']);
    expect(store.find(getSceneKey('Slope'))?.trace.writer).toBe('fallback');
  });

  it('hands over when the first writer stalls or fails', async () => {
    const { store, worker, reviewer } = setUp();
    const broken: SceneWriter = { name: 'broken', write: async () => { throw new Error('overloaded'); } };
    const made = await makeScene({ writers: [broken, makeWriter('fallback')], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(true);
  });

  it('treats text crossed by a line as a failed check on a first try for a card', async () => {
    const { store, worker, reviewer } = setUp({ renders: [{ ...goodRender, layoutProblems: ['t=16s Line runs through the text'] } as RenderResult, goodRender] });
    let writes = 0;
    const made = await makeScene({ writers: [makeWriter('first', undefined, () => { writes += 1; }), makeWriter('second', undefined, () => { writes += 1; })], reviewer, worker, store, warn: () => {} }, { topic: 'what a derivative measures', plan: PLAN });
    expect(made.isOk).toBe(true);
    expect(writes).toBe(2);
  });

  it('tells the writer about a layout problem once, though each theme reports it', async () => {
    const { store, worker, reviewer } = setUp({ renders: [{ ...goodRender, layoutProblems: ['t=1s (scene-light.py:9) a label is cut by the frame', 't=1s (scene-dark.py:9) a label is cut by the frame'] } as RenderResult] });
    const made = await makeScene({ writers: [makeWriter('first')], reviewer, worker, store, warn: () => {} }, { topic: 'what a derivative measures', plan: PLAN });
    expect(made).toEqual({ isOk: false, reasons: ['layout: t=1s (scene.py:9) a label is cut by the frame'] });
  });

  it('never reviews a scene with no pictures, because a reviewer would have nothing to see', async () => {
    const { store, worker, reviewer } = setUp({ renders: [{ ...goodRender, sheets: [] } as RenderResult] });
    const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made.isOk).toBe(false);
  });

  it('keeps a planted fact error from a student, and keeps only the words of the refusal, with the reviewer\'s report', async () => {
    const { root, store, worker } = setUp();
    const made = await makeScene({ writers: [makeWriter('first')], reviewer: failing, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(made).toEqual({ isOk: false, reasons: ['the slope label says 3 and the code computes 2'] });
    expect(store.find(getSceneKey('Slope'))).toBeNull();
    expect(store.findRefusal(getSceneKey('Slope'))?.review[0]?.truth).toBe('the slope is 2');
    expect(existsSync(join(root, 'scenes'))).toBe(false);
  });

  it('saves no take and no picture from a run the review rejects, because a run is untrusted until then', async () => {
    const { root, store, worker } = setUp();
    await makeScene({ writers: [makeWriter('first')], reviewer: failing, worker, store }, { topic: 'Slope', plan: PLAN });
    const everything = readdirSync(root, { recursive: true }).map(String);
    expect(everything.filter((name) => name.endsWith('.br') || name.endsWith('.png'))).toEqual([]);
  });

  it('never saves before the review has answered', async () => {
    const { root, store, worker } = setUp();
    let filesDuringReview: string[] = [];
    const watching: SceneReviewer = { review: async () => { filesDuringReview = readdirSync(root, { recursive: true }).map(String); return { isPass: true, errors: [], model: 'fake', ms: 1, costUsd: 0 }; } };
    await makeScene({ writers: [makeWriter('first')], reviewer: watching, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(filesDuringReview).toEqual([]);
    expect(store.find(getSceneKey('Slope'))?.status).toBe('checked');
  });

  describe('an error from a model', () => {
    const overloaded: SceneReviewer = { review: async () => { throw new Error('529 overloaded'); } };

    it('is never a verdict: nothing is saved, so the topic is not blocked', async () => {
      const { store, worker } = setUp();
      const made = await makeScene({ writers: [makeWriter('first')], reviewer: overloaded, worker, store, getWallMs: () => 0 }, { topic: 'Slope', plan: PLAN });
      expect(made.isOk).toBe(false);
      expect(store.find(getSceneKey('Slope'))).toBeNull();
      expect(store.findRefusal(getSceneKey('Slope'))).toBeNull();
    });

    it('allows a retry later, which can then pass', async () => {
      const { store, worker } = setUp();
      await makeScene({ writers: [makeWriter('first')], reviewer: overloaded, worker, store, getWallMs: () => 0 }, { topic: 'Slope', plan: PLAN });
      const made = await makeScene({ writers: [makeWriter('first')], reviewer: passing, worker, store, getWallMs: () => 10 * 60_000 }, { topic: 'Slope', plan: PLAN });
      expect(made.isOk).toBe(true);
    });

    it('does not pay again straight away, and stops after three tries in a day', async () => {
      const { store, worker } = setUp();
      let writes = 0;
      const writers = [makeWriter('first', 'class Lesson: pass', () => (writes += 1))];
      const tryAt = (atMs: number) => makeScene({ writers, reviewer: overloaded, worker, store, getWallMs: () => atMs }, { topic: 'Slope', plan: PLAN });
      await tryAt(0);
      await tryAt(1000);
      expect(writes).toBe(1);
      await tryAt(10 * 60_000);
      await tryAt(20 * 60_000);
      await tryAt(30 * 60_000);
      expect(writes).toBe(3);
      await tryAt(25 * 60 * 60_000);
      expect(writes).toBe(4);
    });

    it('counts writers that all fail the same way', async () => {
      const { store, worker } = setUp();
      let writes = 0;
      const broken: SceneWriter = { name: 'broken', write: async () => { writes += 1; throw new Error('overloaded'); } };
      await makeScene({ writers: [broken], reviewer: passing, worker, store, getWallMs: () => 0 }, { topic: 'Slope', plan: PLAN });
      await makeScene({ writers: [broken], reviewer: passing, worker, store, getWallMs: () => 1000 }, { topic: 'Slope', plan: PLAN });
      expect(writes).toBe(1);
    });
  });

  describe('a scene the player would refuse', () => {
    const withParts = (parts: string[]) => ({ ...goodRender, takes: (goodRender as Extract<RenderResult, { isOk: true }>).takes.map((made) => ({ ...made, parts })) }) as RenderResult;

    it.each([['an underscore in a part name', ['tangent_line']], ['more parts than a scene may hold', Array.from({ length: 25 }, (_, index) => `part-${index}`)]])('goes back to the writer and is never saved: %s', async (_name, parts) => {
      const { store, worker, reviewer } = setUp({ renders: [withParts(parts)] });
      const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
      expect(made.isOk).toBe(false);
      expect(store.find(getSceneKey('Slope'))).toBeNull();
    });

    it('gets the fallback writer the parser\'s reason', async () => {
      const { store, worker, reviewer } = setUp({ renders: [withParts(['tangent_line']), goodRender] });
      const seen: string[] = [];
      const fallback: SceneWriter = { name: 'fallback', write: async (_brief, repair) => { seen.push(...(repair?.problems ?? [])); return { code: 'class Lesson: pass', model: 'x', ms: 1, costUsd: 0 }; } };
      const made = await makeScene({ writers: [makeWriter('first'), fallback], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
      expect(made.isOk).toBe(true);
      expect(seen.join(' ')).toMatch(/tangent_line|part/);
    });

    it('refuses a plan whose line is past what a beat may say', async () => {
      const { store, worker, reviewer } = setUp();
      const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: { ...PLAN, close: `${'word '.repeat(150)}?` } });
      expect(made.isOk).toBe(false);
      expect(store.find(getSceneKey('Slope'))).toBeNull();
    });
  });

  describe('what the review sees', () => {
    it('sees a picture of each take, labelled by theme', async () => {
      const { store, worker } = setUp();
      let seenThemes: string[] = [];
      const reviewer: SceneReviewer = { review: async ({ sheets }) => { seenThemes = sheets.map(({ theme }) => theme); return { isPass: true, errors: [], model: 'x', ms: 1, costUsd: 0 }; } };
      await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
      expect(seenThemes).toEqual(['light', 'dark']);
    });

    it('sees every line the tutor would say, not only the narration', async () => {
      const { store, worker } = setUp();
      let seenLines: string[] = [];
      const reviewer: SceneReviewer = { review: async ({ spokenLines }) => { seenLines = [...spokenLines]; return { isPass: true, errors: [], model: 'x', ms: 1, costUsd: 0 }; } };
      await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: { ...PLAN, more: [{ say: 'A further line.' }] } });
      for (const line of ['A derivative measures change.', 'A further line.', 'Watch the point.', 'What is the slope there?']) expect(seenLines).toContain(line);
    });

    it('warns and refuses when it would see only one theme', async () => {
      const warnings: string[] = [];
      const { store, worker, reviewer } = setUp({ renders: [{ ...goodRender, sheets: [{ theme: 'light', bytes: Buffer.from('png') }] } as RenderResult] });
      const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store, warn: (line) => warnings.push(line) }, { topic: 'Slope', plan: PLAN });
      expect(warnings[0]).toMatch(/^::warning /);
      expect(made.isOk).toBe(false);
    });
  });

  describe('what a scene may hold', () => {
    it('sends code that names and insults someone back to the writer, and never saves it', async () => {
      const { store, worker, reviewer } = setUp();
      const code = "class Lesson(Lesson2D):\n    def construct(self):\n        ui('джейн доу обманщица')\n";
      const made = await makeScene({ writers: [makeWriter('only', code)], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
      expect(made.isOk).toBe(false);
      expect(store.find(getSceneKey('Slope'))).toBeNull();
    });

    it('never saves a plan that calls someone a cheat', async () => {
      const { store, worker, reviewer } = setUp();
      const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', plan: { ...PLAN, opening: [{ say: 'Jane Doe is a cheat.' }] } });
      expect(made.isOk).toBe(false);
      expect(store.find(getSceneKey('Slope'))).toBeNull();
    });
  });

  it('saves a typed topic under its student only', async () => {
    const { store, worker, reviewer } = setUp();
    const made = await makeScene({ writers: [makeWriter('only')], reviewer, worker, store }, { topic: 'Slope', ownerId: 'student-a', plan: PLAN });
    expect(made.isOk).toBe(true);
    expect(store.find(getSceneKey('Slope', { ownerId: 'student-a' }))?.ownerId).toBe('student-a');
    expect(store.find(getSceneKey('Slope'))).toBeNull();
    expect(store.find(getSceneKey('Slope', { ownerId: 'student-b' }))).toBeNull();
  });

  it('gives the writer a brief with no student in it', async () => {
    const { store, worker, reviewer } = setUp();
    let seenBrief: unknown = null;
    const writer: SceneWriter = { name: 'first', write: async (brief) => { seenBrief = brief; return { code: 'class Lesson: pass', model: 'x', ms: 1, costUsd: 0 }; } };
    await makeScene({ writers: [writer], reviewer, worker, store }, { topic: 'Slope', plan: PLAN });
    expect(Object.keys(seenBrief as object).sort()).toEqual(['durationSeconds', 'moments', 'narration', 'plan', 'topic']);
  });
});

describe('a scene the review refused', () => {
  it('writes again only after the wait, a bounded number of times a day, so a false refusal does not take a card from everyone', async () => {
    const { store, worker } = setUp();
    let nowMs = 1_000_000;
    let writes = 0;
    const maker = { writers: [makeWriter('w', undefined, () => { writes += 1; })], reviewer: failing, worker, store, warn: () => {}, getWallMs: () => nowMs };
    const key = getSceneKey('topic of slopes');
    expect(canTryAfterRefusal(store, key, nowMs)).toBe(true);
    await makeScene(maker, { topic: 'topic of slopes', plan: { ...PLAN, opening: [{ say: 'Topic of slopes first.' }] } });
    expect(writes).toBe(1);
    expect(canTryAfterRefusal(store, key, nowMs)).toBe(false);
    nowMs += 61 * 60_000;
    expect(canTryAfterRefusal(store, key, nowMs)).toBe(true);
    await makeScene(maker, { topic: 'topic of slopes', plan: { ...PLAN, opening: [{ say: 'Topic of slopes first.' }] } });
    nowMs += 61 * 60_000;
    await makeScene(maker, { topic: 'topic of slopes', plan: { ...PLAN, opening: [{ say: 'Topic of slopes first.' }] } });
    nowMs += 61 * 60_000;
    expect(canTryAfterRefusal(store, key, nowMs)).toBe(false);
    nowMs += 24 * 60 * 60_000;
    expect(canTryAfterRefusal(store, key, nowMs)).toBe(true);
  });
});

describe('a scene nobody wants any more', () => {
  it('stops between steps, saves nothing, and notes no trouble', async () => {
    const { store, worker } = setUp();
    const stopper = new AbortController();
    const writer: SceneWriter = { name: 'w', write: async () => { stopper.abort(); throw new Error('stopped'); } };
    const second = { name: 'second', write: async () => { throw new Error('should not run'); } };
    const made = await makeScene({ writers: [writer, second], reviewer: passing, worker, store, warn: () => {} }, { topic: 'topic of slopes', plan: { ...PLAN, opening: [{ say: 'Topic of slopes first.' }] }, signal: stopper.signal });
    expect(made).toEqual({ isOk: false, reasons: ['no longer wanted'] });
    expect(store.getTrouble(getSceneKey('topic of slopes')).tries).toBe(0);
  });
});

describe('a line through a label', () => {
  const CROSSED: RenderResult = { ...goodRender, layoutProblems: ["t=15s (scene-light.py:130)  rl (Text 'right 1') and ring (Circle): Circle runs through the text"] };
  const CUT: RenderResult = { ...goodRender, layoutProblems: ["t=15s (scene-light.py:130)  label (Text 'slope') is cut by the frame"] };
  const WORDS = { topic: 'topic of slopes', plan: { ...PLAN, opening: [{ say: 'Topic of slopes first.' }] } };

  it('stays as a note on a typed scene, which keeps its moment and writes once', async () => {
    const { store, worker } = setUp({ renders: [CROSSED] });
    let writes = 0;
    const made = await makeScene({ writers: [makeWriter('w', undefined, () => { writes += 1; }), makeWriter('second', undefined, () => { writes += 1; })], reviewer: passing, worker, store, warn: () => {} }, { ...WORDS, ownerId: 'maya' });
    expect(made.isOk).toBe(true);
    expect(writes).toBe(1);
    if (made.isOk) expect(made.scene.layoutNotes.join()).toMatch(/runs through the text/);
  });

  it('gets a card one rewrite first, and then stays as a note, so the card still has a scene', async () => {
    const { store, worker } = setUp({ renders: [CROSSED, CROSSED] });
    let writes = 0;
    const made = await makeScene({ writers: [makeWriter('w', undefined, () => { writes += 1; }), makeWriter('second', undefined, () => { writes += 1; })], reviewer: passing, worker, store, warn: () => {} }, WORDS);
    expect(made.isOk).toBe(true);
    expect(writes).toBe(2);
  });

  it('still stops a label cut by the frame, on any scene', async () => {
    const { store, worker } = setUp({ renders: [CUT] });
    const made = await makeScene({ writers: [makeWriter('w')], reviewer: passing, worker, store, warn: () => {} }, { ...WORDS, ownerId: 'maya' });
    expect(made.isOk).toBe(false);
  });
});

describe('a kit scene the review refuses', () => {
  const KIT_RENDER: RenderResult = { isOk: true, takes: [], parts: ['ball'], sheets: [{ theme: 'dark', bytes: Buffer.from('jpg') }], layoutProblems: [], layoutNotes: [], declared: {}, ms: 5 };
  const kitMaker = (reviewer: SceneReviewer, repairNotes: string[]) => {
    const { store } = setUp();
    const repairWriter: SceneWriter = { name: 'repair', write: async (_brief, repair) => { repairNotes.push(...(repair?.problems ?? [])); return { code: 'function scene(kit) { /* fixed */ }', model: 'repair', ms: 1, costUsd: 0.03 }; } };
    return { engine: 'kit' as const, themes: ['dark'] as const, writers: [makeWriter('first')], repairWriter, reviewer, worker: async () => KIT_RENDER, store };
  };

  it('saves a passing scene as a kit scene with no take, marked unchecked by a person', async () => {
    const maker = kitMaker(passing, []);
    const made = await makeScene(maker, { topic: 'What a derivative measures', ownerId: 'ada', plan: PLAN });
    expect(made).toMatchObject({ isOk: true, scene: { engine: 'kit', engineVersion: '0.1.0', ownerId: 'ada', parts: ['ball'], reviewed: true, isCheckedByPerson: false } });
  });

  it('keeps the word check whatever a maker adds to the code check', async () => {
    const worker = vi.fn(async () => KIT_RENDER);
    const made = await makeScene({ ...kitMaker(passing, []), worker, repairWriter: undefined, checkCode: () => [], writers: [makeWriter('first', 'see www.example.com')] }, { topic: 'What a derivative measures', ownerId: 'ada', plan: PLAN });
    expect(made.isOk).toBe(false);
    expect(worker).not.toHaveBeenCalled();
  });

  it('reviews only the lines a student could hear over it', async () => {
    const seen: (readonly string[])[] = [];
    const reviewer: SceneReviewer = { review: async ({ spokenLines }) => { seen.push(spokenLines); return { isPass: true, errors: [], model: 'fake', ms: 1, costUsd: 0.01 }; } };
    await makeScene({ ...kitMaker(reviewer, []), getLinesToReview: getKitSpokenLines }, { topic: 'What a derivative measures', ownerId: 'ada', plan: PLAN });
    expect(seen[0]).toEqual([PLAN.setup, 'Here is the curve. And here is its slope at one point.', PLAN.close]);
  });

  it('gives the repair writer what the review reported, and the review reads the rewrite', async () => {
    const notes: string[] = [];
    const seen: string[] = [];
    let reviews = 0;
    const reviewer: SceneReviewer = { review: async ({ code }) => { seen.push(code); reviews += 1; return reviews === 1 ? { isPass: false, errors: [{ moment: 'a', what: 'the turbine spins backward', truth: 'it spins with the compressor', confidence: 'medium' }], model: 'fake', ms: 1, costUsd: 0.01 } : { isPass: true, errors: [], model: 'fake', ms: 1, costUsd: 0.01 }; } };
    const made = await makeScene(kitMaker(reviewer, notes), { topic: 'What a derivative measures', ownerId: 'ada', plan: PLAN });
    expect(made.isOk).toBe(true);
    expect(notes).toEqual(['the turbine spins backward What is true: it spins with the compressor']);
    expect(seen[1]).toContain('fixed');
    expect(made.isOk && made.scene.code).toContain('fixed');
  });

  describe('when the review finds the narration false', () => {
    const REFUSED = { isPass: false, errors: [{ moment: 'tangent', what: 'the tutor says the slope is three', truth: 'it is two', confidence: 'high' }], model: 'fake', ms: 1, costUsd: 0.01 };
    const rewrite = (words: Record<string, string>) => {
      const seen: { narration: string; moments: Readonly<Record<string, number>> }[] = [];
      let reviews = 0;
      const reviewer: SceneReviewer = { review: async ({ brief, spokenLines }) => { seen.push(brief); reviews += 1; return reviews === 1 ? REFUSED : { isPass: spokenLines.join(' ').includes('Here'), errors: [], model: 'fake', ms: 1, costUsd: 0.01 }; } };
      const repairs: unknown[] = [];
      const repairWriter: SceneWriter = { name: 'repair', write: async (_brief, repair) => { repairs.push(repair); return { code: 'function scene(kit) { /* fixed */ }', words, model: 'repair', ms: 1, costUsd: 0.03 }; } };
      return { maker: { ...kitMaker(reviewer, []), repairWriter }, seen, repairs };
    };

    it('lets the rewrite correct its words, moves the moments with them, and saves what was reviewed', async () => {
      const narration = '[[curve]] Here is the curve, drawn out slowly and with some care. [[tangent]] And here is its slope at one point.';
      const { maker, seen, repairs } = rewrite({ narration });
      const made = await makeScene(maker, { topic: 'What a derivative measures', ownerId: 'ada', plan: PLAN });
      expect(repairs[0]).toMatchObject({ canChangeWords: true });
      expect(seen[1]?.narration).toBe(narration);
      expect(seen[1]?.moments.tangent).toBeGreaterThan(seen[0]?.moments.tangent ?? Infinity);
      expect(made).toMatchObject({ isOk: true, scene: { narration, plan: { narration } } });
      expect(made.isOk && made.scene.moments.tangent).toBe(seen[1]?.moments.tangent);
    });

    it.each([
      ['moved its marks', { narration: '[[other]] Here is the curve. [[tangent]] And here is its slope.' }],
      ['dropped a mark', { narration: '[[curve]] Here is the curve and its slope.' }],
      ['named a person', { narration: '[[curve]] Here is what Tom Smith drew. [[tangent]] And here is its slope.' }],
      ['added an address', { close: 'See www.example.com for more?' }],
    ])('keeps the old words when the rewrite %s, so the review still has them to refuse', async (_name, words) => {
      const { maker, seen } = rewrite(words);
      await makeScene(maker, { topic: 'What a derivative measures', ownerId: 'ada', plan: PLAN });
      expect(seen[1]?.narration).toBe(PLAN.narration);
    });
  });

  it('shows nothing when the rewrite is refused too, and keeps only its words', async () => {
    const maker = kitMaker(failing, []);
    const made = await makeScene(maker, { topic: 'What a derivative measures', ownerId: 'ada', plan: PLAN });
    expect(made.isOk).toBe(false);
    expect(maker.store.find(getSceneKey('What a derivative measures', { ownerId: 'ada' }))).toBeNull();
    expect(maker.store.findRefusal(getSceneKey('What a derivative measures', { ownerId: 'ada' }))?.code).toContain('fixed');
  });
});
