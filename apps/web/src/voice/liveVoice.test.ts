import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LiveVoice, type LiveVoiceOptions, startLiveVoice } from './liveVoice';

const { FakeRoom, rooms, makeFakeAudioContext } = vi.hoisted(() => {
  const rooms: InstanceType<typeof FakeRoom>[] = [];

  class FakeRoom {
    state = 'disconnected';
    handlers = new Map<string, (...args: unknown[]) => void>();
    localParticipant = {
      publishData: vi.fn(async (_payload: Uint8Array, _options: object) => {}),
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  rooms.length = 0;
});

afterEach(async () => {
  await voice.close();
  vi.useRealTimers();
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
    expect(voice.getView().phase).toBe('ended');
  });

  it('stops at once with no reason of its own when live voice is no longer set up', async () => {
    const getAccess = vi.fn(async () => ({ access: null, unavailableBecause: 'notSetUp' as const }));
    const { room } = await openVoice(getAccess);

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(voice.getView().phase).toBe('ended');
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
