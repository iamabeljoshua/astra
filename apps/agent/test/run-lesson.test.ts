import { type Beat, getBeatText } from '@astra/contracts';
import { initializeLogger } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTone } from '../src/providers/fakes.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import type { LessonWork } from '../src/scenes/lesson/lesson-work.ts';
import { runLesson } from '../src/scenes/lesson/run-lesson.ts';
import { createSceneDesk } from '../src/scenes/scene-desk.ts';
import type { MadeScene } from '../src/scenes/make-scene.ts';
import type { LessonPlan, SceneRoute, StoredScene } from '../src/scenes/scene-types.ts';
import { FakeRoom } from './fake-room.ts';

vi.mock('@livekit/rtc-node', async (importOriginal) => {
  const real = await importOriginal<typeof import('@livekit/rtc-node')>();
  const { FakeRoom: Room, FakeAudioSource: AudioSource } = await import('./fake-room.ts');
  return { ...real, Room, AudioSource, LocalAudioTrack: { createAudioTrack: () => ({}) }, TrackPublishOptions: class {} };
});

initializeLogger({ pretty: false, level: 'silent' });

const LAB = 'astra.lab';
const SCENES = 'astra.scenes';
const PLAN: LessonPlan = {
  opening: [{ say: 'A derivative measures how fast something changes right now, at one single moment.' }, { say: 'Think of the dial in a car, which reads your speed at this instant.' }],
  more: [],
  setup: 'Watch the line.',
  narration: '[[curve]] Here is the curve. [[point]] Here is a point on it.',
  plan: 'curve: the curve\npoint: a dot',
  close: 'What happens at the bottom?',
};
const SCENE = { id: 'scene-1', engine: 'manimgx', plan: PLAN, narration: PLAN.narration, moments: { curve: 0, point: 2 }, parts: ['curve'], durationSeconds: 6, status: 'checked' } as unknown as StoredScene;
const FAST = { joinLimitMs: 400, rejoinLimitMs: 150, deviceLimitMs: 40, loadLimitMs: 40, lingerMs: 30 };
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeWork({ plan = PLAN, scene = null as StoredScene | null } = {}) {
  let toShow = scene;
  return {
    request: 'What a derivative really measures',
    desk: { ask: vi.fn(), takeReady: () => { const taken = toShow; toShow = null; return taken; }, takeAtOpening: () => null, untilLastChance: async () => {}, getState: () => ({ kind: 'idle' }), isMissed: () => false },
    plan: Promise.resolve(plan),
    firstLine: Promise.resolve(plan.opening[0] ?? null),
    planWithoutScene: vi.fn(),
  } as unknown as LessonWork & { desk: { ask: ReturnType<typeof vi.fn> }; planWithoutScene: ReturnType<typeof vi.fn> };
}

function makeVoice() {
  const save = vi.fn();
  return { save, voice: { forTurn: () => ({ tts: makeRenderedVoice({ name: 'tone', render: renderTone }).makeTts(), save }), getLiveCharacters: () => 0, close: async () => {} } };
}

function start({ work = makeWork() as LessonWork, voice = makeVoice().voice, timings = FAST }: { work?: LessonWork; voice?: ReturnType<typeof makeVoice>['voice']; timings?: typeof FAST } = {}) {
  const events: string[] = [];
  const finished = runLesson({ url: 'ws://room', token: 'token', work, voice, onEvent: (name) => events.push(name), timings } as Parameters<typeof runLesson>[0]);
  return { work, events, finished };
}

async function untilConnected() {
  await delay(0);
  return FakeRoom.last;
}

const untilClosed = async (room: FakeRoom, beatId: string, limitMs = 4000) => {
  const endAtMs = Date.now() + limitMs;
  while (!room.getClosedBeats().includes(beatId) && Date.now() < endAtMs) await delay(5);
  return room.getClosedBeats().includes(beatId);
};

describe('one data packet', () => {
  it.each([['bytes that are not JSON', new Uint8Array([0xff, 0xfe, 0x7b])], ['JSON that is not an object', new TextEncoder().encode('null')], ['a number', new TextEncoder().encode('7')]])('cannot throw into the room: %s', async (_name, bytes) => {
    const { finished } = start();
    const room = await untilConnected();
    room.join('PA1');
    for (const topic of [LAB, SCENES, 'astra.live', 'no.such.topic']) expect(() => room.sendRaw(topic, bytes)).not.toThrow();
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'close')).toBe(true);
    room.leave('PA1');
    await finished;
  });

  it('cannot settle the device with a value that is not a boolean, and a lab message of an unknown type is refused', async () => {
    const work = makeWork();
    const { finished } = start({ work });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: 'yes' });
    room.send(LAB, { type: 'hello', extra: { deep: true } });
    room.send(LAB, { type: 'delete everything' });
    await delay(FAST.deviceLimitMs + 30);
    expect(work.desk.ask).not.toHaveBeenCalled();
    expect(work.planWithoutScene).toHaveBeenCalledOnce();
    room.leave('PA1');
    await finished;
  });
});

describe('a scene or line the player refuses', () => {
  it('keeps the plain board and the voice going to the end when a saved scene has a part name the parser refuses', async () => {
    const work = makeWork({ scene: { ...SCENE, parts: ['tangent_line'] } as StoredScene });
    const { finished } = start({ work });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'close')).toBe(true);
    room.leave('PA1');
    await finished;
  });

  it('keeps going past a saved line too long to say', async () => {
    const work = makeWork({ plan: { ...PLAN, more: [{ say: 'x'.repeat(700) }, { say: 'Steeper means the value changes faster.' }] } });
    const { finished } = start({ work });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'close')).toBe(true);
    expect(room.getClosedBeats()).toContain('more-1');
    room.leave('PA1');
    await finished;
  });
});

describe('a student who reopens the lesson', () => {
  it('gets words on the new page when the same identity replaces the old page, new page first', async () => {
    const { finished } = start();
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await delay(10);
    room.join('PA2');
    room.leave('PA1');
    expect(await untilClosed(room, 'close')).toBe(true);
    room.leave('PA2');
    await finished;
  });

  it('gets words when the old page goes first and the new page comes inside the limit', async () => {
    const { finished } = start();
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await delay(10);
    room.leave('PA1');
    await delay(FAST.rejoinLimitMs / 3);
    room.join('PA2');
    expect(await untilClosed(room, 'close')).toBe(true);
    room.leave('PA2');
    await finished;
  });

  it('says the words again from the start of the cut line, because a new page has none of the old one', async () => {
    const { finished } = start();
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    while (!room.sent.some(({ message }) => message.type === 'beatOpened' || message.type === 'words')) await delay(1);
    const sentBefore = room.sent.length;
    room.join('PA2');
    room.leave('PA1');
    await untilClosed(room, 'close');
    expect(room.sent.slice(sentBefore).some(({ message }) => message.type === 'words')).toBe(true);
    room.leave('PA2');
    await finished;
  });

  it('asks the new page to load a scene again, so a scene cut by a reopen still draws', async () => {
    const work = makeWork({ scene: SCENE });
    const { finished } = start({ work, timings: { ...FAST, loadLimitMs: 200 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    while (!room.sent.some(({ message }) => message.type === 'loadScene')) await delay(1);
    room.send(SCENES, { type: 'sceneLoaded', sceneId: SCENE.id });
    while (!room.sent.some(({ message }) => message.type === 'words' && JSON.stringify(message).includes('curve'))) await delay(1);
    room.join('PA2');
    room.leave('PA1');
    const answerLoads = setInterval(() => room.send(SCENES, { type: 'sceneLoaded', sceneId: SCENE.id }), 5);
    await untilClosed(room, 'close');
    clearInterval(answerLoads);
    expect(room.sent.filter(({ message }) => message.type === 'loadScene').length).toBeGreaterThanOrEqual(2);
    room.leave('PA2');
    await finished;
  });

  it('ends only after the rejoin limit when nobody comes back', async () => {
    const { finished, events } = start({ timings: { ...FAST, rejoinLimitMs: 60 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await delay(10);
    room.leave('PA1');
    await finished;
    expect(room.getClosedBeats()).not.toContain('close');
    expect(events).toContain('studentGone');
    expect(room.isConnected).toBe(false);
  });

  it('ends the lesson when the agent itself loses the room', async () => {
    const { finished } = start();
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await delay(10);
    const { RoomEvent } = await import('@livekit/rtc-node');
    room.emit(RoomEvent.Disconnected);
    await finished;
    expect(room.getClosedBeats()).not.toContain('close');
  });
});

describe('a lesson waiting on a slow model', () => {
  it('clears its room as soon as the student has gone, so a reopened page does not wait on it', async () => {
    const work = makeWork();
    Object.assign(work, { plan: new Promise(() => {}), firstLine: new Promise(() => {}) });
    const { finished } = start({ work, timings: { ...FAST, rejoinLimitMs: 30 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await untilClosed(room, 'reaction');
    room.leave('PA1');
    await finished;
    expect(room.isConnected).toBe(false);
  });
});

describe('a student who closes the tab mid-sentence', () => {
  it('does not save the cut voice as the whole line', async () => {
    const { voice, save } = makeVoice();
    const { finished } = start({ voice });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    while (!room.sent.some(({ message }) => message.type === 'words')) await delay(1);
    const savedBefore = save.mock.calls.length;
    room.leave('PA1');
    await finished;
    expect(save.mock.calls.length).toBe(savedBefore);
  });
});

describe('spending before a student is there', () => {
  afterEach(() => vi.useRealTimers());

  it('calls no model and speaks nothing to a room nobody joined, then ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const work = makeWork();
    const { finished } = start({ work, timings: undefined as unknown as typeof FAST });
    await vi.advanceTimersByTimeAsync(0);
    const room = FakeRoom.last;
    await vi.advanceTimersByTimeAsync(40_000);
    expect(work.desk.ask).not.toHaveBeenCalled();
    expect(work.planWithoutScene).not.toHaveBeenCalled();
    expect(room.getClosedBeats()).toEqual([]);
    await vi.advanceTimersByTimeAsync(70_000);
    await finished;
    expect(room.isConnected).toBe(false);
  });

  it('starts the work as soon as a student has joined and said what the browser can play', async () => {
    const work = makeWork();
    const { finished } = start({ work });
    const room = await untilConnected();
    await delay(5);
    expect(work.desk.ask).not.toHaveBeenCalled();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await delay(5);
    expect(work.desk.ask).toHaveBeenCalledOnce();
    room.leave('PA1');
    await finished;
  });
});


function makeRealDeskWork({ plan = PLAN, getNowMs = () => Date.now() }: { plan?: LessonPlan; getNowMs?(): number } = {}) {
  let finishMake: (made: MadeScene) => void = () => {};
  const made = new Promise<MadeScene>((resolve) => {
    finishMake = resolve;
  });
  const route = async (): Promise<SceneRoute> => ({ engine: 'manimgx', kind: 'graph', topic: 'slopes', model: 'fake', ms: 1, costUsd: 0 });
  const desk = createSceneDesk({ route, make: () => made, getNowMs });
  const work = { request: 'slopes', desk, plan: Promise.resolve(plan), firstLine: Promise.resolve(plan.opening[0] ?? null), planWithoutScene: vi.fn(), leave: vi.fn(), getVoiceShelf: () => ({ kind: 'shared' }) } as unknown as LessonWork;
  return { work, finishMake };
}

describe('a scene that comes after the last line', () => {
  it('still reaches a student on the page, once the close line has ended and inside the 20 s', async () => {
    const { work, finishMake } = makeRealDeskWork();
    const { finished, events } = start({ work, timings: { ...FAST, lingerMs: 400, loadLimitMs: 300 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'close')).toBe(true);
    finishMake({ isOk: true, scene: SCENE });
    await vi.waitFor(() => expect(room.sent.some(({ message }) => message.type === 'loadScene')).toBe(true), { timeout: 300 });
    room.send(SCENES, { type: 'sceneLoaded', sceneId: SCENE.id });
    expect(await untilClosed(room, 'scene-take')).toBe(true);
    expect(events).toContain('sceneShown');
    expect(await untilClosed(room, 'close-again')).toBe(true);
    room.leave('PA1');
    await finished;
  });

  it('does not wait past the window, and the lesson holds on the plain board when the scene fails', async () => {
    const { work, finishMake } = makeRealDeskWork();
    const { finished, events } = start({ work });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'close')).toBe(true);
    finishMake({ isOk: false, reasons: ['refused'] });
    await delay(20);
    expect(room.sent.some(({ message }) => message.type === 'loadScene')).toBe(false);
    expect(events).not.toContain('sceneShown');
    room.leave('PA1');
    await finished;
  });
});

describe('a scene already saved when the lesson opens', () => {
  it('opens on the scene, with its moments on its words, and no opening line comes first', async () => {
    const { work, finishMake } = makeRealDeskWork();
    finishMake({ isOk: true, scene: SCENE });
    const { finished } = start({ work, timings: { ...FAST, loadLimitMs: 300 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await vi.waitFor(() => expect(room.sent.some(({ message }) => message.type === 'loadScene')).toBe(true), { timeout: 2000 });
    room.send(SCENES, { type: 'sceneLoaded', sceneId: SCENE.id });
    expect(await untilClosed(room, 'scene-take')).toBe(true);
    const order = room.getClosedBeats();
    expect(order[0]).toBe('reaction');
    expect(order[1]).toBe('scene-take');
    expect(order).not.toContain('line-0');
    expect(await untilClosed(room, 'close')).toBe(true);
    room.leave('PA1');
    await finished;
  });

  it('falls back to the words and the plain board when the browser refuses the saved scene', async () => {
    const { work, finishMake } = makeRealDeskWork();
    finishMake({ isOk: true, scene: SCENE });
    const { finished } = start({ work });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await vi.waitFor(() => expect(room.sent.some(({ message }) => message.type === 'loadScene')).toBe(true), { timeout: 2000 });
    room.send(SCENES, { type: 'sceneRefused', sceneId: SCENE.id });
    expect(await untilClosed(room, 'line-0')).toBe(true);
    expect(await untilClosed(room, 'close')).toBe(true);
    room.leave('PA1');
    await finished;
  });
});

describe('how long one turn runs', () => {
  it('makes each line of a long take its own turn, so no turn runs on past 45 words', async () => {
    const long = `[[curve]] ${'Here is a curve that runs on across the page. '.repeat(3)}[[point]] ${'Now a point sits on it for a while. '.repeat(4)}`;
    const scene = { ...SCENE, narration: long, plan: { ...PLAN, narration: long } } as StoredScene;
    const turns: string[] = [];
    const voice = { forTurn: (beats: readonly Beat[]) => { turns.push(beats.map(getBeatText).join(' ')); return { tts: makeRenderedVoice({ name: 'tone', render: renderTone }).makeTts() }; } };
    const { work, finishMake } = makeRealDeskWork();
    finishMake({ isOk: true, scene });
    const { finished } = start({ work, voice: voice as never, timings: { ...FAST, loadLimitMs: 300 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await vi.waitFor(() => expect(room.sent.some(({ message }) => message.type === 'loadScene')).toBe(true), { timeout: 2000 });
    room.send(SCENES, { type: 'sceneLoaded', sceneId: SCENE.id });
    expect(await untilClosed(room, 'close')).toBe(true);
    expect(turns.length).toBeGreaterThan(3);
    for (const turn of turns) expect(turn.split(' ').length).toBeLessThanOrEqual(45);
    room.leave('PA1');
    await finished;
  });
});

describe('a request with no lesson behind it', () => {
  it('tells the page, so it can offer a way back and no reply box that cannot answer', async () => {
    const work = makeWork();
    Object.assign(work, { plan: Promise.resolve('nothing'), firstLine: Promise.resolve(null) });
    const { finished } = start({ work });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'no-lesson')).toBe(true);
    expect(room.sent.some(({ topic, message }) => topic === SCENES && message.type === 'noLesson')).toBe(true);
    room.leave('PA1');
    await finished;
  });

  it('declines a dangerous question calmly, with no crisis wording', async () => {
    const work = makeWork();
    Object.assign(work, { plan: Promise.resolve('declined'), firstLine: Promise.resolve(null) });
    const said: string[] = [];
    const voice = { forTurn: (beats: readonly Beat[]) => { said.push(...beats.map(getBeatText)); return { tts: makeRenderedVoice({ name: 'tone', render: renderTone }).makeTts() }; } };
    const { finished } = start({ work, voice: voice as never });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    while (!room.sent.some(({ topic, message }) => topic === SCENES && message.type === 'noLesson')) await delay(1);
    await untilClosed(room, 'declined-2');
    const spoken = said.join(' ');
    expect(spoken).toMatch(/won't walk through/);
    expect(spoken).not.toMatch(/emergency|don't feel safe|adult you trust|lesson for that one/);
    room.leave('PA1');
    await finished;
  });

  it.each([['nothing', 'no-lesson'], ['unsafe', 'unsafe']])('tells a reloaded page again, so it gets no reply box on the %s line', async (why, beat) => {
    const work = makeWork();
    Object.assign(work, { plan: Promise.resolve(why), firstLine: Promise.resolve(null) });
    const { finished } = start({ work, timings: { ...FAST, lingerMs: 2000 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, beat)).toBe(true);
    await delay(60);
    const sentBefore = room.sent.length;
    room.join('PA2');
    room.leave('PA1');
    await delay(20);
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await delay(60);
    expect(room.sent.slice(sentBefore).some(({ topic, message }) => topic === SCENES && message.type === 'noLesson')).toBe(true);
    room.leave('PA2');
    await finished;
  });

  it('says it has no lesson whenever a page says it can hear, because a message sent as a page joins can be lost', async () => {
    const work = makeWork();
    Object.assign(work, { plan: Promise.resolve('nothing'), firstLine: Promise.resolve(null) });
    const { finished } = start({ work, timings: { ...FAST, lingerMs: 2000 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'no-lesson')).toBe(true);
    const firstCount = room.sent.filter(({ message }) => message.type === 'noLesson').length;
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    await delay(10);
    expect(room.sent.filter(({ message }) => message.type === 'noLesson').length).toBeGreaterThan(firstCount);
    room.leave('PA1');
    await finished;
  });

  it.each([['as it is said', 40], ['after it is said', 2500]])('gives a page reloaded %s the lesson again, and not only the question on an empty board', async (_when, waitMs) => {
    const { finished } = start({ timings: { ...FAST, lingerMs: 6000 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'close')).toBe(true);
    await delay(waitMs);
    const sentBefore = room.sent.length;
    room.join('PA2');
    room.leave('PA1');
    await delay(5);
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    const endAtMs = Date.now() + 4000;
    while (room.sent.slice(sentBefore).filter(({ message }) => message.type === 'beatClosed' && message.beatId === 'close').length === 0 && Date.now() < endAtMs) await delay(5);
    const closedAgain = room.sent.slice(sentBefore).filter(({ message }) => message.type === 'beatClosed').map(({ message }) => message.beatId);
    expect(closedAgain).toContain('line-0');
    expect(closedAgain).toContain('line-1');
    expect(closedAgain.at(-1)).toBe('close');
    room.leave('PA2');
    await finished;
  });

  it('gives the lesson to a page reloaded while a late scene is still awaited, rather than an empty board until the window ends', async () => {
    const work = makeWork();
    Object.assign(work.desk, { untilLastChance: () => delay(5000) });
    const { finished } = start({ work, timings: { ...FAST, lingerMs: 6000 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'close')).toBe(true);
    await delay(2500);
    const sentBefore = room.sent.length;
    room.join('PA2');
    room.leave('PA1');
    await delay(5);
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    const endAtMs = Date.now() + 2000;
    while (!room.sent.slice(sentBefore).some(({ message }) => message.type === 'beatClosed' && message.beatId === 'line-0') && Date.now() < endAtMs) await delay(5);
    expect(room.sent.slice(sentBefore).some(({ message }) => message.type === 'beatClosed' && message.beatId === 'line-0')).toBe(true);
    room.leave('PA2');
    await finished;
  });

  it('puts the scene back on a page reloaded after the close, then asks the question', async () => {
    const work = makeWork({ scene: SCENE });
    const { finished } = start({ work, timings: { ...FAST, loadLimitMs: 300, lingerMs: 3000 } });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    const answerLoads = setInterval(() => room.send(SCENES, { type: 'sceneLoaded', sceneId: SCENE.id }), 5);
    expect(await untilClosed(room, 'close')).toBe(true);
    await delay(40);
    const loadsBefore = room.sent.filter(({ message }) => message.type === 'loadScene').length;
    const sentBefore = room.sent.length;
    room.join('PA2');
    room.leave('PA1');
    await delay(5);
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    const endAtMs = Date.now() + 4000;
    while (!room.sent.slice(sentBefore).some(({ message }) => message.type === 'beatClosed' && message.beatId === 'close') && Date.now() < endAtMs) await delay(5);
    clearInterval(answerLoads);
    expect(room.sent.filter(({ message }) => message.type === 'loadScene').length).toBeGreaterThan(loadsBefore);
    const closedAgain = room.sent.slice(sentBefore).filter(({ message }) => message.type === 'beatClosed').map(({ message }) => message.beatId);
    expect(closedAgain.some((id) => String(id).startsWith('scene-take'))).toBe(true);
    expect(closedAgain.at(-1)).toBe('close');
    room.leave('PA2');
    await finished;
  });

  it('points a request about being unsafe to an adult they trust and local emergency help, and names no hotline', async () => {
    const work = makeWork();
    Object.assign(work, { plan: Promise.resolve('unsafe'), firstLine: Promise.resolve(null) });
    const said: string[] = [];
    const voice = { forTurn: (beats: readonly Beat[]) => { said.push(...beats.map(getBeatText)); return { tts: makeRenderedVoice({ name: 'tone', render: renderTone }).makeTts() }; } };
    const { finished } = start({ work, voice: voice as never });
    const room = await untilConnected();
    room.join('PA1');
    room.send(SCENES, { type: 'sceneDevice', canPlay: true });
    expect(await untilClosed(room, 'unsafe-2')).toBe(true);
    const spoken = said.join(' ');
    expect(spoken).toMatch(/adult you trust/);
    expect(spoken).toMatch(/emergency number/);
    expect(spoken).not.toMatch(/\d{3}/);
    room.leave('PA1');
    await finished;
  });
});
