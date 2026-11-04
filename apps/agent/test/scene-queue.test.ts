import { describe, expect, it, vi } from 'vitest';
import { AHEAD_WRITE_GUIDE_USD, type AheadFacts, getPrepareRefusal, getWriteRefusal, MOST_WRITES_AHEAD } from '../src/scene-queue/ahead-budget.ts';
import { matchLibrary, readMatches, type ShelfScene, toShelfScene } from '../src/scene-queue/library-match.ts';
import { createSceneQueue } from '../src/scene-queue/scene-queue.ts';
import { getStateAfterEvent, getStateAfterMove, type LessonState, NO_LESSON } from '../src/lesson-plan/plan-progress.ts';
import type { LessonPlan } from '../src/lesson-plan/lesson-plan.ts';

const RINGS: LessonPlan = {
  topic: "Saturn's rings",
  kind: 'teachFirst',
  steps: [
    { teach: 'what the rings are made of', exercise: 'pick the odd one out' },
    { teach: 'a moon too close breaks apart', exercise: 'explain it back' },
    { teach: 'moons carve gaps', exercise: 'label the gap' },
  ],
};
const MIXING: LessonPlan = { topic: 'Mixing paint', kind: 'teachFirst', steps: [{ teach: 'primary colors', exercise: 'name them' }, { teach: 'why mud happens', exercise: 'mix two' }] };
const PROBLEM: LessonPlan = { topic: 'Solving 2x + 3 = 11', kind: 'handsOn', steps: [{ teach: null, exercise: 'Solve 2x + 3 = 11' }] };

const flush = async () => {
  for (let tick = 0; tick < 4; tick += 1) await new Promise((resolve) => setImmediate(resolve));
};

const start = (plan: LessonPlan): LessonState => getStateAfterMove(NO_LESSON, { move: 'new', plan });
const OPEN_AND_FINISH = (state: LessonState) => getStateAfterEvent(getStateAfterEvent(state, 'exerciseSet'), 'exerciseDone');

const ROOMY: AheadFacts = { writesStarted: 0, sceneUsd: 0, sceneLimitUsd: 0.8, leftTodayUsd: 3, isOverLimit: false, loadPerCore: 0.2, lastFirstTextMs: 900 };

const makeScenes = () => ({ prepare: vi.fn<(request: string) => boolean>(() => true), ask: vi.fn<(request: string) => void>(), dropPrepared: vi.fn(), dropWaiting: vi.fn(), stop: vi.fn() });

function setUp({ library = {}, facts = ROOMY, canPlay = true }: { library?: Record<string, readonly (string | null)[]>; facts?: Partial<AheadFacts>; canPlay?: boolean } = {}) {
  const budget = { ...facts };
  const scenes = makeScenes();
  const moveToNextStep = vi.fn();
  const readLibrary = vi.fn(async ({ topic }: LessonPlan) => library[topic] ?? []);
  const queue = createSceneQueue({ scenes, readLibrary, getFacts: () => ({ ...ROOMY, ...budget }), canPlay: () => canPlay, moveToNextStep, trace: () => {} });
  return { queue, scenes, readLibrary, budget, moveToNextStep };
}

const prepared = (scenes: ReturnType<typeof setUp>['scenes']) => scenes.prepare.mock.calls.map(([request]) => request);
const asked = (scenes: ReturnType<typeof setUp>['scenes']) => scenes.ask.mock.calls.map(([request]) => request);

describe('the next scene queue', () => {
  it('writes nothing with no running lesson', async () => {
    const { queue, scenes, readLibrary } = setUp();
    queue.onLesson(NO_LESSON);
    queue.onPageReady();
    await flush();
    expect(scenes.prepare).not.toHaveBeenCalled();
    expect(readLibrary).not.toHaveBeenCalled();
  });

  it('gets the library scene for what is next ready, and spends on no write for it', async () => {
    const { queue, scenes } = setUp({ library: { [RINGS.topic]: [null, 'Why a moon that gets too close breaks apart', null] } });
    queue.onLesson(start(RINGS));
    await flush();
    expect(prepared(scenes)).toEqual(['Why a moon that gets too close breaks apart']);
    expect(queue.getEntries()).toMatchObject([{ source: 'library', stepIndex: 1, state: 'making' }]);
  });

  it('waits for the library read before it would write, so a listed idea is never paid for', async () => {
    let answer: (titles: readonly (string | null)[]) => void = () => {};
    const { scenes } = setUp();
    const readLibrary = () => new Promise<readonly (string | null)[]>((resolve) => (answer = resolve));
    const held = createSceneQueue({ scenes, readLibrary, getFacts: () => ROOMY, canPlay: () => true, moveToNextStep: vi.fn(), trace: () => {} });
    held.onLesson(start(RINGS));
    await flush();
    expect(scenes.prepare).not.toHaveBeenCalled();
    answer([null, 'Why a moon that gets too close breaks apart', null]);
    await flush();
    expect(prepared(scenes)).toEqual(['Why a moon that gets too close breaks apart']);
  });

  it('starts a write for what is next when no scene exists, and at most one ahead', async () => {
    const { queue, scenes } = setUp();
    queue.onLesson(start(RINGS));
    await flush();
    const first = start(RINGS);
    expect(prepared(scenes)).toEqual(["Saturn's rings: a moon too close breaks apart"]);
    queue.onLesson(OPEN_AND_FINISH(first));
    await flush();
    expect(asked(scenes)).toEqual(["Saturn's rings: a moon too close breaks apart"]);
    expect(prepared(scenes)).toHaveLength(1);
    queue.noteAhead("Saturn's rings: a moon too close breaks apart", 'shown');
    expect(prepared(scenes)).toHaveLength(2);
  });

  it('never writes ahead for a problem, whose answer a picture could give away', async () => {
    const { queue, scenes } = setUp();
    queue.onLesson(start({ ...PROBLEM, steps: [PROBLEM.steps[0]!, { teach: null, exercise: 'Solve 3x = 12' }] }));
    await flush();
    expect(scenes.prepare).not.toHaveBeenCalled();
  });

  it('lands what is ready when the lesson reaches its step, and readies the one after', async () => {
    const { queue, scenes } = setUp({ library: { [RINGS.topic]: [null, 'Why a moon that gets too close breaks apart', 'How small moons carve gaps in the rings'] } });
    const first = start(RINGS);
    queue.onLesson(first);
    await flush();
    queue.noteAhead('Why a moon that gets too close breaks apart', 'ready');
    queue.onLesson(OPEN_AND_FINISH(first));
    expect(asked(scenes)).toEqual(['Why a moon that gets too close breaks apart']);
    expect(prepared(scenes)).toEqual(['Why a moon that gets too close breaks apart', 'How small moons carve gaps in the rings']);
  });

  it('shows a library scene for the step the lesson is already on, for free', async () => {
    const { queue, scenes } = setUp({ library: { [RINGS.topic]: ["What Saturn's rings are made of", null, null] } });
    queue.onLesson(start(RINGS));
    await flush();
    expect(prepared(scenes)).toContain("What Saturn's rings are made of");
    expect(asked(scenes)).toEqual(["What Saturn's rings are made of"]);
  });

  it('drops what waits when the lesson moves on, so a late scene never interrupts a later concept', async () => {
    const { queue, scenes } = setUp();
    const first = start(RINGS);
    queue.onLesson(first);
    await flush();
    queue.onLesson(OPEN_AND_FINISH(first));
    expect(scenes.dropWaiting).toHaveBeenCalledWith('movedOn');
  });

  it('drops what was being prepared on a switch, and goes back without paying for a second read', async () => {
    const { queue, scenes, readLibrary } = setUp();
    const rings = start(RINGS);
    queue.onLesson(rings);
    await flush();
    const switched = getStateAfterMove(rings, { move: 'new', plan: MIXING });
    queue.onLesson(switched);
    await flush();
    expect(scenes.dropPrepared).toHaveBeenCalledWith("Saturn's rings: a moon too close breaks apart");
    expect(scenes.dropWaiting).toHaveBeenCalledWith('switched');
    expect(prepared(scenes).at(-1)).toBe('Mixing paint: why mud happens');
    queue.onLesson(getStateAfterMove(switched, { move: 'back', topic: RINGS.topic }));
    await flush();
    expect(readLibrary).toHaveBeenCalledTimes(2);
  });

  it('moves the lesson on when the tutor asks for the next idea by the name it was given', async () => {
    const { queue, moveToNextStep } = setUp({ library: { [RINGS.topic]: [null, 'Why a moon that gets too close breaks apart', null] } });
    queue.onLesson(start(RINGS));
    await flush();
    queue.noteAhead('Why a moon that gets too close breaks apart', 'ready');
    expect(queue.getReadyPicture()).toBe('Why a moon that gets too close breaks apart');
    queue.onTutorAsk('why a moon that gets too close breaks apart');
    expect(moveToNextStep).toHaveBeenCalledOnce();
  });

  it('passes any other ask straight on', async () => {
    const { queue, scenes, moveToNextStep } = setUp();
    queue.onTutorAsk('the slope of a line');
    expect(asked(scenes)).toEqual(['the slope of a line']);
    expect(moveToNextStep).not.toHaveBeenCalled();
  });

  it('names no picture to the tutor until one is ready', async () => {
    const { queue } = setUp({ library: { [RINGS.topic]: [null, 'Why a moon that gets too close breaks apart', null] } });
    queue.onLesson(start(RINGS));
    await flush();
    expect(queue.getReadyPicture()).toBeNull();
  });

  it('does not start a third write, whatever the plan wants', async () => {
    const { queue, scenes } = setUp();
    let state = start({ ...RINGS, steps: [...RINGS.steps, { teach: 'gaps come and go', exercise: 'say why' }, { teach: 'rings fade', exercise: 'say when' }] });
    queue.onLesson(state);
    await flush();
    const finishStep = () => {
      queue.noteAhead(prepared(scenes).at(-1) ?? '', 'shown');
      state = OPEN_AND_FINISH(state);
      queue.onLesson(state);
    };
    finishStep();
    finishStep();
    finishStep();
    expect(prepared(scenes)).toHaveLength(MOST_WRITES_AHEAD);
  });

  it('a topic the router sends elsewhere costs no write and is not tried again', async () => {
    const { queue, scenes } = setUp();
    queue.onLesson(start(RINGS));
    await flush();
    queue.noteAhead("Saturn's rings: a moon too close breaks apart", 'declined');
    queue.noteTutorReply({ spokenText: 'On we go.', refusalCategory: null });
    expect(prepared(scenes)).toHaveLength(1);
    expect(getWriteRefusal({ ...ROOMY, writesStarted: 0 })).toBeNull();
  });

  it('names no next picture while one is still due to land', async () => {
    const { queue } = setUp({ library: { [RINGS.topic]: [null, 'Why a moon that gets too close breaks apart', 'How small moons carve gaps in the rings'] } });
    const first = start(RINGS);
    queue.onLesson(first);
    await flush();
    queue.noteAhead('Why a moon that gets too close breaks apart', 'ready');
    const second = OPEN_AND_FINISH(first);
    queue.onLesson(second);
    queue.noteAhead('How small moons carve gaps in the rings', 'ready');
    expect(queue.getReadyPicture()).toBeNull();
    queue.noteAhead('Why a moon that gets too close breaks apart', 'shown');
    expect(queue.getReadyPicture()).toBe('How small moons carve gaps in the rings');
  });

  it('counts no write the desk had no use for', async () => {
    const { queue, scenes } = setUp();
    scenes.prepare.mockReturnValue(false);
    queue.onLesson(start(RINGS));
    await flush();
    expect(queue.getEntries()).toEqual([]);
  });

  it('forgets a scene that failed, and the next step still gets its try', async () => {
    const { queue, scenes } = setUp();
    const first = start(RINGS);
    queue.onLesson(first);
    await flush();
    queue.noteAhead("Saturn's rings: a moon too close breaks apart", 'failed');
    expect(queue.getEntries()).toEqual([]);
    expect(queue.getReadyPicture()).toBeNull();
    queue.onLesson(OPEN_AND_FINISH(first));
    expect(prepared(scenes).at(-1)).toBe("Saturn's rings: moons carve gaps");
  });

  it('prepares nothing for a page that cannot play a scene', async () => {
    const { queue, scenes } = setUp({ canPlay: false });
    queue.onLesson(start(RINGS));
    await flush();
    expect(scenes.prepare).not.toHaveBeenCalled();
  });

  it('prepares when the page says it can play, not before', async () => {
    const answers = { canPlay: false };
    const scenes = makeScenes();
    const queue = createSceneQueue({ scenes, readLibrary: async () => [], getFacts: () => ROOMY, canPlay: () => answers.canPlay, moveToNextStep: vi.fn(), trace: () => {} });
    queue.onLesson(start(RINGS));
    await flush();
    expect(scenes.prepare).not.toHaveBeenCalled();
    answers.canPlay = true;
    queue.onPageReady();
    expect(prepared(scenes)).toEqual(["Saturn's rings: a moon too close breaks apart"]);
  });

  it('stops for good after distress, and holds for one turn on a word that only might be', async () => {
    const stopped = setUp();
    stopped.queue.onLesson(start(RINGS));
    await flush();
    stopped.queue.noteStudentWords('i want to kill myself');
    expect(stopped.scenes.stop).toHaveBeenCalledOnce();
    stopped.scenes.prepare.mockClear();
    stopped.queue.onLesson(OPEN_AND_FINISH(start(RINGS)));
    expect(stopped.scenes.prepare).not.toHaveBeenCalled();

    const held = setUp();
    held.queue.noteStudentWords('the ball hits the rim');
    held.queue.onLesson(start(RINGS));
    await flush();
    expect(held.scenes.prepare).not.toHaveBeenCalled();
    expect(held.scenes.stop).not.toHaveBeenCalled();
    held.queue.noteStudentWords('okay so it bounces');
    expect(prepared(held.scenes)).toEqual(["Saturn's rings: a moon too close breaks apart"]);
  });

  it('stops for good after a safety reply from the tutor', async () => {
    const { queue, scenes } = setUp();
    queue.noteTutorReply({ spokenText: 'That sounds serious. Please call your local emergency number.', refusalCategory: null });
    queue.onLesson(start(RINGS));
    await flush();
    expect(scenes.stop).toHaveBeenCalledOnce();
    expect(scenes.prepare).not.toHaveBeenCalled();
  });
});

describe('what code allows ahead of a tutor reaching a scene', () => {
  it('names its numbers', () => {
    expect(AHEAD_WRITE_GUIDE_USD).toBe(0.265);
    expect(MOST_WRITES_AHEAD).toBe(2);
  });

  it('allows a write with room on every limit', () => {
    expect(getWriteRefusal(ROOMY)).toBeNull();
  });

  it.each([
    ['the session has written its two', { writesStarted: 2 }, 'writesAhead'],
    ['the scenes of this session are near their ceiling', { sceneUsd: 0.56 }, 'sceneCeiling'],
    ['the student is near their day limit', { leftTodayUsd: 0.59 }, 'nearDayLimit'],
    ['the day is not known yet', { leftTodayUsd: null }, 'nearDayLimit'],
    ['a limit is already hit', { isOverLimit: true }, 'overLimit'],
    ['the machine is short of room', { loadPerCore: 1.6 }, 'pressure'],
    ['the last reply came slowly', { lastFirstTextMs: 4100 }, 'pressure'],
  ] as const)('refuses a write when %s', (_when, facts, refusal) => {
    expect(getWriteRefusal({ ...ROOMY, ...facts })).toBe(refusal);
  });

  it('a library scene is free, so only pressure and limits stop it', () => {
    expect(getPrepareRefusal({ ...ROOMY, writesStarted: 2, sceneUsd: 0.79 })).toBeNull();
    expect(getPrepareRefusal({ ...ROOMY, leftTodayUsd: 0.1 })).toBe('nearDayLimit');
    expect(getPrepareRefusal({ ...ROOMY, loadPerCore: 2 })).toBe('pressure');
  });
});

describe('matching a plan to the saved library', () => {
  const PLAN: LessonPlan = { topic: 'How a free kick curves', kind: 'teachFirst', steps: [{ teach: 'spin pushes the air', exercise: 'say which way' }, { teach: 'striking off centre', exercise: 'draw it' }] };
  const SHELF: ShelfScene[] = [
    { title: 'Why a free kick curves', words: 'A spinning ball drags air around it.' },
    { title: 'How a jump shot flies', words: 'Once the ball leaves the hand, only gravity pulls.' },
  ];
  const makeReader = (picks: readonly string[], fits: (words: string) => boolean) => ({
    read: vi.fn(async ({ text, schema }: { text: string; schema: object }) => {
      const isFitRead = 'fits' in ((schema as { properties: object }).properties);
      if (isFitRead) return { answer: { fits: fits((JSON.parse(text) as { scene_says: string }).scene_says) }, costUsd: 0.0001 };
      return { answer: { steps: picks.map((scene) => ({ idea: 'x', scene })) }, costUsd: 0.0002 };
    }),
  });

  it('keeps a pick only when a second read of what the scene says agrees', async () => {
    const reader = makeReader(['why a free kick curves', 'How a jump shot flies'], (words) => words.includes('spinning'));
    const { matches, costUsd } = await matchLibrary(reader as never, PLAN, SHELF);
    expect(matches).toEqual(['Why a free kick curves', null]);
    expect(costUsd).toBeCloseTo(0.0004);
  });

  it('takes no title the server did not list, and no title twice', () => {
    expect(readMatches({ steps: [{ scene: 'Why a free kick curves' }, { scene: 'Why a free kick curves' }, { scene: 'Made up' }] }, ['Why a free kick curves'], 3)).toEqual(['Why a free kick curves', null, null]);
    expect(readMatches({ nonsense: true }, ['Why a free kick curves'], 2)).toEqual([null, null]);
  });

  it('spends nothing on an empty shelf', async () => {
    const reader = makeReader([], () => true);
    expect(await matchLibrary(reader as never, PLAN, [])).toEqual({ matches: [], costUsd: 0 });
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('reads a scene without its timing marks', () => {
    expect(toShelfScene({ topic: 'A', plan: { setup: 'Watch.', narration: '[[a]] It climbs. [[b]] It falls.' } as never }).words).toBe('Watch. It climbs. It falls.');
  });
});
