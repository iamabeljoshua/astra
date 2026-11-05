import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AgentMessage, parseBeat, type SceneAgentMessage } from '@astra/contracts';
import { initializeLogger, tts } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveSession, type LiveSession } from '../src/live/live-session.ts';
import { createTakePicker, type StoredTake } from '../src/live/reactions.ts';
import { createVoiceLine, type VoiceOutput } from '../src/live/voice-line.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { createSceneStore } from '../src/scenes/scene-store.ts';
import type { LessonPlan, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import type { TutorBeat, TutorBrain } from '../src/tutor/brain.ts';
import { WATCHER_WORDS } from '../src/tutor/watcher/board-work.ts';
import { createTutorScenes } from '../src/tutor/tutor-scenes.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TOPIC = 'what the slope of a line tells you';
const USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const PLAN: LessonPlan = { opening: [{ say: 'x' }], more: [], setup: 'Watch the line tilt.', narration: '[[a]] The line climbs. [[b]] It climbs at one steady rate.', plan: 'a: a\nb: b', close: 'What would a steeper line tell you?' };
const SCENE: StoredScene = { id: `scene-${'a'.repeat(40)}`, engine: 'manimgx', topic: TOPIC, moments: { a: 0, b: 2 }, parts: [], durationSeconds: 5, plan: PLAN, ownerId: null } as unknown as StoredScene;
const LONG = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen';
const CRISIS = 'That sounds serious. It is not your fault. Please tell an adult you trust now, or call your local emergency number. Are you safe right now?';

function makeBeat(id: string, text: string, expectsReply = false): TutorBeat {
  const parsed = parseBeat({ id, script: [text], expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}
function makeTake(id: string, use: StoredTake['use'], phrase: string): StoredTake {
  const { pcm, words } = renderTone(phrase);
  return { id, use, phrase, sampleRate: 24000, words, base64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64') };
}
const TAKES = [makeTake('hm', 'reaction', 'Hm.'), makeTake('okay', 'reaction', 'Okay.'), makeTake('greet', 'greeting', 'Hi there.')];

function makeOutput(): VoiceOutput {
  let queuedUntilMs = 0;
  return {
    sampleRate: 24000,
    async captureFrame(frame: { samplesPerChannel: number; sampleRate: number }) {
      queuedUntilMs = Math.max(queuedUntilMs, performance.now()) + (frame.samplesPerChannel / frame.sampleRate) * 1000;
    },
    clearQueue() {
      queuedUntilMs = 0;
    },
    async waitForPlayout() {
      await delay(Math.max(0, queuedUntilMs - performance.now()));
    },
  } as unknown as VoiceOutput;
}

const sessions: LiveSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

function start({ reply, cardTitle = null as string | null, isPageThere = true, getBoard }: { reply: (text: string) => TutorBeat[]; cardTitle?: string | null; isPageThere?: boolean; getBoard?: TutorBrain['getBoard'] }) {
  const timeline: { atMs: number; what: string }[] = [];
  const startedAt = performance.now();
  const note = (what: string) => timeline.push({ atMs: Math.round(performance.now() - startedAt), what });
  const closed = { isClosed: false };
  const page = { isThere: isPageThere };
  const sceneSent: SceneAgentMessage[] = [];
  const store = createSceneStore(mkdtempSync(join(tmpdir(), 'scene-session-')));
  if (cardTitle) vi.spyOn(store, 'find').mockImplementation(() => SCENE);
  const tutor: TutorBrain = {
    async *reply({ text }) {
      note(`student: ${text}`);
      for (const beat of reply(text)) yield beat;
    },
    getClosedReason: () => (closed.isClosed ? ('dailyLimit' as never) : null),
    noteSceneTurn: () => note('noteSceneTurn'),
    ...(getBoard ? { getBoard } : {}),
  };
  const send = (message: AgentMessage) => {
    if (message.type === 'words') note(`words ${message.beatId as string}: ${message.words.map(({ text }) => text).join(' ')}`);
  };
  const voice: tts.TTS = makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts();
  const session = createLiveSession({
    messenger: { send, sendOnBothChannels: send },
    line: createVoiceLine(makeOutput()),
    voice,
    tutor,
    takes: createTakePicker(TAKES),
    allTakes: TAKES,
    setTurnCap: () => {},
    onPause: () => scenes.notePause(),
    onStudentTurn: () => scenes.noteStudentTurn(),
    getOpeningScene: () => scenes.getOpeningScene(),
    waitForPicture: () => scenes.waitForPicture(),
    onLinkChange: (isUp: boolean) => scenes.notePageLink(isUp),
  } as Parameters<typeof createLiveSession>[0]);
  sessions.push(session);
  const scenes = createTutorScenes({
    router: { route: vi.fn(async () => ({ engine: 'manimgx', kind: 'graph', topic: TOPIC, ...USAGE }) as SceneRoute) },
    runs: { join: vi.fn(() => ({ plan: Promise.resolve(PLAN), firstLine: Promise.resolve(null), getScene: async () => ({ isOk: true as const, scene: SCENE }), leave: vi.fn() })) } as never,
    store,
    getCardTitle: () => cardTitle,
    getNowMs: () => performance.now(),
    send(message) {
      sceneSent.push(message);
      if (message.type === 'loadScene' && page.isThere) setTimeout(() => scenes.onPage({ type: 'sceneLoaded', sceneId: message.sceneId }, 'maya'), 20);
    },
    canSpeak: session.isAtPause,
    speak: session.speakScene,
    onShown: () => note('sceneShown'),
    isClosed: () => closed.isClosed,
    trace: (name, fields = {}) => {
      if (name === 'sceneEnded') note(`sceneEnded ${String(fields.how)}`);
    },
  } as Parameters<typeof createTutorScenes>[0]);
  scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
  return { session, scenes, timeline, sceneSent, closed, page };
}

const heardScene = (timeline: { what: string }[]) => timeline.filter(({ what }) => /words n1-/.test(what)).map(({ what }) => what);
const until = async (read: () => boolean, ms: number) => {
  const end = performance.now() + ms;
  while (!read() && performance.now() < end) await delay(20);
};
const type = (session: LiveSession, text: string) => session.onBrowser({ type: 'typed', text } as never);

describe('a reply that asks for a scene and sets a task', () => {
  it('holds the scene back while the student works, so nothing covers the task', async () => {
    const parsed = parseBeat({ id: 't1', script: [{ kind: 'writeMath', id: 'p1', tex: '15 + 27', claim: 'new' }, 'Fifteen plus twenty-seven. ', { kind: 'task', id: 'a1', way: 'write', on: 'p1' }, 'Have a go at the first line.'], expectsReply: true });
    if (!parsed.ok) throw new Error(parsed.problem);
    const board = { openTask: 'a1', state: { elements: new Map([['a1', { content: { kind: 'task', way: 'write', on: 'p1' } }]]) } };
    const context = start({ reply: () => (context.scenes.ask(TOPIC), [parsed.value]), getBoard: () => board as never });
    type(context.session, 'why does slope matter');
    await until(() => context.timeline.some(({ what }) => what.startsWith('words t1')), 3000);
    await delay(8000);
    expect(context.sceneSent.some(({ type: sent }) => sent === 'loadScene')).toBe(true);
    expect(context.session.isAtPause()).toBe(false);
    expect(heardScene(context.timeline)).toEqual([]);
  }, 20000);
});

describe('a student turn while a scene is pending', () => {
  it('ends it when they say they are in danger, so no scene words reach them after the help line', async () => {
    const context = start({ reply: (text) => (text.includes('slope') ? (context.scenes.ask(TOPIC), [makeBeat('t1', LONG)]) : [makeBeat('crisis', CRISIS, true)]) });
    type(context.session, 'why does slope matter');
    await until(() => context.timeline.some(({ what }) => what.startsWith('words t1')), 3000);
    await delay(300);
    type(context.session, 'i want to kill myself');
    await until(() => heardScene(context.timeline).length > 0, 17000);
    expect(heardScene(context.timeline)).toEqual([]);
  }, 30000);

  it('ends it when they say they do not want the picture', async () => {
    const context = start({ reply: (text) => (text.includes('slope') ? (context.scenes.ask(TOPIC), [makeBeat('t1', LONG)]) : [makeBeat('t2', 'Okay, we can leave that.')]) });
    type(context.session, 'why does slope matter');
    await until(() => context.timeline.some(({ what }) => what.startsWith('words t1')), 3000);
    type(context.session, 'skip that, i do not want the picture');
    await until(() => heardScene(context.timeline).length > 0, 9000);
    expect(heardScene(context.timeline)).toEqual([]);
  }, 20000);

  it('stays when the tutor only spoke up on a silence, which is no turn of the student\'s', async () => {
    const context = start({ reply: (text) => (text.includes('slope') ? (context.scenes.ask(TOPIC), [makeBeat('t1', LONG)]) : [makeBeat('t2', 'Need a hand with that?')]) });
    type(context.session, 'why does slope matter');
    await until(() => context.timeline.some(({ what }) => what.startsWith('words t1')), 3000);
    type(context.session, WATCHER_WORDS);
    await until(() => heardScene(context.timeline).length > 0, 12000);
    expect(context.timeline.map(({ what }) => what)).not.toContain('sceneEnded studentTurn');
    expect(heardScene(context.timeline).length).toBeGreaterThan(0);
  }, 20000);

  it('stays when that same turn asks for the scene', async () => {
    const context = start({ reply: (text) => (text.includes('slope') ? (context.scenes.ask(TOPIC), [makeBeat('t1', 'Sure thing.')]) : [makeBeat('t2', LONG)]) });
    type(context.session, 'tell me a thing');
    await until(() => context.timeline.some(({ what }) => what.startsWith('words t2')), 3000);
    type(context.session, 'now show me slope');
    await until(() => heardScene(context.timeline).length > 0, 9000);
    expect(heardScene(context.timeline).length).toBeGreaterThan(0);
  }, 20000);

  it('never speaks a scene once the tutor has closed', async () => {
    const context = start({ reply: () => (context.scenes.ask(TOPIC), [makeBeat('t1', 'Sure thing.')]) });
    context.closed.isClosed = true;
    type(context.session, 'why does slope matter');
    await until(() => heardScene(context.timeline).length > 0, 7000);
    expect(heardScene(context.timeline)).toEqual([]);
  }, 20000);
});

describe('a page reloaded while a scene is pending', () => {
  it('plays no words until the new page has the take', async () => {
    const context = start({ reply: () => (context.scenes.ask(TOPIC), [makeBeat('t1', 'Sure thing.')]) });
    type(context.session, 'why does slope matter');
    await until(() => context.sceneSent.length === 1, 3000);
    await delay(50);
    context.page.isThere = false;
    context.scenes.onPage({ type: 'sceneDevice', canPlay: true }, 'maya');
    await delay(6000);
    expect(heardScene(context.timeline)).toEqual([]);
    expect(context.sceneSent.filter(({ type: kind }) => kind === 'loadScene').length).toBeGreaterThan(1);
  }, 20000);
});

describe('a card with a saved scene', () => {
  it('lands at the end of the greeting, and the first line follows it, told what it said', async () => {
    const lines: string[] = [];
    const context = start({ cardTitle: TOPIC, reply: (text) => (lines.push(text), [makeBeat('t1', 'So what would a flat line mean?', true)]) });
    context.scenes.noteCard(TOPIC);
    await delay(40);
    type(context.session, TOPIC);
    await until(() => context.timeline.some(({ what }) => what.startsWith('words t1')), 15000);
    const order = context.timeline.map(({ what }) => what).filter((what) => /words|noteSceneTurn|student:|sceneShown/.test(what));
    const first = (pattern: RegExp) => order.findIndex((what) => pattern.test(what));
    expect(first(/words greet/)).toBeGreaterThanOrEqual(0);
    expect(first(/words greet/)).toBeLessThan(first(/words n1-scene-setup/));
    expect(first(/sceneShown/)).toBeLessThan(first(/student:/));
    expect(first(/words n1-scene-take/)).toBeLessThan(first(/words t1/));
    expect(order.join(' ')).not.toContain('steeper');
    expect(lines).toEqual([TOPIC]);
  }, 25000);

  it('gives way when no scene is saved, and the first words do not wait for it', async () => {
    const context = start({ reply: () => [makeBeat('t1', 'So slope is steepness.')] });
    context.scenes.noteCard(null);
    type(context.session, 'what is slope');
    await until(() => context.timeline.some(({ what }) => what.startsWith('student:')), 500);
    expect(context.timeline.some(({ what }) => what.startsWith('student:'))).toBe(true);
    expect(heardScene(context.timeline)).toEqual([]);
  }, 10000);
});
