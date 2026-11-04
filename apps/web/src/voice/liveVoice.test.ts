import { LIVE_MESSAGE_MAX_BYTES, TYPED_TEXT_MAX_CHARACTERS } from '@astra/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_TOPIC, type LiveVoice, type LiveVoiceOptions, startLiveVoice } from './liveVoice';

const { FakeRoom, rooms, makeFakeAudioContext } = vi.hoisted(() => {
  const rooms: InstanceType<typeof FakeRoom>[] = [];

  class FakeRoom {
    state = 'disconnected';
    handlers = new Map<string, (...args: unknown[]) => void>();
    localParticipant = {
      publishData: vi.fn<(payload: Uint8Array, options: object) => Promise<void>>(async () => {}),
      publishTrack: vi.fn(async () => {}),
      unpublishTrack: vi.fn(async () => {}),
    };
    connect = vi.fn(async () => {
      this.state = 'connected';
    });
    disconnect = vi.fn(async () => {
      this.state = 'disconnected';
    });

    constructor() {
      rooms.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args);
    }
  }

  const makeFakeAudioContext = () => ({
    state: 'running',
    currentTime: 0,
    outputLatency: 0,
    sampleRate: 48000,
    createGain: () => ({ gain: { setValueAtTime: () => {} } }),
    resume: async () => {},
    close: async () => {},
  });

  return { FakeRoom, rooms, makeFakeAudioContext };
});

vi.mock('livekit-client', () => ({
  Room: FakeRoom,
  RoomEvent: { TrackSubscribed: 'TrackSubscribed', DataReceived: 'DataReceived', Reconnecting: 'Reconnecting', Reconnected: 'Reconnected', Disconnected: 'Disconnected' },
  Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
  DisconnectReason: { CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, ROOM_DELETED: 3 },
  createLocalAudioTrack: vi.fn(async () => ({ stop: () => {}, mediaStreamTrack: {} })),
}));

vi.mock('./tutorAudio', () => ({
  createTutorAudioContext: vi.fn(async () => makeFakeAudioContext()),
  listenToTutor: () => () => {},
  listenToStudent: () => () => {},
  OUTPUT_GAINS: { full: 1, lowered: 0.25, silent: 0 },
}));

const ROOM_ACCESS = { url: 'wss://room.test', roomName: 'session-a-session', token: 'room-token' };
const OPEN_ROOM = { access: ROOM_ACCESS, unavailableBecause: null };
const DROPPED = 99;
const QUIET_LONG_ENOUGH_TO_REJOIN_MS = 4000;

let voice: LiveVoice;

async function openVoice(getAccess: LiveVoiceOptions['getAccess'] = async () => OPEN_ROOM) {
  voice = await startLiveVoice({ access: ROOM_ACCESS, getAccess });
  return { room: rooms.at(-1)!, getAccess };
}

function fromAgent(room: InstanceType<typeof FakeRoom>, message: object) {
  room.emit('DataReceived', new TextEncoder().encode(JSON.stringify(message)), undefined, undefined, LIVE_TOPIC);
}

function getSentMessages(room: InstanceType<typeof FakeRoom>) {
  return room.localParticipant.publishData.mock.calls.map(([payload]) => JSON.parse(new TextDecoder().decode(payload)) as { type: string; text?: string });
}

function getLastStudentLine() {
  return voice.getView().studentLines.at(-1)?.text;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  rooms.length = 0;
});

afterEach(async () => {
  await voice.close();
  vi.useRealTimers();
});

describe('a typed message', () => {
  const EMOJI = '\u{1F30D}';

  it('is clipped at whole characters before it goes out, so a long one cannot pass the data limit', async () => {
    const { room } = await openVoice();
    fromAgent(room, { type: 'pulse' });

    voice.sendTyped(EMOJI.repeat(TYPED_TEXT_MAX_CHARACTERS + 5000));

    const sent = getSentMessages(room).find((message) => message.type === 'typed')!;
    expect(sent.text).toBe(EMOJI.repeat(TYPED_TEXT_MAX_CHARACTERS));
    expect(new TextEncoder().encode(JSON.stringify(sent)).length).toBeLessThanOrEqual(LIVE_MESSAGE_MAX_BYTES);
    expect(getLastStudentLine()).toBe(EMOJI.repeat(TYPED_TEXT_MAX_CHARACTERS));
  });

  it('leaves a short one as it was typed', async () => {
    const { room } = await openVoice();
    fromAgent(room, { type: 'pulse' });

    voice.sendTyped('Why?');

    expect(getSentMessages(room).find((message) => message.type === 'typed')?.text).toBe('Why?');
  });
});

describe('when the tutor closes', () => {
  it('keeps the reason on the view, and stops saying it is thinking', async () => {
    const { room } = await openVoice();
    fromAgent(room, { type: 'thinking', isThinking: true });

    fromAgent(room, { type: 'tutorClosed', reason: 'sessionLimit' });

    expect(voice.getView().closedBecause).toBe('sessionLimit');
    expect(voice.getView().isThinking).toBe(false);
  });

  it('starts with no reason, so an open room does not read as closed', async () => {
    await openVoice();

    expect(voice.getView().closedBecause).toBeNull();
  });

  it('turns the microphone off and will not turn it back on, so no voice goes to a room with no tutor', async () => {
    const { room } = await openVoice();
    await voice.setMicOn(true);
    expect(voice.getView().mic).toBe('on');

    fromAgent(room, { type: 'tutorClosed', reason: 'broken' });
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.getView().mic).toBe('off');
    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledTimes(1);

    await voice.setMicOn(true);
    expect(voice.getView().mic).toBe('off');
    expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
  });

  it('does not rejoin when the link goes quiet, because a new join would call in and pay for another tutor', async () => {
    const getAccess = vi.fn(async () => OPEN_ROOM);
    const { room } = await openVoice(getAccess);
    fromAgent(room, { type: 'pulse' });

    fromAgent(room, { type: 'tutorClosed', reason: 'dailyLimit' });
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).not.toHaveBeenCalled();
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(voice.getView().phase).not.toBe('reconnecting');
  });

  it('does not rejoin when the room drops the student', async () => {
    const getAccess = vi.fn(async () => OPEN_ROOM);
    const { room } = await openVoice(getAccess);

    fromAgent(room, { type: 'tutorClosed', reason: 'dailyLimit' });
    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).not.toHaveBeenCalled();
    expect(voice.getView().phase).toBe('ended');
  });
});

describe('rejoining after a drop', () => {
  it('joins again with the new access', async () => {
    const getAccess = vi.fn(async () => ({ access: { ...ROOM_ACCESS, token: 'fresh-token' }, unavailableBecause: null }));
    const { room } = await openVoice(getAccess);

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(0);

    expect(room.connect).toHaveBeenLastCalledWith(ROOM_ACCESS.url, 'fresh-token');
    expect(voice.getView().phase).toBe('live');
  });

  it('stops at once and says why when the student has spent the day, rather than retrying for two minutes', async () => {
    const getAccess = vi.fn(async () => ({ access: null, unavailableBecause: 'dailyLimit' as const }));
    const { room } = await openVoice(getAccess);

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(voice.getView()).toMatchObject({ phase: 'ended', closedBecause: 'dailyLimit' });
  });

  it('stops at once with no reason of its own when live voice is no longer set up', async () => {
    const getAccess = vi.fn(async () => ({ access: null, unavailableBecause: 'notSetUp' as const }));
    const { room } = await openVoice(getAccess);

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(voice.getView()).toMatchObject({ phase: 'ended', closedBecause: null });
  });

  it('keeps trying through a failed request, which a later try can get past', async () => {
    const getAccess = vi.fn<LiveVoiceOptions['getAccess']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(OPEN_ROOM);
    const { room } = await openVoice(getAccess);

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(voice.getView().phase).toBe('live');
  });
});
