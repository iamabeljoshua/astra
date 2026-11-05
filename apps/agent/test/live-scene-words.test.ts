import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Beat, getBeatText, getCues, type SceneAgentMessage } from '@astra/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonReader } from '../src/providers/anthropic.ts';
import { checkSceneSpeech, type SceneSpeech } from '../src/scenes/live-words/check-speech.ts';
import { createLiveSceneWords } from '../src/scenes/live-words/live-scene-words.ts';
import { getNumbersSaid } from '../src/scenes/live-words/number-words.ts';
import type { StudentFacts } from '../src/scenes/live-words/write-speech.ts';
import { createSceneStore } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import { toFreshScene } from '../src/scenes/recipe/fresh-drawing.ts';
import { toRecipeScene } from '../src/scenes/recipe/recipe-scene.ts';
import type { SceneRecipe } from '../src/scenes/recipe/recipe.ts';
import { createTutorScenes, getTutorSceneBeats, LIVE_WORDS_WAIT_MS } from '../src/tutor/tutor-scenes.ts';

const TOPIC = 'what the slope of a line tells you';
const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const PLAN: LessonPlan = { opening: [], more: [], setup: 'Watch the line tilt.', narration: '[[a]] The line climbs two steps at a time as it goes. [[b]] It climbs at one steady rate all the way along.', plan: 'A line tilts up.', close: 'What would a flat line mean?' };
const SCENE = { id: `scene-${'a'.repeat(40)}`, engine: 'manimgx', topic: TOPIC, moments: { a: 0, b: 2 }, parts: [], durationSeconds: 5, plan: PLAN, ownerId: null, declared: { rate: { name: 'rate', default: 7, lo: 0, hi: 9 } }, values: { steps: 12 }, takeBytes: { light: 1, dark: 1 } } as unknown as StoredScene;
const GOOD: SceneSpeech = { setup: 'So keep your eye on that line now.', narration: '[[a]] It climbs two steps at a time as it moves along. [[b]] Same steady climb, the same curve a ball keeps, all the way.', close: 'So what would a flat line mean?' };
const STUDENT: StudentFacts = { level: 'high_school', interests: ['football'], notes: [{ kind: 'struggled', about: 'slope of a line' }, { kind: 'struggled', about: 'long division' }], justSaid: 'Slope is just how steep something is.', studentSaid: 'ok' };

const check = (written: unknown, interests: readonly string[] = ['football']) => checkSceneSpeech({ scene: SCENE, written, interests });
const getProblemKinds = (written: unknown) => {
  const checked = check(written);
  return checked.isOk ? [] : checked.problems.map(({ kind }) => kind);
};
const withNarration = (narration: string): SceneSpeech => ({ ...GOOD, narration });

describe('reading the numbers a line says', () => {
  it.each([
    ['It starts near eleven point two kilometers per second.', [11.2]],
    ['twenty-five and 3.5 and 1,000', [25, 3.5, 1000]],
    ['two hundred and five goals', [205]],
    ['halfway is not half of it, and twice is', [0.5, 2]],
    ['x squared minus two x minus three', [2, 3]],
    ['the one on the left, and this one', []],
    ['one second later', [1]],
  ])('%s', (text, numbers) => {
    expect(getNumbersSaid(text)).toEqual(numbers);
  });
});

describe('what code lets a student hear', () => {
  it('lets through a reply with every mark, only known numbers, and about the same length', () => {
    expect(check(GOOD)).toEqual({ isOk: true, speech: GOOD });
  });

  it('allows a number from declared or values', () => {
    expect(getProblemKinds(withNarration('[[a]] It climbs seven steps at a time as it moves along. [[b]] Same steady climb, twelve steps, the same curve a ball keeps.'))).toEqual([]);
  });

  it.each([
    ['a missing mark', withNarration('[[a]] It climbs two steps at a time as it moves along and stays steady all the way there.'), 'marks'],
    ['marks out of order', withNarration('[[b]] It climbs two steps at a time as it moves along. [[a]] Same steady climb, the same curve, all the way along.'), 'marks'],
    ['an invented mark', withNarration('[[a]] It climbs two steps at a time as it moves along. [[c]] Same steady climb, the same curve, all the way along.'), 'marks'],
    ['a mark with no words', withNarration('[[a]] It climbs two steps at a time as it moves along, same steady climb, the same curve, all the way. [[b]]'), 'marks'],
    ['a number the picture does not hold', withNarration('[[a]] It climbs two steps at a time like ninety minutes of play. [[b]] Same steady climb, the same curve a ball keeps.'), 'number'],
    ['a name', withNarration('[[a]] It climbs two steps at a time like Haaland running. [[b]] Same steady climb, the same curve a ball keeps, all the way.'), 'name'],
    ['words on what the tutor holds', withNarration('[[a]] Since you like football, it climbs two steps at a time. [[b]] Same steady climb, the same curve a ball keeps, all the way.'), 'banned'],
    ['a line on a past struggle', withNarration('[[a]] You struggled with this last time, it climbs two steps. [[b]] Same steady climb, the same curve a ball keeps, all the way.'), 'banned'],
    ['words from a safety reply', withNarration('[[a]] Please tell an adult you trust, it climbs two steps at a time. [[b]] Same steady climb, the same curve a ball keeps.'), 'banned'],
    ['too few words', withNarration('[[a]] It climbs. [[b]] Steady.'), 'length'],
    ['a stray bracket', withNarration('[[a]] [laughs] It climbs two steps at a time as it moves along. [[b]] Same steady climb, the same curve, all the way.'), 'shape'],
    ['a long dash', withNarration('[[a]] It climbs two steps at a time \u2014 as it moves along. [[b]] Same steady climb, the same curve, all the way along.'), 'shape'],
  ])('refuses %s', (_name, written, kind) => {
    expect(getProblemKinds(written)).toContain(kind);
  });

  it('refuses a close with no question, and anything that is not the three fields', () => {
    expect(getProblemKinds({ ...GOOD, close: 'A flat line means no climb.' })).toContain('length');
    expect(getProblemKinds({ setup: 'x' })).toContain('shape');
    expect(getProblemKinds(null)).toContain('shape');
  });
});

describe('the same picture with other words', () => {
  it('keeps every moment, in order, and only the words differ', () => {
    const toMoments = (beats: readonly Beat[]) => beats.flatMap(getCues).flatMap(({ command }) => (command.kind === 'richScene' ? [command.sceneId] : command.kind === 'runSimulation' && command.action === 'play' ? [String(command.until)] : []));
    const saved = getTutorSceneBeats({ plan: PLAN, scene: SCENE, number: 1 });
    const live = getTutorSceneBeats({ plan: GOOD, scene: SCENE, number: 1 });
    expect(toMoments(live)).toEqual(toMoments(saved));
    expect(live.map(getBeatText).join(' ')).toContain('the same curve a ball keeps');
    expect(live.map(getBeatText).join(' ')).not.toContain('[[');
  });
});

describe('every kind of saved picture', () => {
  const RECIPE: SceneRecipe = { topic: 'how a bridge holds', stage: 'studio', says: [{ m: 'deck', text: 'So this is the deck, and the cars sit on it.' }, { m: 'cables', text: 'The cables pull up on it from the towers above.' }, { m: 'towers', text: 'And the towers push all that weight into the ground.' }], items: [], moves: [], labels: [], arrows: [], flows: [], gauges: [], cams: [] };
  const KEY = { id: `scene-${'c'.repeat(40)}`, topic: RECIPE.topic, ownerId: null };
  const STARTER = toRecipeScene({ recipe: RECIPE, code: 'function scene(kit) {}', key: KEY, costUsd: 0, writeMs: 0 });
  const FRESH = toFreshScene({ drawing: { topic: RECIPE.topic, says: RECIPE.says, code: 'function scene(kit) {}' }, key: KEY, costUsd: 0, writeMs: 0 });
  const WRITTEN: SceneSpeech = { setup: 'Right, so look at the deck, where the cars sit.', narration: '[[cables]] Those cables hold it up from the towers overhead. [[towers]] The towers then press all that weight down into the ground.', close: '' };

  it.each([['a starter recipe', STARTER], ['a fresh drawing', FRESH]])('keeps the marks of %s, and its picture never hears the live words', (_name, scene) => {
    const checked = checkSceneSpeech({ scene, written: WRITTEN, interests: [] });
    expect(checked).toEqual({ isOk: true, speech: WRITTEN });
    const toMoments = (beats: readonly Beat[]) => beats.flatMap(getCues).flatMap(({ command }) => (command.kind === 'runSimulation' && command.action === 'play' ? [String(command.until)] : []));
    const saved = getTutorSceneBeats({ plan: scene.plan, scene, number: 1 });
    const live = getTutorSceneBeats({ plan: WRITTEN, scene, number: 1 });
    expect(toMoments(live)).toEqual(toMoments(saved));
    expect(live.map(getBeatText).join(' ')).toContain('press all that weight');
    expect(scene.recipe?.says).toEqual(RECIPE.says);
  });

  it('refuses a close on a recipe, which ends on its last moment', () => {
    const checked = checkSceneSpeech({ scene: STARTER, written: { ...WRITTEN, close: 'What holds it up?' }, interests: [] });
    expect(checked.isOk).toBe(false);
  });
});

function makeReader(reply: () => Promise<unknown>) {
  const read = vi.fn<JsonReader['read']>(async () => ({ answer: await reply(), costUsd: 0.0003 }));
  return { reader: { read } as JsonReader, read };
}

function setUp({ reply = async () => GOOD as unknown, student = STUDENT, canSpend = true }: { reply?: () => Promise<unknown>; student?: StudentFacts; canSpend?: boolean } = {}) {
  const sent: SceneAgentMessage[] = [];
  const spoken: (readonly Beat[])[] = [];
  const shown: { isShared: boolean }[] = [];
  const costs: number[] = [];
  const storeRoot = mkdtempSync(join(tmpdir(), 'live-words-'));
  const store = createSceneStore(storeRoot);
  const saveChecked = vi.spyOn(store, 'saveChecked');
  const { reader, read } = makeReader(reply);
  const state = { canSpeak: true, isReplyStarting: false };
  const liveWords = createLiveSceneWords({ reader, getStudent: async () => student, isReplyStarting: () => state.isReplyStarting, canSpend: () => canSpend, onCost: (usd) => costs.push(usd), onSettled: (sceneId) => scenes.noteWordsSettled(sceneId), getNowMs: () => performance.now(), trace: () => {} });
  const joinRun = vi.fn(() => ({ plan: Promise.resolve(PLAN), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: true as const, scene: SCENE }), leave: vi.fn() }));
  const scenes = createTutorScenes({
    router: { route: vi.fn(async () => ({ engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE }) as SceneRoute) },
    runs: { join: joinRun } as never,
    store,
    getCardTitle: () => null,
    getNowMs: () => performance.now(),
    send: (message) => void sent.push(message),
    canSpeak: () => state.canSpeak,
    speak(beats) {
      spoken.push(beats);
      return true;
    },
    onShown: (one) => void shown.push(one),
    trace: () => {},
    liveWords,
  } as Parameters<typeof createTutorScenes>[0]);
  scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
  return { scenes, sent, spoken, shown, costs, read, state, storeRoot, saveChecked, liveWords };
}

const LOADED = { type: 'sceneLoaded', sceneId: SCENE.id } as const;

const flush = async () => {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

const getHeard = (spoken: readonly (readonly Beat[])[]) => spoken.flatMap((beats) => beats.map(getBeatText)).join(' ');

describe('a saved scene in a lesson', () => {
  afterEach(() => vi.useRealTimers());

  it('says the live words over the same picture, once, and bills them to the student', async () => {
    vi.useFakeTimers();
    const { scenes, spoken, shown, costs, read, saveChecked, storeRoot } = setUp();
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    expect(getHeard(spoken)).toContain('the same curve a ball keeps');
    expect(getHeard(spoken)).not.toContain('Watch the line tilt.');
    expect(read).toHaveBeenCalledTimes(1);
    expect(costs).toEqual([0.0003]);
    expect(shown).toEqual([expect.objectContaining({ isShared: false })]);
    expect(saveChecked).not.toHaveBeenCalled();
    expect(readdirSync(storeRoot)).toEqual([]);
  });

  it('sends only this idea and this student, with no note on another idea', async () => {
    vi.useFakeTimers();
    const { scenes, read } = setUp();
    scenes.ask(TOPIC);
    await flush();
    const ask = JSON.parse(read.mock.calls[0]?.[0].text ?? '{}') as { student: { interests: string[]; notes_on_this_idea: unknown[] }; numbers_you_may_say: number[]; moments: string[] };
    expect(ask.student.interests).toEqual(['football']);
    expect(ask.student.notes_on_this_idea).toEqual([{ kind: 'struggled' }]);
    expect(ask.moments).toEqual(['a', 'b']);
    expect(ask.numbers_you_may_say).toEqual([0, 2, 7, 9, 12]);
  });

  it(`waits ${LIVE_WORDS_WAIT_MS} ms at most at a pause, then says the saved words`, async () => {
    vi.useFakeTimers();
    const { scenes, spoken, shown } = setUp({ reply: () => new Promise(() => {}) });
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    expect(spoken).toEqual([]);
    await vi.advanceTimersByTimeAsync(LIVE_WORDS_WAIT_MS - 1);
    expect(spoken).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(getHeard(spoken)).toContain('Watch the line tilt.');
    expect(shown).toEqual([expect.objectContaining({ isShared: true })]);
  });

  it('lands the moment the words arrive inside the wait', async () => {
    vi.useFakeTimers();
    let answer: (value: unknown) => void = () => {};
    const { scenes, spoken } = setUp({ reply: () => new Promise((resolve) => (answer = resolve)) });
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    await vi.advanceTimersByTimeAsync(400);
    expect(spoken).toEqual([]);
    answer(GOOD);
    await flush();
    expect(getHeard(spoken)).toContain('the same curve a ball keeps');
  });

  it('says the saved words at once when a check fails, and pays for only the one call', async () => {
    vi.useFakeTimers();
    const { scenes, spoken, read } = setUp({ reply: async () => withNarration('[[b]] Wrong order of things here. [[a]] And more words after that.') });
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    expect(getHeard(spoken)).toContain('Watch the line tilt.');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('says the saved words when the call fails', async () => {
    vi.useFakeTimers();
    const { scenes, spoken } = setUp({ reply: async () => Promise.reject(new Error('down')) });
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    expect(getHeard(spoken)).toContain('Watch the line tilt.');
  });

  it('makes no call past the session limit', async () => {
    vi.useFakeTimers();
    const { scenes, spoken, read } = setUp({ canSpend: false });
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    expect(read).not.toHaveBeenCalled();
    expect(getHeard(spoken)).toContain('Watch the line tilt.');
  });

  it('holds the call for the first words of a reply, then carries on from them', async () => {
    vi.useFakeTimers();
    const { scenes, read, state, liveWords } = setUp();
    state.isReplyStarting = true;
    scenes.ask(TOPIC);
    await flush();
    expect(read).not.toHaveBeenCalled();
    liveWords.noteFirstWords();
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
  });

  describe('and a student in danger', () => {
    it('makes no call on words that may be about their safety', async () => {
      vi.useFakeTimers();
      const { scenes, spoken, read } = setUp({ student: { ...STUDENT, studentSaid: 'i want to kill myself' } });
      scenes.ask(TOPIC);
      await flush();
      scenes.onPage(LOADED, 'maya');
      expect(read).not.toHaveBeenCalled();
      expect(getHeard(spoken)).toContain('Watch the line tilt.');
    });

    it('stays on saved words for the rest of the room after a safety reply, and drops a call under way', async () => {
      vi.useFakeTimers();
      let answer: (value: unknown) => void = () => {};
      const { scenes, spoken, read, liveWords } = setUp({ reply: () => new Promise((resolve) => (answer = resolve)) });
      scenes.ask(TOPIC);
      await flush();
      scenes.noteSafetyReply();
      answer(GOOD);
      await flush();
      expect(liveWords.read(SCENE.id)).toEqual({ kind: 'saved' });
      expect(spoken).toEqual([]);
      scenes.noteStudentTurn();
      liveWords.begin({ ...SCENE, id: `scene-${'b'.repeat(40)}` });
      await flush();
      expect(read).toHaveBeenCalledTimes(1);
    });
  });
});
