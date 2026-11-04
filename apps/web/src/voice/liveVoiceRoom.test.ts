import { DisconnectReason, RoomEvent, Track } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_TOPIC, type RoomAccess, startLiveVoice } from './liveVoice';

const TUTOR_WAIT_MS = 25_000;
const ACCESS: RoomAccess = { url: 'wss://room', token: 'token', roomName: 'session-a-1', isTutorThere: false };
const NEW_ACCESS: RoomAccess = { url: 'wss://room', token: 'token', roomName: 'session-a-2', isTutorThere: false };
const ACCESS_WITH_TUTOR: RoomAccess = { ...ACCESS, isTutorThere: true };

const fake = vi.hoisted(() => {
  class FakeRoom {
    state = 'disconnected';
    readonly remoteParticipants = new Map<string, object>();
    readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    readonly localParticipant = { publishData: vi.fn(async () => {}), publishTrack: vi.fn(async () => {}), unpublishTrack: vi.fn(async () => {}) };
    readonly connect = vi.fn(async () => {
      const making = fake.nextConnect;
      fake.nextConnect = null;
      await making?.();
      this.state = 'connected';
      this.remoteParticipants.clear();
      for (const [id, participant] of fake.nextParticipants) this.remoteParticipants.set(id, participant);
    });
    readonly disconnect = vi.fn(async () => {
      this.state = 'disconnected';
    });
    constructor() {
      fake.rooms.push(this);
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.forEach((handler) => handler(...args));
    }
  }
  return { FakeRoom, rooms: [] as FakeRoom[], nextParticipants: [] as [string, object][], nextConnect: null as (() => Promise<void>) | null };
});

vi.mock('livekit-client', async (importOriginal) => ({ ...(await importOriginal<typeof import('livekit-client')>()), Room: fake.FakeRoom }));
vi.mock('./tutorAudio', () => ({
  OUTPUT_GAINS: { full: 1, lowered: 0.25, silent: 0 },
  createTutorAudioContext: async () => ({ state: 'suspended', currentTime: 0, outputLatency: 0, createGain: () => ({ gain: { setValueAtTime() {} }, connect() {} }), createAnalyser: () => ({}), resume: async () => {}, close: async () => {} }),
  listenToTutor: () => () => {},
  listenToStudent: () => () => {},
  resumeAudio: async () => {},
}));

const encoder = new TextEncoder();

async function open({ getAccess = async () => ACCESS as RoomAccess | null } = {}) {
  const captured = { stop: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getAudioTracks: () => [captured] }) } });
  const voice = await startLiveVoice({ getAccess });
  const room = fake.rooms.at(-1) as InstanceType<typeof fake.FakeRoom>;
  const hear = (message: object) => room.emit(RoomEvent.DataReceived, encoder.encode(JSON.stringify(message)), undefined, undefined, LIVE_TOPIC);
  return { voice, room, captured, hear, tutorTrackArrives: () => room.emit(RoomEvent.TrackSubscribed, { kind: Track.Kind.Audio }) };
}

const typedLines = (room: InstanceType<typeof fake.FakeRoom>) =>
  room.localParticipant.publishData.mock.calls
    .map(([payload]: unknown[]) => JSON.parse(new TextDecoder().decode(payload as Uint8Array)) as { type: string; text?: string })
    .filter((message) => message.type === 'typed')
    .map((message) => message.text);

beforeEach(() => {
  fake.rooms.length = 0;
  fake.nextParticipants = [];
  fake.nextConnect = null;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a job that died before the student joined', () => {
  it('leaves its track behind, so the page gives up on the wait with the room left and the microphone off', async () => {
    const { voice, room, captured, tutorTrackArrives } = await open();
    tutorTrackArrives();
    await voice.toggleMic();
    expect(voice.getView().mic).toBe('on');
    await vi.advanceTimersByTimeAsync(TUTOR_WAIT_MS);
    expect(voice.getView().phase).toBe('noTutor');
    expect(voice.getView().mic).toBe('off');
    expect(captured.stop).toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalled();
    await voice.close();
  });

  it('does not say the room is live on a track alone, because no tutor has been heard', async () => {
    const { voice, tutorTrackArrives } = await open();
    tutorTrackArrives();
    expect(voice.getView().phase).toBe('connecting');
    await voice.close();
  });

  it('says hello on the track, so a live tutor greets without waiting for its first pulse', async () => {
    const { voice, room, tutorTrackArrives } = await open();
    tutorTrackArrives();
    const sent = room.localParticipant.publishData.mock.calls.map(([payload]: unknown[]) => JSON.parse(new TextDecoder().decode(payload as Uint8Array)) as { type: string });
    expect(sent.map((message) => message.type)).toContain('hello');
    await voice.close();
  });
});

describe('a tutor that is there', () => {
  it('goes live on its first pulse, and the wait never fires', async () => {
    const { voice, hear, tutorTrackArrives } = await open();
    tutorTrackArrives();
    hear({ type: 'pulse' });
    expect(voice.getView().phase).toBe('live');
    for (let beat = 0; beat < 60; beat += 1) {
      hear({ type: 'pulse' });
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(voice.getView().phase).toBe('live');
    await voice.close();
  });

  it('goes live on any message from it, because pulses come on the lossy channel', async () => {
    const { voice, hear, tutorTrackArrives } = await open();
    tutorTrackArrives();
    hear({ type: 'heard' });
    expect(voice.getView().phase).toBe('live');
    await vi.advanceTimersByTimeAsync(TUTOR_WAIT_MS);
    expect(voice.getView().phase).toBe('live');
    await voice.close();
  });
});

describe('a room that closes before the tutor is heard', () => {
  it('asks for a room again rather than ending, because a warm room can close as a late press lands', async () => {
    const getAccess = vi.fn(async () => ACCESS as RoomAccess | null);
    const { voice, room, hear, tutorTrackArrives } = await open({ getAccess });
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(10);
    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(voice.getView().phase).toBe('connecting');
    tutorTrackArrives();
    hear({ type: 'pulse' });
    expect(voice.getView().phase).toBe('live');
    await voice.close();
  });

  it('ends if that room closed because the session finished', async () => {
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS).mockResolvedValue(null);
    const { voice, room } = await open({ getAccess });
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(10);
    expect(voice.getView().phase).toBe('ended');
    await voice.close();
  });

});

describe('a room that closes under the page', () => {
  it('asks again when the room closes after the tutor was heard, because a job can close on a student coming back', async () => {
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS).mockResolvedValue(NEW_ACCESS);
    const { voice, room, hear } = await open({ getAccess });
    hear({ type: 'pulse' });
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(10);
    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(voice.getView().phase).toBe('reconnecting');
    expect(voice.getView().startedFresh).toBe(true);
    await voice.close();
  });

  it('ends once the API says the session finished, however the room closed', async () => {
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS).mockResolvedValue(null);
    const { voice, room, hear } = await open({ getAccess });
    hear({ type: 'pulse' });
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(10);
    expect(voice.getView().phase).toBe('ended');
    await voice.close();
  });

  it('sends a line no tutor answered again, into the new room', async () => {
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS).mockResolvedValue(NEW_ACCESS);
    const { voice, room, hear, tutorTrackArrives } = await open({ getAccess });
    tutorTrackArrives();
    hear({ type: 'pulse' });
    voice.sendTyped('Why does it fall?');
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(10);
    room.localParticipant.publishData.mockClear();
    room.state = 'connected';
    tutorTrackArrives();
    expect(typedLines(room)).toEqual(['Why does it fall?']);
    await voice.close();
  });

  it('does not send a line again once the tutor has heard it', async () => {
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS).mockResolvedValue(NEW_ACCESS);
    const { voice, room, hear, tutorTrackArrives } = await open({ getAccess });
    tutorTrackArrives();
    hear({ type: 'pulse' });
    voice.sendTyped('Why does it fall?');
    hear({ type: 'heard' });
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(10);
    room.localParticipant.publishData.mockClear();
    room.state = 'connected';
    tutorTrackArrives();
    expect(typedLines(room)).toEqual([]);
    await voice.close();
  });
});

describe('a room whose job closed just after the API saw it', () => {
  it('asks again at once, and does not sit out the wait for a tutor who is not coming', async () => {
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS_WITH_TUTOR).mockResolvedValue(NEW_ACCESS);
    const { voice } = await open({ getAccess });
    await vi.advanceTimersByTimeAsync(10);
    expect(getAccess).toHaveBeenCalledTimes(2);
    await voice.close();
  });

  it('leaves a room with a job in it alone', async () => {
    fake.nextParticipants = [['agent', {}]];
    const getAccess = vi.fn(async () => ACCESS_WITH_TUTOR as RoomAccess | null);
    const { voice } = await open({ getAccess });
    await vi.advanceTimersByTimeAsync(10);
    expect(getAccess).toHaveBeenCalledTimes(1);
    await voice.close();
  });

  it('leaves a new room alone while its job is on the way', async () => {
    const getAccess = vi.fn(async () => ACCESS as RoomAccess | null);
    const { voice } = await open({ getAccess });
    await vi.advanceTimersByTimeAsync(10);
    expect(getAccess).toHaveBeenCalledTimes(1);
    await voice.close();
  });

  it('stops asking after a few tries, and leaves it to the wait for a tutor', async () => {
    const getAccess = vi.fn(async () => ACCESS_WITH_TUTOR as RoomAccess | null);
    const { voice } = await open({ getAccess });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getAccess.mock.calls.length).toBeLessThanOrEqual(4);
    await vi.advanceTimersByTimeAsync(TUTOR_WAIT_MS);
    expect(voice.getView().phase).toBe('noTutor');
    await voice.close();
  });
});

describe('a join that a closing room leaves hanging', () => {
  const startOpening = (getAccess: () => Promise<RoomAccess | null>) => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getAudioTracks: () => [{ stop() {} }] }) } });
    return startLiveVoice({ getAccess });
  };
  const nextRoom = () => fake.rooms.at(-1) as InstanceType<typeof fake.FakeRoom>;

  it('waits for that join to settle before it joins the new room, because LiveKit hands a second join the first one\'s promise', async () => {
    let settleFirstJoin = () => {};
    fake.nextConnect = () =>
      new Promise<void>((resolve) => {
        settleFirstJoin = resolve;
      });
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS_WITH_TUTOR).mockResolvedValue(NEW_ACCESS);
    const opening = startOpening(getAccess);
    await vi.advanceTimersByTimeAsync(10);
    const room = nextRoom();
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(10);
    expect(room.connect).toHaveBeenCalledTimes(1);
    settleFirstJoin();
    const voice = await opening;
    await vi.advanceTimersByTimeAsync(10);
    expect(room.connect).toHaveBeenCalledTimes(2);
    expect(getAccess).toHaveBeenCalledTimes(2);
    await voice.close();
  });

  it('asks again when the first join fails, rather than giving up on a room that closed', async () => {
    fake.nextConnect = () => Promise.reject(new Error('could not establish pc connection'));
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS_WITH_TUTOR).mockResolvedValue(NEW_ACCESS);
    const voice = await startOpening(getAccess);
    await vi.advanceTimersByTimeAsync(10);
    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(voice.getView().phase).toBe('connecting');
    await voice.close();
  });

  it('gives a tutor in a new room its own wait', async () => {
    const getAccess = vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS).mockResolvedValue(NEW_ACCESS);
    const { voice, room } = await open({ getAccess });
    await vi.advanceTimersByTimeAsync(TUTOR_WAIT_MS - 1000);
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    await vi.advanceTimersByTimeAsync(TUTOR_WAIT_MS - 1000);
    expect(voice.getView().phase).toBe('connecting');
    await vi.advanceTimersByTimeAsync(2000);
    expect(voice.getView().phase).toBe('noTutor');
    await voice.close();
  });
});

describe('a room whose tutor is there', () => {
  it('never joins a room it has already left, if a slow answer lands after it gave up', async () => {
    let answer: (access: RoomAccess | null) => void = () => {};
    const { voice, room } = await open({ getAccess: vi.fn<() => Promise<RoomAccess | null>>().mockResolvedValueOnce(ACCESS).mockImplementation(() => new Promise((resolve) => { answer = resolve; })) });
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.UNKNOWN_REASON);
    await vi.advanceTimersByTimeAsync(TUTOR_WAIT_MS);
    expect(voice.getView().phase).toBe('noTutor');
    const joinsBefore = room.connect.mock.calls.length;
    answer(ACCESS);
    await vi.advanceTimersByTimeAsync(10);
    expect(room.connect.mock.calls.length).toBe(joinsBefore);
    expect(voice.getView().phase).toBe('noTutor');
    await voice.close();
  });
});

describe('a press during LiveKit own reconnect', () => {
  it('publishes the microphone once the room is back, because the page already says it is on', async () => {
    const { voice, room, hear } = await open();
    hear({ type: 'pulse' });
    room.state = 'reconnecting';
    room.emit(RoomEvent.Reconnecting);
    await voice.toggleMic();
    expect(voice.getView().mic).toBe('on');
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
    room.state = 'connected';
    room.emit(RoomEvent.Reconnected);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    await voice.close();
  });

  it('publishes nothing if the student pressed off before the room came back', async () => {
    const { voice, room, hear, captured } = await open();
    hear({ type: 'pulse' });
    room.state = 'reconnecting';
    room.emit(RoomEvent.Reconnecting);
    await voice.toggleMic();
    await voice.toggleMic();
    room.state = 'connected';
    room.emit(RoomEvent.Reconnected);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
    expect(captured.stop).toHaveBeenCalled();
    await voice.close();
  });

  it('turns the microphone off and says so if that publish is refused', async () => {
    const { voice, room, hear, captured } = await open();
    hear({ type: 'pulse' });
    room.state = 'reconnecting';
    await voice.toggleMic();
    room.localParticipant.publishTrack.mockRejectedValueOnce(new Error('refused'));
    room.state = 'connected';
    room.emit(RoomEvent.Reconnected);
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.getView().mic).toBe('off');
    expect(captured.stop).toHaveBeenCalled();
    await voice.close();
  });

  it('does not publish twice when a rejoin already did', async () => {
    const { voice, room, hear } = await open();
    hear({ type: 'pulse' });
    room.state = 'reconnecting';
    await voice.toggleMic();
    room.state = 'disconnected';
    room.emit(RoomEvent.Disconnected, DisconnectReason.UNKNOWN_REASON);
    await vi.advanceTimersByTimeAsync(10);
    expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    room.emit(RoomEvent.Reconnected);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    await voice.close();
  });
});

describe('the microphone when the page stops being in a room', () => {
  it('ends the capture when the room closes for quiet', async () => {
    const { voice, hear, captured } = await open();
    hear({ type: 'pulse' });
    await voice.toggleMic();
    expect(captured.stop).not.toHaveBeenCalled();
    hear({ type: 'closingForQuiet' });
    expect(captured.stop).toHaveBeenCalled();
    expect(voice.getView().mic).toBe('off');
    await voice.close();
  });

  it('ends the capture when the page goes, before anything can wait', async () => {
    const { voice, hear, captured } = await open();
    hear({ type: 'pulse' });
    await voice.toggleMic();
    expect(captured.stop).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(captured.stop).toHaveBeenCalled();
    await voice.close();
  });
});
