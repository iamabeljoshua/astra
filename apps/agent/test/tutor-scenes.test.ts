import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Beat, getBeatText, parseBeat, type SceneAgentMessage } from '@astra/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTopicRuns } from '../src/scenes/lesson/topic-runs.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import { ASK_LIMIT_MS, createTutorScenes, getTutorSceneBeats } from '../src/tutor/tutor-scenes.ts';

const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const NO_WORKER = async () => {
  throw new Error('no worker');
};
const TOPIC = 'what the slope of a line tells you';
const PLAN: LessonPlan = { opening: [{ say: 'The slope of a line tells you something.' }], more: [], setup: 'Watch the line tilt.', narration: '[[a]] The line climbs. [[b]] It climbs at one steady rate.', plan: 'a: a line climbs\nb: a triangle shows the steady rate', close: 'What would a steeper line tell you?' };
const SCENE: StoredScene = { id: `scene-${'a'.repeat(40)}`, engine: 'manimgx', topic: TOPIC, moments: { a: 0, b: 2 }, parts: [], durationSeconds: 5, plan: PLAN, ownerId: 'maya' } as unknown as StoredScene;

const flush = async () => {
  for (let tick = 0; tick < 6; tick += 1) await new Promise((resolve) => setImmediate(resolve));
};

function setUp({ route = { engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE } as SceneRoute, canSpeak = true, getScene = async () => ({ isOk: true as const, scene: SCENE }) as { isOk: true; scene: StoredScene } | { isOk: false; reasons: string[] }, cardTitle = null as string | null, canPlayShared = undefined as ((studentId: string) => boolean) | undefined } = {}) {
  const sent: SceneAgentMessage[] = [];
  const spoken: (readonly Beat[])[] = [];
  const shown: { topic: string }[] = [];
  const traces: { name: string; fields: Record<string, unknown> }[] = [];
  const joinRun = vi.fn(() => ({ plan: Promise.resolve(PLAN), firstLine: Promise.resolve(null), getScene, leave: vi.fn() }));
  const store = createSceneStore(mkdtempSync(join(tmpdir(), 'tutor-scenes-')));
  const state = { canSpeak };
  const scenes = createTutorScenes({
    router: { route: vi.fn(async () => route) },
    runs: { join: joinRun } as never,
    store,
    getCardTitle: () => cardTitle,
    getNowMs: () => performance.now(),
    send: (message) => void sent.push(message),
    canSpeak: () => state.canSpeak,
    speak(beats) {
      spoken.push(beats);
      return true;
    },
    onShown: (one) => void shown.push(one),
    trace: (name, fields = {}) => void traces.push({ name, fields }),
    ...(canPlayShared ? { canPlayShared } : {}),
  } as Parameters<typeof createTutorScenes>[0]);
  return { scenes, sent, spoken, shown, traces, joinRun, store, state };
}

const opened = (scenes: ReturnType<typeof setUp>['scenes'], canPlay = true) => scenes.onPage({ type: 'sceneDevice', canPlay }, 'maya');
const LOADED = { type: 'sceneLoaded', sceneId: SCENE.id } as const;

afterEach(() => vi.useRealTimers());

describe('asking for a scene', () => {
  it('lands at a pause once the page has the take, with the picture before its first word', async () => {
    const { scenes, sent, spoken, shown } = setUp();
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    expect(sent).toEqual([{ type: 'loadScene', sceneId: SCENE.id, durationSeconds: 5 }]);
    expect(spoken).toEqual([]);
    scenes.onPage(LOADED, 'maya');
    expect(spoken).toHaveLength(1);
    expect(shown).toEqual([expect.objectContaining({ topic: TOPIC })]);
    const [firstBeat] = spoken[0] as [Beat];
    expect(firstBeat.script.slice(0, 2)).toEqual([expect.objectContaining({ kind: 'richScene', sceneId: SCENE.id }), { kind: 'boardMode', mode: 'teach' }]);
    expect(getBeatText(firstBeat)).toBe('Watch the line tilt.');
  });

  it('holds a loaded scene while the tutor is talking, and takes the next pause', async () => {
    const { scenes, spoken, state } = setUp({ canSpeak: false });
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    scenes.notePause();
    expect(spoken).toEqual([]);
    state.canSpeak = true;
    scenes.notePause();
    expect(spoken).toHaveLength(1);
  });

  it('lands by itself once the student has had room to answer', async () => {
    const { scenes, spoken, state } = setUp({ canSpeak: false });
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    scenes.notePause();
    state.canSpeak = true;
    await vi.waitFor(() => expect(spoken).toHaveLength(1), { timeout: 2000 });
  });

  it('drops a scene not ready 20 s after the first pause, silently, even if it comes later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let finish: (made: { isOk: true; scene: StoredScene }) => void = () => {};
    const { scenes, sent, spoken, traces } = setUp({ getScene: () => new Promise((resolve) => (finish = resolve)) });
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.notePause();
    vi.advanceTimersByTime(20_001);
    expect(traces).toContainEqual({ name: 'sceneEnded', fields: expect.objectContaining({ how: 'tooLate' }) });
    finish({ isOk: true, scene: SCENE });
    await flush();
    scenes.notePause();
    expect(spoken).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('asks once for one idea', async () => {
    const { scenes, joinRun } = setUp();
    opened(scenes);
    scenes.ask(TOPIC);
    scenes.ask(TOPIC.toUpperCase());
    await flush();
    expect(joinRun).toHaveBeenCalledOnce();
  });

  it('writes nothing for a page that cannot play one', async () => {
    const { scenes, joinRun } = setUp();
    opened(scenes, false);
    scenes.ask(TOPIC);
    await flush();
    expect(joinRun).not.toHaveBeenCalled();
  });

  it('waits to hear what the page can play, and an ask before that is not lost', async () => {
    const { scenes, joinRun } = setUp();
    scenes.ask(TOPIC);
    await flush();
    expect(joinRun).not.toHaveBeenCalled();
    opened(scenes);
    await flush();
    expect(joinRun).toHaveBeenCalledOnce();
  });
});

describe('what a scene check can never do in a session', () => {
  const cases: [string, Parameters<typeof setUp>[0], string][] = [
    ['the router reads safety', { route: { engine: 'none', kind: 'safety', topic: '', ...USAGE } }, 'declined'],
    ['the router reads dangerous', { route: { engine: 'none', kind: 'dangerous', topic: '', ...USAGE } }, 'declined'],
    ['the router sends it to the kit', { route: { engine: 'kit', kind: 'biology', topic: 'the human heart', ...USAGE } }, 'declined'],
    ['the router wants no drawing', { route: { engine: 'none', kind: 'none', topic: 'a plain fact', ...USAGE } }, 'declined'],
    ['the plan is refused', { getScene: async () => ({ isOk: false, reasons: ['no plan'] }) }, 'failed'],
  ];

  it.each(cases)('%s: no word, no message to the page, and the session goes on', async (_name, options, how) => {
    const { scenes, sent, spoken, shown, traces } = setUp(options);
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.notePause();
    expect(spoken).toEqual([]);
    expect(sent).toEqual([]);
    expect(shown).toEqual([]);
    expect(traces).toContainEqual({ name: 'sceneEnded', fields: expect.objectContaining({ how }) });
  });

  it.each(['i want to kill myself', 'how many pills would it take', 'my dad hits me'])('reads %s as no scene, and leaves the words to the tutor', async (topic) => {
    const { scenes, sent, spoken, joinRun } = setUp({ route: { engine: 'none', kind: 'safety', topic: '', ...USAGE } });
    opened(scenes);
    scenes.ask(topic);
    await flush();
    scenes.notePause();
    expect(spoken).toEqual([]);
    expect(sent).toEqual([]);
    expect(joinRun).not.toHaveBeenCalled();
  });

  it('ignores a router that fails', async () => {
    const { scenes, sent, spoken, traces } = setUp();
    const failing = createTutorScenes({ router: { route: async () => { throw new Error('down'); } }, runs: { join: vi.fn() } as never, store: { find: () => null } as never, getCardTitle: () => null, getNowMs: () => 0, send: () => {}, canSpeak: () => true, speak: () => true, onShown: () => {}, trace: () => {} });
    failing.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
    failing.ask(TOPIC);
    await flush();
    failing.notePause();
    expect(spoken).toEqual([]);
    expect(sent).toEqual([]);
    expect(traces).toEqual([]);
    void scenes;
  });
});

describe('who a scene belongs to', () => {
  const makeRuns = (root: string) => {
    const keys: unknown[] = [];
    return { keys, runs: { join(key: unknown) { keys.push(key); return { plan: Promise.resolve(PLAN), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: false, reasons: ['stop'] }), leave() {} }; } } as never, store: createSceneStore(root) };
  };
  const start = ({ keys, runs, store }: ReturnType<typeof makeRuns>, topic: string, cardTitle: string | null) => {
    const scenes = createTutorScenes({ router: { route: async () => ({ engine: 'manimgx', kind: 'graph', topic, ...USAGE }) }, runs, store, getCardTitle: () => cardTitle, getNowMs: () => 0, send: () => {}, canSpeak: () => true, speak: () => true, onShown: () => {}, trace: () => {} });
    scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
    scenes.ask(topic);
    return keys;
  };

  it('keeps a topic the tutor worded with that student', async () => {
    const made = makeRuns(mkdtempSync(join(tmpdir(), 'scenes-')));
    start(made, TOPIC, null);
    await flush();
    expect(made.keys).toEqual([getSceneKey(TOPIC, { ownerId: 'maya' })]);
  });

  it('shares only a card\'s own title from the server, and a card session on another idea stays with its student', async () => {
    const shared = makeRuns(mkdtempSync(join(tmpdir(), 'scenes-')));
    start(shared, 'how a jump shot flies', 'How a jump shot flies');
    await flush();
    expect(shared.keys).toEqual([getSceneKey('How a jump shot flies')]);
    const other = makeRuns(mkdtempSync(join(tmpdir(), 'scenes-')));
    start(other, TOPIC, 'How a jump shot flies');
    await flush();
    expect(other.keys).toEqual([getSceneKey(TOPIC, { ownerId: 'maya' })]);
  });
});

describe('who pays for a scene\'s words', () => {
  const land = async (scene: StoredScene) => {
    const shown: { isShared: boolean }[] = [];
    const scenes = createTutorScenes({ router: { route: async () => ({ engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE }) }, runs: { join: () => ({ plan: Promise.resolve(PLAN), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: true, scene }), leave() {} }) } as never, store: createSceneStore(mkdtempSync(join(tmpdir(), 'tutor-scenes-'))), getCardTitle: () => null, getNowMs: () => 0, send: () => {}, canSpeak: () => true, speak: () => true, onShown: (one) => void shown.push(one), trace: () => {} });
    scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    return shown;
  };

  it('is the project for a shared scene', async () => {
    expect(await land({ ...SCENE, ownerId: null })).toEqual([expect.objectContaining({ isShared: true })]);
  });

  it('is the student for their own typed scene', async () => {
    expect(await land(SCENE)).toEqual([expect.objectContaining({ isShared: false })]);
  });
});

describe('the words of a scene', () => {
  it('start the take on the setup line, because a take opens on an empty frame', () => {
    const [opening, take] = getTutorSceneBeats({ plan: PLAN, scene: SCENE, number: 1 });
    const run = opening?.script.find((part) => typeof part === 'object' && part.kind === 'runSimulation');
    expect(run).toEqual({ kind: 'runSimulation', target: 'scene-1', action: 'play', until: 'b', overWords: 4 });
    expect(take?.script.find((part) => typeof part === 'object' && part.kind === 'runSimulation')).toEqual(expect.objectContaining({ until: 'b' }));
    expect(getTutorSceneBeats({ plan: PLAN, scene: { ...SCENE, moments: { a: 0 } } as StoredScene, number: 1 })[0]?.script.filter((part) => typeof part === 'object' && part.kind === 'runSimulation')).toEqual([]);
  });

  it('are only the words its review read, with the picture first and the question last', () => {
    const beats = getTutorSceneBeats({ plan: PLAN, scene: SCENE, number: 2 });
    const text = beats.map(getBeatText);
    expect(text[0]).toBe('Watch the line tilt.');
    expect(text.at(-1)).toBe('What would a steeper line tell you?');
    expect(beats.at(-1)?.expectsReply).toBe(true);
    for (const beat of beats) expect(parseBeat({ id: beat.id, script: beat.script, expectsReply: beat.expectsReply }).ok).toBe(true);
    const scenes = beats.flatMap((beat) => beat.script.filter((part) => typeof part === 'object' && part.kind === 'richScene'));
    expect(scenes).toHaveLength(1);
    expect(new Set(beats.map((beat) => beat.id)).size).toBe(beats.length);
  });
});

describe('a topic that draws nothing', () => {
  const spendingPlanner = () => {
    const plan = vi.fn(async () => ({ ...PLAN, ...USAGE }));
    const store = createSceneStore(mkdtempSync(join(tmpdir(), 'tutor-scenes-')));
    const runs = createTopicRuns({ planner: { plan }, writers: [], reviewer: { review: async () => ({ isPass: true, errors: [], ...USAGE }) }, worker: NO_WORKER, store, warn: () => {} });
    return { plan, store, runs };
  };
  const ask = async (made: ReturnType<typeof spendingPlanner>, route: SceneRoute) => {
    const scenes = createTutorScenes({ router: { route: async () => route }, runs: made.runs, store: made.store, getCardTitle: () => null, getNowMs: () => 0, send: () => {}, canSpeak: () => true, speak: () => true, onShown: () => {}, trace: () => {} });
    scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
    scenes.ask(TOPIC);
    await flush();
  };

  it.each([['the kit', { engine: 'kit', kind: 'biology', topic: 'the human heart', ...USAGE }], ['no drawing', { engine: 'none', kind: 'none', topic: 'a plain fact', ...USAGE }]] as [string, SceneRoute][])('pays no planner when the router says %s', async (_name, route) => {
    const made = spendingPlanner();
    await ask(made, route);
    expect(made.plan).not.toHaveBeenCalled();
  });

  it('pays no planner on a topic whose next try is not due', async () => {
    const made = spendingPlanner();
    made.store.saveRefusal({ key: getSceneKey(TOPIC, { ownerId: 'maya' }), review: [{ moment: 'a', what: 'wrong', truth: '', confidence: 'high' }], attempts: 1, savedAt: new Date().toISOString() } as never);
    await ask(made, { engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE });
    expect(made.plan).not.toHaveBeenCalled();
  });
});

describe('how long a pending ask may live', () => {
  it('ends 35 s after the ask, even with no pause and a student who keeps typing', async () => {
    vi.useFakeTimers();
    const { scenes, spoken, traces, state } = setUp({ canSpeak: false });
    opened(scenes);
    scenes.ask(TOPIC);
    await vi.advanceTimersByTimeAsync(10);
    scenes.onPage(LOADED, 'maya');
    await vi.advanceTimersByTimeAsync(ASK_LIMIT_MS + 10);
    state.canSpeak = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(traces.find(({ name }) => name === 'sceneEnded')?.fields.how).toBe('tooLate');
    expect(spoken).toEqual([]);
  });

  it('counts every ask, so asks that came too late cannot go on for ever', async () => {
    vi.useFakeTimers();
    const { scenes, traces } = setUp({ getScene: () => new Promise(() => {}) as never });
    opened(scenes);
    for (let ask = 0; ask < 10; ask += 1) {
      scenes.ask(`${TOPIC} ${ask}`);
      await vi.advanceTimersByTimeAsync(ASK_LIMIT_MS + 10);
      scenes.notePause();
      await vi.advanceTimersByTimeAsync(ASK_LIMIT_MS + 10);
    }
    expect(traces.filter(({ name }) => name === 'sceneAsked')).toHaveLength(6);
  });

  it('lets a second ask on a new topic replace the first, and ignores the same topic', async () => {
    const { scenes, traces } = setUp({ getScene: () => new Promise(() => {}) as never });
    opened(scenes);
    scenes.ask(TOPIC);
    scenes.ask(`  ${TOPIC.toUpperCase()} `);
    await flush();
    expect(traces.filter(({ name }) => name === 'sceneAsked')).toHaveLength(1);
    scenes.ask('how a tangent line works');
    await flush();
    expect(traces.filter(({ name }) => name === 'sceneAsked').map(({ fields }) => fields.text)).toEqual([TOPIC, 'how a tangent line works']);
    expect(traces.find(({ name }) => name === 'sceneEnded')?.fields.how).toBe('replaced');
  });
});

describe('a safety reply', () => {
  it('ends an ask made in the same reply, and any more until the student speaks again', async () => {
    const { scenes, spoken, traces } = setUp();
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.noteSafetyReply();
    scenes.onPage(LOADED, 'maya');
    scenes.ask('how a tangent line works');
    await flush();
    expect(spoken).toEqual([]);
    expect(traces.find(({ name }) => name === 'sceneEnded')?.fields.how).toBe('safetyReply');
    expect(traces.filter(({ name }) => name === 'sceneAsked')).toHaveLength(1);
  });
});

describe('a room kept for its recap', () => {
  it('ends a pending ask, and a loaded take never lands', async () => {
    const { scenes, spoken, traces } = setUp();
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.close();
    scenes.onPage(LOADED, 'maya');
    scenes.notePause();
    await flush();
    expect(spoken).toEqual([]);
    expect(traces.find(({ name }) => name === 'sceneEnded')?.fields.how).toBe('studentLeft');
  });

  it('makes no scene ask, however late the planner or the brief comes', async () => {
    const { scenes, traces, joinRun } = setUp({ cardTitle: TOPIC });
    opened(scenes);
    scenes.close();
    scenes.ask('how a tangent line works');
    scenes.noteCard(TOPIC);
    await flush();
    expect(traces.filter(({ name }) => name === 'sceneAsked')).toEqual([]);
    expect(joinRun).not.toHaveBeenCalled();
  });

  it('drops an ask still waiting to hear what the page can play', async () => {
    const { scenes, traces, joinRun } = setUp();
    scenes.ask(TOPIC);
    scenes.close();
    opened(scenes);
    await flush();
    expect(traces.filter(({ name }) => name === 'sceneAsked')).toEqual([]);
    expect(joinRun).not.toHaveBeenCalled();
  });
});

describe('a reloaded page', () => {
  it('gets a pending scene sent again, and nothing lands on the old page\'s word', async () => {
    const { scenes, sent, spoken } = setUp();
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    expect(spoken).toHaveLength(1);
    const { scenes: second, sent: sentTwice, spoken: spokenTwice, state } = setUp({ canSpeak: false });
    opened(second);
    second.ask(TOPIC);
    await flush();
    second.onPage(LOADED, 'maya');
    opened(second);
    state.canSpeak = true;
    second.notePause();
    expect(spokenTwice).toEqual([]);
    expect(sentTwice).toHaveLength(2);
    second.onPage(LOADED, 'maya');
    expect(spokenTwice).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('gets the scene already on screen sent again', async () => {
    const { scenes, sent } = setUp();
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    scenes.onPage(LOADED, 'maya');
    opened(scenes);
    expect(sent).toEqual([{ type: 'loadScene', sceneId: SCENE.id, durationSeconds: 5 }, { type: 'loadScene', sceneId: SCENE.id, durationSeconds: 5 }]);
  });
});

describe('a scene a person has flagged', () => {
  it('never lands, even if it was flagged while the page was loading it', async () => {
    const { scenes, spoken, traces, store } = setUp();
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    vi.spyOn(store, 'isFlagged').mockReturnValue(true);
    scenes.onPage(LOADED, 'maya');
    expect(spoken).toEqual([]);
    expect(traces.find(({ name }) => name === 'sceneEnded')?.fields.how).toBe('flagged');
  });

  it('never opens a card', async () => {
    const { scenes, sent, store } = setUp({ cardTitle: TOPIC });
    opened(scenes);
    vi.spyOn(store, 'find').mockReturnValue(null);
    scenes.noteCard(TOPIC);
    await flush();
    await expect(scenes.getOpeningScene()).resolves.toBeNull();
    expect(sent).toEqual([]);
  });
});

describe('a student looping a shared card', () => {
  it('stops getting the scene past their cap, and the tutor teaches on', async () => {
    const { scenes, sent } = setUp({ cardTitle: TOPIC, canPlayShared: () => false });
    opened(scenes);
    scenes.ask(TOPIC);
    await flush();
    expect(sent).toEqual([]);
  });
});
