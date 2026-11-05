import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Beat, parseSceneBrowserMessage, type SceneAgentMessage } from '@astra/contracts';
import { describe, expect, it, vi } from 'vitest';
import { getCoreSource, getPartCatalogue } from '../src/scenes/recipe/catalogue.ts';
import { createRecipeWork, type RecipeWriter } from '../src/scenes/recipe/recipe-work.ts';
import { createSceneStore, getSceneKey } from '../src/scenes/scene-store.ts';
import type { SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import { createTutorScenes } from '../src/tutor/tutor-scenes.ts';
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

function setUp({ route = KIT_ROUTE, text = ROCKET_RECIPE, canCutIn = true }: { route?: SceneRoute; text?: string; canCutIn?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fast-scenes-'));
  const store = createSceneStore(root);
  const sent: SceneAgentMessage[] = [];
  const said: (readonly Beat[])[] = [];
  const cuts: (readonly Beat[])[] = [];
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
      cutIn(beats) {
        cuts.push(beats);
        return true;
      },
      mostAsks: 40,
      askLimitMs: 20_000,
      makeWork: (input) =>
        createRecipeWork({
          ...input,
          router: { route: async () => route },
          writer: { write },
          reviewer: { read: async () => ({ isGood: false, reasons: ['held'], ...USAGE }) },
          nameReader: { clear: async () => new Set() },
          matchReader: null,
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
  return { scenes, store, sent, said, cuts, state, write, say, askAndLoad };
}

const getCommands = (beats: readonly Beat[]) => beats.flatMap((beat) => beat.script).flatMap((part) => (typeof part === 'string' ? [] : [part]));

describe('a fresh scene from a recipe', () => {
  it('comes in at the next sentence, in place of the rest of the reply', async () => {
    const { scenes, say, askAndLoad, cuts, said, write } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    const load = await askAndLoad('why rockets have stages');
    expect(load).toMatchObject({ engine: 'kit' });
    expect(cuts).toHaveLength(0);
    scenes.noteSentenceBreak();
    expect(said).toHaveLength(0);
    expect(cuts).toHaveLength(1);
    expect(getCommands(cuts[0] as Beat[])[0]).toMatchObject({ kind: 'richScene', engine: 'kit', sceneId: load.sceneId });
    expect(write.mock.calls[0]?.[0]).toEqual({ topic: 'why rockets have stages', level: 'high_school' });
  });

  it('never ends its words on a question, and plays each line on its own word as one stretch', async () => {
    const { scenes, say, askAndLoad, cuts } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    await askAndLoad('why rockets have stages');
    scenes.noteSentenceBreak();
    const beats = cuts[0] as (Beat & { pauseBeforeMs?: number })[];
    expect(beats.some((beat) => beat.expectsReply)).toBe(false);
    expect(beats.some((beat) => beat.pauseBeforeMs !== undefined)).toBe(false);
    expect(getCommands(beats).filter((command) => command.kind === 'runSimulation').length).toBeGreaterThanOrEqual(2);
  });

  it('waits for the pause when the student has spoken since it was asked, because the tutor is answering them', async () => {
    const { scenes, say, askAndLoad, cuts, said, state } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    scenes.noteStudentTurn();
    await askAndLoad('why rockets have stages');
    scenes.noteStudentTurn();
    scenes.noteSentenceBreak();
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
    scenes.noteSentenceBreak();
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
    const { scenes, store, say, askAndLoad, cuts } = setUp();
    say({ type: 'sceneDevice', canPlay: true });
    await askAndLoad('why rockets have stages');
    scenes.noteSentenceBreak();
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
    context.scenes.noteSentenceBreak();
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

describe('a sentence break on the voice clock', () => {
  const timelineOf = (text: string) => {
    const words = text.split(' ').map((word, index) => ({ text: word, startMs: index * 100 }));
    const timeline = createWordTimeline([{ id: 'one' as Beat['id'], script: [text], expectsReply: false }]);
    timeline.toBeatWords(words);
    return timeline;
  };

  it('fires once, when the next sentence is about to start, after a full stop and after a question with words behind it', () => {
    const timeline = timelineOf('Ever wondered why? Okay, dig in. Fans push air');
    expect(timeline.hasCrossedSentenceBreak(250)).toBe(false);
    expect(timeline.hasCrossedSentenceBreak(300)).toBe(true);
    expect(timeline.hasCrossedSentenceBreak(400)).toBe(false);
    expect(timeline.hasCrossedSentenceBreak(600)).toBe(true);
    expect(timeline.hasCrossedSentenceBreak(900)).toBe(false);
  });

  it('does not break inside a sentence, and has nothing to say after the last word', () => {
    const timeline = timelineOf('Fans push air out the back.');
    expect(timeline.hasCrossedSentenceBreak(10_000)).toBe(false);
  });
});
