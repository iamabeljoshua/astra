import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getLineProblems, IS_DANGEROUS, isAboutBeingUnsafe } from '../src/scenes/content-check.ts';
import { createLessonWork } from '../src/scenes/lesson/lesson-work.ts';
import { getPlanFromText } from '../src/scenes/lesson/lesson-plan.ts';
import { createTopicRuns } from '../src/scenes/lesson/topic-runs.ts';
import { getRouteFromText } from '../src/scenes/model-replies.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import { type LessonPlan, PlanRefused } from '../src/scenes/scene-types.ts';

const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const NO_WORKER = async () => {
  throw new Error('no worker');
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('a roman numeral is not the pronoun', () => {
  it.each(['World War I', 'causes of World War I', 'Henry I', "Elizabeth I's navy", 'Henry I and the barons', 'Type I diabetes'])('keeps the topic: %s', (topic) => {
    expect(getRouteFromText(JSON.stringify({ kind: 'history', engine: 'none', topic })).topic).toBe(topic);
  });

  it.each(['How I learn fractions', 'What I know about cells', 'why i hate fractions', 'Fractions I find hard', 'Should I study the moon', 'Maya I think'])('still reads the pronoun: %s', (topic) => {
    expect(getRouteFromText(JSON.stringify({ kind: 'math', engine: 'manimgx', topic })).topic).toBe('');
  });
});

describe('words about someone else, or about a blade or a unit, are not a student in danger', () => {
  it.each(['why did romeo kill himself', 'why did Hitler kill himself', 'why did Cleopatra kill herself', 'what muscles connect the shoulder blade to the neck', 'how does a helicopter blade make lift near the neck of the rotor', 'convert 500 mg to kg', 'how many kg is 500 mg'])('goes on to the router: %s', (request) => {
    expect(isAboutBeingUnsafe(request)).toBe(false);
  });

  it.each(['my brother wants to kill himself', 'a friend said she would kill herself', 'my mum might kill herself', 'i want to kill myself', 'what angle should a blade go in to reach the heart', 'where do you put a knife in the neck', '10 mg for a 50 kg person', '150 mg per kg for me'])('still gets the help line: %s', (request) => {
    expect(isAboutBeingUnsafe(request)).toBe(true);
  });
});

describe('a plan about physics', () => {
  it('may say mg', () => {
    expect(getLineProblems('weight', { say: 'Weight is m g, written mg, for a kilogram of anything.' })).not.toContain(IS_DANGEROUS);
  });

  it('still may not give a drug amount per body weight', () => {
    expect(getLineProblems('medicine', { say: 'It takes 150 mg per kilogram of body weight.' })).toContain(IS_DANGEROUS);
  });
});

describe('a living person', () => {
  const makePlan = (reply: object): (() => Promise<LessonPlan & typeof USAGE>) => async () => ({ ...getPlanFromText(JSON.stringify(reply)), ...USAGE });
  const startRuns = (planner: () => Promise<LessonPlan & typeof USAGE>) => {
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'living-')));
    return { store, runs: createTopicRuns({ planner: { plan: planner }, writers: [], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker: NO_WORKER, store, warn: () => {} }) };
  };

  it('reads a person refusal apart from a dangerous one', () => {
    expect(() => getPlanFromText('{"refused":"person"}')).toThrow(expect.objectContaining({ refusedFor: 'person' }));
    expect(() => getPlanFromText('{"refused":"dangerous"}')).toThrow(expect.objectContaining({ refusedFor: 'dangerous' }));
    expect(() => getPlanFromText('{"refused":"help"}')).toThrow(expect.objectContaining({ refusedFor: 'help', wantsHelp: true }));
    expect(() => getPlanFromText('{"refused":"help"}')).toThrow(PlanRefused);
  });

  it('means no lesson, and never the line about details that could hurt someone', async () => {
    const { runs } = startRuns(makePlan({ refused: 'person' }));
    expect(await runs.join(getSceneKey('Who is Bill Gates', { ownerId: 'maya' })).plan).toBe('nothing');
  });

  it('means no scene', async () => {
    const { runs } = startRuns(makePlan({ refused: 'person' }));
    expect(await runs.join(getSceneKey('Who is Bill Gates', { ownerId: 'maya' })).getScene()).toMatchObject({ isOk: false });
  });
});

describe('a paused topic whose plan was taught from its clean lines', () => {
  const TOPIC = 'what a derivative measures';
  const CLEAN: LessonPlan & typeof USAGE = { opening: [{ say: 'A derivative measures how fast something changes.' }, { say: 'Call me on 555 123 4567 about a derivative.' }], more: [], setup: 'Watch this.', narration: '[[a]] It changes. [[b]] It keeps changing.', plan: 'a: one\nb: two', close: 'What do you think it measures?', ...USAGE };

  it('saves those lines, so the next open on that topic pays no planner', async () => {
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'clean-')));
    const key = getSceneKey(TOPIC);
    store.saveRefusal({ key, reasons: ['too plain'], review: [], attempts: [], savedAt: new Date().toISOString() } as never);
    let plannerCalls = 0;
    const runs = createTopicRuns({ planner: { plan: async () => { plannerCalls += 1; return CLEAN; } }, writers: [], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker: NO_WORKER, store, warn: () => {} });
    const open = () => {
      const work = createLessonWork({ router: { route: async () => ({ engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE }) }, runs, store, request: TOPIC, isCard: true, studentId: 'maya', getNowMs: () => 0 });
      work.planWithoutScene();
      return work.plan;
    };
    await open();
    await flush();
    const callsAfterFirstOpen = plannerCalls;
    await open();
    await flush();
    expect(store.findWaitingPlan(key)).not.toBeNull();
    expect(plannerCalls).toBe(callsAfterFirstOpen);
  });

  it('never saves the fallback no model wrote', async () => {
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'clean-')));
    const key = getSceneKey(TOPIC);
    store.saveRefusal({ key, reasons: ['too plain'], review: [], attempts: [], savedAt: new Date().toISOString() } as never);
    const runs = createTopicRuns({ planner: { plan: async () => { throw new Error('down'); } }, writers: [], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker: NO_WORKER, store, warn: () => {} });
    const work = createLessonWork({ router: { route: async () => ({ engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE }) }, runs, store, request: TOPIC, isCard: true, studentId: 'maya', getNowMs: () => 0 });
    work.planWithoutScene();
    await work.plan;
    await flush();
    expect(store.findWaitingPlan(key)).toBeNull();
  });
});
