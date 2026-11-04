import { initializeLogger } from '@livekit/agents';
import type { Beat } from '@astra/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeRenderedVoice } from '../src/providers/fakes.ts';
import type { LessonWork } from '../src/scenes/lesson/lesson-work.ts';
import { runLesson } from '../src/scenes/lesson/run-lesson.ts';
import type { LessonPlan, StoredScene } from '../src/scenes/scene-types.ts';
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
    desk: { ask: vi.fn(), takeReady: () => { const taken = toShow; toShow = null; return taken; }, getState: () => ({ kind: 'idle' }), isMissed: () => false },
    plan: Promise.resolve(plan),
    firstLine: Promise.resolve(plan.opening[0] ?? null),
    planWithoutScene: vi.fn(),
  } as unknown as LessonWork & { desk: { ask: ReturnType<typeof vi.fn> }; planWithoutScene: ReturnType<typeof vi.fn> };
}

function makeVoice() {
  const save = vi.fn();
  return { save, voice: { forTurn: () => ({ tts: makeRenderedVoice({ name: 'tone' }).makeTts(), save }), getLiveCharacters: () => 0, close: async () => {} } };
}

function start({ work = makeWork(), voice = makeVoice().voice, timings = FAST } = {}) {
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

export type { Beat };
