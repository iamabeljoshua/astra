import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Beat, parseSceneBrowserMessage, type SceneAgentMessage } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { getCoreSource, getPartCatalogue } from '../src/scenes/recipe/catalogue.ts';
import { compileRecipe } from '../src/scenes/recipe/recipe.ts';
import { toRecipeScene } from '../src/scenes/recipe/recipe-scene.ts';
import { createRecipeWork, type RecipeWriter } from '../src/scenes/recipe/recipe-work.ts';
import { readStarterRecipe } from '../src/scenes/recipe/starter.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import type { TopicRuns } from '../src/scenes/lesson/topic-runs.ts';
import { createTutorScenes, type ReplyEnd } from '../src/tutor/tutor-scenes.ts';
import { createWordTimeline } from '../src/live/word-timeline.ts';

const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const KIT_ROUTE: SceneRoute = { engine: 'kit', kind: 'physics-object', topic: 'why rockets have stages', ...USAGE };
const STUDENT = 'maya';
const ROCKET_RECIPE = [
  { t: 'fit', in: true, topic: 'why rockets have stages', stage: 'space' },
  { t: 'say', m: 'stand', text: 'So this is a rocket on the pad, with two stages stacked up.' },
  { t: 'say', m: 'climb', text: 'The engines light, and it climbs because the gas goes down.' },
  { t: 'say', m: 'drop', text: 'Then the empty first stage drops away, which means less to carry.' },
  { t: 'part', id: 'rocket', part: 'rocket' },
  { t: 'cam', on: 'stand', look: 'rocket', view: 'front', zoom: 1 },
].map((line) => JSON.stringify(line)).join('\n');
const NO_FIT = JSON.stringify({ t: 'fit', in: false, topic: 'bees', why: 'no part shows a bee' });

// Saving a scene is real file work, so this waits on the clock and not on ticks.
const flush = () => new Promise((resolve) => setTimeout(resolve, 120));

function setUp({ route = KIT_ROUTE, text = ROCKET_RECIPE, canCutIn = true, drawsFresh = false, liveRuns, isBeforeFirstWord = false }: { route?: SceneRoute; text?: string; canCutIn?: boolean; drawsFresh?: boolean; liveRuns?: TopicRuns; isBeforeFirstWord?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fast-scenes-'));
  const store = createSceneStore(root);
  const sent: SceneAgentMessage[] = [];
  const said: (readonly Beat[])[] = [];
  const cuts: (readonly Beat[])[] = [];
  const replyEnds: ReplyEnd[] = [];
  const state = { canSpeak: false, canCutIn };
  const write = vi.fn<RecipeWriter['write']>(async () => ({ text, ...USAGE }));
  const scenes = createTutorScenes({
    router: { route: vi.fn(async () => route) },
    runs: {} as never,
    store,
    getCardTitle: () => null,
    getNowMs: () => performance.now(),
    send: (message) => void sent.push(message),
    canSpeak: () => state.canSpeak,
    speak(beats) {
      said.push(beats);
      return true;
    },
    onShown: () => {},
    trace: () => {},
    fast: {
      canCutIn: () => state.canCutIn,
      isInBreath: () => false,
      isBeforeFirstWord: () => isBeforeFirstWord,
      cutIn(beats, replyEnd) {
        cuts.push(beats);
        replyEnds.push(replyEnd);
        return true;
      },
      mostAsks: 40,
      askLimitMs: 20_000,
      drawsFresh,
      makeWork: (input) =>
        createRecipeWork({
          ...input,
          router: { route: async () => route },
          writer: { write },
          reviewer: { read: async () => ({ isGood: false, reasons: ['held'], ...USAGE }) },
          nameReader: { clear: async () => new Set() },
          matcher: { match: async () => '' },
          ...(liveRuns ? { liveRuns } : {}),
          store,
          storeRoot: root,
          getParts: getPartCatalogue,
          getCore: getCoreSource,
          getLevel: () => 'high_school',
          trace: () => {},
        }),
    },
  });
  const say = (message: unknown) => {
    const parsed = parseSceneBrowserMessage(message);
    if (!parsed.ok) throw new Error(parsed.problem);
    scenes.onPage(parsed.value, STUDENT);
  };
  const askAndLoad = async (topic: string) => {
    expect(scenes.ask(topic)).toBe(true);
    await flush();
    const load = sent.findLast((message) => message.type === 'loadScene');
    if (load?.type !== 'loadScene') throw new Error('no scene went to the page');
    say({ type: 'sceneLoaded', sceneId: load.sceneId });
    return load;
  };
  return { scenes, store, sent, said, cuts, replyEnds, state, write, say, askAndLoad };
}

const getCommands = (beats: readonly Beat[]) => beats.flatMap((beat) => beat.script).flatMap((part) => (typeof part === 'string' ? [] : [part]));

describe('a typed question from Home', () => {
  it('starts its picture before the page joins, and sends it the moment the page says it can play', async () => {
    const { scenes, say, sent, write, cuts } = setUp();
    scenes.noteEarlyQuestion('why rockets have stages', STUDENT);
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(0);
    say({ type: 'sceneDevice', canPlay: true });
    const load = sent.findLast((message) => message.type === 'loadScene');
    if (load?.type !== 'loadScene') throw new Error('no scene went to the page');
    say({ type: 'sceneLoaded', sceneId: load.sceneId });
    expect(cuts).toHaveLength(1);
  });

  it('lands as the first teaching when the reply has said nothing yet', async () => {
    const { scenes, say, sent, cuts, replyEnds } = setUp({ isBeforeFirstWord: true });
    scenes.noteEarlyQuestion('why rockets have stages', STUDENT);
    await flush();
    say({ type: 'sceneDevice', canPlay: true });
    const load = sent.findLast((message) => message.type === 'loadScene');
    if (load?.type !== 'loadScene') throw new Error('no scene went to the page');
    say({ type: 'sceneLoaded', sceneId: load.sceneId });
    expect(cuts).toHaveLength(1);
    expect(replyEnds).toEqual(['now']);
  });

  it('never cuts in ahead of a read that has not answered, and tries again', async () => {
    const { scenes, say, sent, cuts, state } = setUp({ isBeforeFirstWord: true, canCutIn: false });
    scenes.noteEarlyQuestion('why rockets have stages', STUDENT);
    await flush();
    say({ type: 'sceneDevice', canPlay: true });
    const load = sent.findLast((message) => message.type === 'loadScene');
    if (load?.type !== 'loadScene') throw new Error('no scene went to the page');
    say({ type: 'sceneLoaded', sceneId: load.sceneId });
    expect(cuts).toHaveLength(0);
    state.canCutIn = true;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(cuts).toHaveLength(1);
  });

  it('holds the first reply once for a picture on its way, and lets go when the picture lands', async () => {
    const { scenes, say, sent } = setUp({ isBeforeFirstWord: true, canCutIn: true });
    scenes.noteEarlyQuestion('why rockets have stages', STUDENT);
    let isLetGo = false;
    void scenes.holdFirstWord().then(() => (isLetGo = true));
    await flush();
    expect(isLetGo).toBe(false);
    say({ type: 'sceneDevice', canPlay: true });
    const load = sent.findLast((message) => message.type === 'loadScene');
    if (load?.type !== 'loadScene') throw new Error('no scene went to the page');
    say({ type: 'sceneLoaded', sceneId: load.sceneId });
    await Promise.resolve();
    await Promise.resolve();
    expect(isLetGo).toBe(true);
    let isSecondLetGo = false;
    void scenes.holdFirstWord().then(() => (isSecondLetGo = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(isSecondLetGo).toBe(true);
  });

  it('lets the reply finish its sentence for a later ask', async () => {
    const { say, askAndLoad, cuts, replyEnds } = setUp({ isBeforeFirstWord: true });
    say({ type: 'sceneDevice', canPlay: true });
    await askAndLoad('why rockets have stages');
    expect(cuts).toHaveLength(1);
    expect(replyEnds).toEqual(['atSentenceEnd']);
  });

  it('writes one scene when the tutor then asks in other words', async () => {
    const { scenes, say, write } = setUp();
    scenes.noteEarlyQuestion('why rockets have stages', STUDENT);
    say({ type: 'sceneDevice', canPlay: true });
    await flush();
    scenes.ask('why a rocket drops its stages');
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('asks nothing for a page that cannot play', async () => {
    const { scenes, say, sent } = setUp();
    say({ type: 'sceneDevice', canPlay: false });
    scenes.noteEarlyQuestion('why rockets have stages', STUDENT);
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(0);
  });
});

describe('a saved scene', () => {
  const savedRocket = { ...getSceneKey('Why rockets have stages') };

  async function saveRocket(store: ReturnType<typeof createSceneStore>) {
    const parts = getPartCatalogue();
    const read = await readStarterRecipe({ text: ROCKET_RECIPE.replace('why rockets have stages', 'Why rockets have stages'), parts });
    if (!read.isOk) throw new Error(read.why);
    await store.saveChecked(toRecipeScene({ recipe: read.recipe, code: compileRecipe(read.recipe, { core: getCoreSource(), parts }), key: savedRocket, costUsd: 0, writeMs: 0 }), [], []);
  }

  it('plays with no model read on the same words in another form', async () => {
    const { scenes, store, say, sent, write } = setUp();
    await saveRocket(store);
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('Why do rockets have stages?');
    await flush();
    expect(write).not.toHaveBeenCalled();
    expect(sent.findLast((message) => message.type === 'loadScene')).toMatchObject({ sceneId: savedRocket.id, engine: 'kit' });
  });

  it('does not answer a question that adds a word', async () => {
    const { scenes, store, say, write } = setUp();
    await saveRocket(store);
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('Why do toy rockets have stages?');
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('live 3D at the end of the chain', () => {
  function setUpLive(route = KIT_ROUTE) {
    const join = vi.fn<TopicRuns['join']>(() => ({ plan: Promise.resolve('nothing' as const), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: false as const, reasons: ['refused'] }), leave: () => {} }));
    return { join, ...setUp({ route, text: NO_FIT, liveRuns: { join } }) };
  }

  it('writes only after no saved scene and no part fits', async () => {
    const { scenes, say, join, write } = setUpLive();
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('how bees make honey');
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledTimes(1);
    expect(join.mock.calls[0]?.[0]).toMatchObject({ ownerId: STUDENT });
  });

  it('stays out of what the parts can draw', async () => {
    const { scenes, say, join } = setUp({ liveRuns: { join: vi.fn() as never } }) as ReturnType<typeof setUp> & { join?: never };
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('why rockets have stages');
    await flush();
    expect(join).toBeUndefined();
  });

  it('never writes for the queue', async () => {
    const { scenes, say, join } = setUpLive();
    say({ type: 'sceneDevice', canPlay: true });
    scenes.prepare('how bees make honey');
    await flush();
    expect(join).not.toHaveBeenCalled();
  });

  it('leaves a route the kit does not draw to the words and the board', async () => {
    const { scenes, say, join } = setUpLive({ ...KIT_ROUTE, engine: 'manimgx' });
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('how bees make honey');
    await flush();
    expect(join).not.toHaveBeenCalled();
  });
});

describe('a fresh scene from a recipe', () => {
  it('comes in once the page has it, in place of the rest of the reply after its sentence', async () => {
    const { say, askAndLoad, cuts, replyEnds, said, write } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    const load = await askAndLoad('why rockets have stages');
    expect(load).toMatchObject({ engine: 'kit' });
    expect(said).toHaveLength(0);
    expect(replyEnds).toEqual(['atSentenceEnd']);
    expect(cuts).toHaveLength(1);
    expect(getCommands(cuts[0] as Beat[])[0]).toMatchObject({ kind: 'richScene', engine: 'kit', sceneId: load.sceneId });
    expect(write.mock.calls[0]?.[0]).toEqual({ topic: 'why rockets have stages', level: 'high_school' });
  });

  it('never ends its words on a question, and plays each line on its own word as one stretch', async () => {
    const { say, askAndLoad, cuts } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    await askAndLoad('why rockets have stages');
    const beats = cuts[0] as (Beat & { pauseBeforeMs?: number })[];
    expect(beats.some((beat) => beat.expectsReply)).toBe(false);
    expect(beats.some((beat) => beat.pauseBeforeMs !== undefined)).toBe(false);
    expect(getCommands(beats).filter((command) => command.kind === 'runSimulation').length).toBeGreaterThanOrEqual(2);
  });

  it('waits for the pause when the student has spoken since it was asked, because the tutor is answering them', async () => {
    const { scenes, say, sent, cuts, said, state } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    scenes.noteStudentTurn();
    scenes.ask('why rockets have stages');
    await flush();
    scenes.noteStudentTurn();
    const load = sent.findLast((message) => message.type === 'loadScene');
    if (load?.type !== 'loadScene') throw new Error('no scene went to the page');
    say({ type: 'sceneLoaded', sceneId: load.sceneId });
    expect(cuts).toHaveLength(0);
    state.canSpeak = true;
    scenes.notePause();
    expect(said).toHaveLength(1);
  });

  it('draws nothing and logs the miss when no part fits', async () => {
    const { scenes, say, sent, cuts } = setUp({ text: NO_FIT });
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('how bees make honey');
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(0);
    expect(cuts).toHaveLength(0);
  });

  it.each(['safety', 'dangerous'])('draws nothing after a %s read, even with a recipe ready', async (kind) => {
    const { scenes, say, sent } = setUp({ route: { ...KIT_ROUTE, engine: 'none', kind, topic: '' } });
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('why rockets have stages');
    await flush();
    expect(sent.filter((message) => message.type === 'loadScene')).toHaveLength(0);
  });

  it('keeps a shared copy out of the library when the review holds it, and the picture still lands', async () => {
    const { store, say, askAndLoad, cuts } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    await askAndLoad('why rockets have stages');
    await flush();
    expect(cuts).toHaveLength(1);
    expect(await store.listShared()).toHaveLength(0);
    expect(store.find(getSceneKey('why rockets have stages', { ownerId: STUDENT }))?.ownerId).toBe(STUDENT);
  });

  it('skips a saved written take on a page with no WebGPU, and draws a recipe there instead', async () => {
    const { scenes, store, say, sent, write } = setUp();
    const key = getSceneKey('why rockets have stages');
    const saved = { id: key.id, topic: key.topic, ownerId: null, status: 'checked', engine: 'manimgx', engineVersion: 'x', code: '', narration: '', plan: { opening: [], setup: '', narration: '', plan: '', close: '' }, moments: {}, parts: [], durationSeconds: 1, declared: {}, values: {}, review: [], layoutNotes: [], isCheckedByPerson: false, takeBytes: { light: 0, dark: 0 }, trace: { writer: '', attempts: 1, writeMs: 0, renderMs: 0, reviewMs: 0, totalMs: 0, costUsd: 0, problems: [] }, savedAt: '' } as StoredScene;
    await store.saveChecked(saved, [], []);
    say({ type: 'sceneDevice', canPlay: true, canPlayTakes: false });
    scenes.ask('why rockets have stages');
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(sent.find((message) => message.type === 'loadScene')).toMatchObject({ engine: 'kit' });
  });
});

describe('a new topic in the middle of a lesson', () => {
  const landRocket = async (context: ReturnType<typeof setUp>) => {
    context.say({ type: 'sceneDevice', canPlay: true });
    await context.askAndLoad('why rockets have stages');
  };

  it('takes the old picture away on the next beat and asks for its own', async () => {
    const context = setUp();
    await landRocket(context);
    context.write.mockClear();
    context.scenes.noteTopic('Volcanoes');
    expect(context.scenes.takeOwedCommands()).toEqual([{ kind: 'hide', target: 'scene-1' }]);
    expect(context.scenes.takeOwedCommands()).toEqual([]);
    await flush();
    expect(context.write.mock.calls[0]?.[0].topic).toBe('Volcanoes');
  });

  it('leaves the picture alone on a side question, and says its words after the answer', async () => {
    const context = setUp();
    await landRocket(context);
    const beats = context.cuts[0] as Beat[];
    context.scenes.noteSceneCut({ reports: new Map(), wordsSent: new Map([[beats[0]?.id as Beat['id'], 3]]) });
    context.scenes.noteStudentTurn();
    context.scenes.noteTopic('Rockets');
    expect(context.scenes.takeOwedCommands()).toEqual([]);
    context.state.canSpeak = true;
    context.scenes.notePause();
    expect(context.said).toHaveLength(1);
    expect((context.said[0] as Beat[]).length).toBe(beats.length);
  });

  it('brings the picture back on a return, at the moment it reached', async () => {
    const context = setUp();
    await landRocket(context);
    const beats = context.cuts[0] as Beat[];
    context.scenes.noteSceneCut({ reports: new Map(), wordsSent: new Map([[beats[1]?.id as Beat['id'], 2], [beats[0]?.id as Beat['id'], 13]]) });
    context.scenes.noteTopic('Volcanoes');
    context.scenes.takeOwedCommands();
    context.scenes.noteTopic('Why rockets have stages');
    const owed = context.scenes.takeOwedCommands();
    expect(owed[0]).toMatchObject({ kind: 'richScene', engine: 'kit' });
    expect(context.sent.at(-1)).toMatchObject({ type: 'loadScene' });
  });

  it('gives a crisis no scene words back and asks for nothing more', async () => {
    const context = setUp();
    await landRocket(context);
    const beats = context.cuts[0] as Beat[];
    context.scenes.noteSceneCut({ reports: new Map(), wordsSent: new Map([[beats[0]?.id as Beat['id'], 3]]) });
    context.scenes.noteSafetyReply();
    context.state.canSpeak = true;
    context.scenes.notePause();
    expect(context.said).toHaveLength(0);
    expect(context.scenes.ask('how volcanoes erupt')).toBe(false);
  });
});

describe('asks while a scene is under way', () => {
  it('keeps the ask going when the plan and the tutor name one idea in two ways', async () => {
    const { scenes, say, write } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    scenes.ask('Parts of a rocket');
    expect(scenes.ask('why rockets have stages')).toBe(true);
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('passes over a side question of its own while a scene has words left', async () => {
    const { scenes, say, askAndLoad, cuts, write } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    await askAndLoad('why rockets have stages');
    const beats = cuts[0] as Beat[];
    scenes.noteSceneCut({ reports: new Map(), wordsSent: new Map([[beats[0]?.id as Beat['id'], 3]]) });
    write.mockClear();
    expect(scenes.ask('what escape velocity means')).toBe(false);
    await flush();
    expect(write).not.toHaveBeenCalled();
  });
});

describe('a drawing that starts from the student\'s line', () => {
  const STOPS_ON_TOPIC = 'why rockets have stages';

  it('starts before the tutor asks, and the tutor\'s ask in reply to that line starts nothing more', async () => {
    const { scenes, write, sent, say } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    scenes.noteStudentTurn();
    expect(scenes.askFromLine(STOPS_ON_TOPIC)).toBe(true);
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(sent.some((message) => message.type === 'loadScene')).toBe(true);
    expect(scenes.isLineAnswering()).toBe(true);
    scenes.noteStudentTurn();
    expect(scenes.isLineAnswering()).toBe(false);
  });

  it('leaves a side question about what is on screen with the picture it has', async () => {
    const { scenes, say, askAndLoad, cuts } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    await askAndLoad(STOPS_ON_TOPIC);
    expect(cuts).toHaveLength(1);
    expect(scenes.askFromLine('how do the rockets drop a stage')).toBe(false);
  });

  it('hands the turn back to the tutor when the line led to no picture', async () => {
    const { scenes, say } = setUp({ route: { ...KIT_ROUTE, engine: 'none', kind: 'chatter', topic: '' } });
    say({ type: 'sceneDevice', canPlay: true });
    scenes.noteStudentTurn();
    scenes.askFromLine('what time is it');
    await flush();
    expect(scenes.isLineAnswering()).toBe(false);
  });
});

describe('a drawing the student has moved on from', () => {
  it('stops being written, so it costs no more', async () => {
    const { scenes, write, say } = setUp({ drawsFresh: true });
    say({ type: 'sceneDevice', canPlay: true });
    let stopSignal: AbortSignal | null = null;
    write.mockImplementationOnce((_ask, _parts, signal) => {
      stopSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('stopped'))));
    });
    scenes.ask('why rockets have stages');
    await flush();
    scenes.ask('how a bicycle stays up');
    await flush();
    expect((stopSignal as AbortSignal | null)?.aborted).toBe(true);
  });
});

describe('a sentence start on the voice clock', () => {
  const timelineOf = (text: string) => {
    const words = text.split(' ').map((word, index) => ({ text: word, startMs: index * 100 }));
    const timeline = createWordTimeline([{ id: 'one' as Beat['id'], script: [text], expectsReply: false }]);
    timeline.toBeatWords(words);
    return timeline;
  };

  it('names the next word after a full stop or a question, and never a word after a comma', () => {
    const timeline = timelineOf('Ever wondered why? Okay, dig in. Fans push air');
    expect(timeline.getSentenceStartFrom(0)).toBe(300);
    expect(timeline.getSentenceStartFrom(300)).toBe(300);
    expect(timeline.getSentenceStartFrom(301)).toBe(600);
    expect(timeline.getSentenceStartFrom(601)).toBeNull();
  });

  it('has nothing to name inside the last sentence', () => {
    expect(timelineOf('Fans push air out the back.').getSentenceStartFrom(0)).toBeNull();
  });
});
