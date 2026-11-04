import { LIVE_MESSAGE_MAX_BYTES, TYPED_TEXT_MAX_CHARACTERS } from '@astra/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_TOPIC, type LiveVoice, type LiveVoiceOptions, startLiveVoice } from './liveVoice';

const { FakeRoom, rooms, makeFakeAudioContext } = vi.hoisted(() => {
  const rooms: InstanceType<typeof FakeRoom>[] = [];

  class FakeRoom {
    state = 'disconnected';
    remoteParticipants = new Map<string, object>();
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
}));

vi.mock('./micLine', () => ({
  openMicLine: (captured: MediaStreamTrack) => ({ track: captured, hold: () => {}, release: () => {}, stop: () => captured.stop() }),
}));

vi.mock('./tutorAudio', () => ({
  createTutorAudioContext: vi.fn(async () => makeFakeAudioContext()),
  listenToTutor: () => () => {},
  listenToStudent: () => () => {},
  resumeAudio: async () => {},
  OUTPUT_GAINS: { full: 1, lowered: 0.25, silent: 0 },
}));

const ROOM_ACCESS = { url: 'wss://room.test', roomName: 'session-a-session', isTutorThere: false, token: 'room-token' };
const DROPPED = 99;
const QUIET_LONG_ENOUGH_TO_REJOIN_MS = 4000;

let voice: LiveVoice;

async function openVoice(afterFirst: LiveVoiceOptions['getAccess'] = async () => ROOM_ACCESS) {
  const getAccess = vi.fn<LiveVoiceOptions['getAccess']>().mockResolvedValueOnce(ROOM_ACCESS).mockImplementation(afterFirst);
  voice = await startLiveVoice({ getAccess });
  getAccess.mockClear();
  return { room: rooms.at(-1)!, getAccess };
}

function stubMicrophone() {
  const captured = { stop: vi.fn() };
  const getUserMedia = vi.fn(async () => ({ getAudioTracks: () => [captured] }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return { captured, getUserMedia };
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
  vi.unstubAllGlobals();
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

  it('keeps the help on the view once a turn may be about safety, whatever the voice does', async () => {
    const { room } = await openVoice();
    expect(voice.getView().showsSafetyHelp).toBe(false);

    fromAgent(room, { type: 'safetyHelp' });
    fromAgent(room, { type: 'thinking', isThinking: true });

    expect(voice.getView().showsSafetyHelp).toBe(true);
  });

  it('starts with no reason, so an open room does not read as closed', async () => {
    await openVoice();

    expect(voice.getView().closedBecause).toBeNull();
  });

  it('turns the microphone off and will not turn it back on, so no voice goes to a room with no tutor', async () => {
    const { getUserMedia } = stubMicrophone();
    const { room } = await openVoice();
    await voice.toggleMic();
    expect(voice.getView().mic).toBe('on');

    fromAgent(room, { type: 'tutorClosed', reason: 'broken' });
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.getView().mic).toBe('off');
    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledTimes(1);

    await voice.toggleMic();
    expect(voice.getView().mic).toBe('off');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
  });

  it('does not rejoin when the link goes quiet, because a new join would call in and pay for another tutor', async () => {
    const { room, getAccess } = await openVoice();
    fromAgent(room, { type: 'pulse' });

    fromAgent(room, { type: 'tutorClosed', reason: 'dailyLimit' });
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).not.toHaveBeenCalled();
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(voice.getView().phase).not.toBe('reconnecting');
  });

  it('does not rejoin when the room drops the student', async () => {
    const { room, getAccess } = await openVoice();

    fromAgent(room, { type: 'tutorClosed', reason: 'dailyLimit' });
    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).not.toHaveBeenCalled();
    expect(voice.getView().phase).toBe('ended');
  });
});

describe('joining a room', () => {
  it('asks for the room beside setting up the audio, so neither waits for the other', async () => {
    const { createTutorAudioContext } = await import('./tutorAudio');
    let audioIsOpen = false;
    let askedBeforeAudioOpened = false;
    vi.mocked(createTutorAudioContext).mockImplementationOnce(() => {
      askedBeforeAudioOpened = !audioIsOpen;
      audioIsOpen = true;
      return Promise.resolve(makeFakeAudioContext() as unknown as AudioContext);
    });
    const getAccess = vi.fn(async () => ROOM_ACCESS);
    voice = await startLiveVoice({ getAccess });
    expect(askedBeforeAudioOpened).toBe(true);
    expect(getAccess).toHaveBeenCalledTimes(1);
  });

  it('closes its audio and starts nothing when there is no room to join', async () => {
    voice = await startLiveVoice({ getAccess: async () => ROOM_ACCESS });
    await expect(startLiveVoice({ getAccess: async () => null })).rejects.toThrow('no room to join');
    expect(rooms.at(-1)?.connect).not.toHaveBeenCalled();
  });
});

describe('a room that opens with no press', () => {
  it('touches no microphone until the student presses Talk, while the tutor speaks', async () => {
    const { getUserMedia } = stubMicrophone();
    const { room } = await openVoice();

    room.emit('TrackSubscribed', { kind: 'audio' });
    fromAgent(room, { type: 'pulse' });
    fromAgent(room, { type: 'turnStarted', turnId: 'turn-a-1' });
    await vi.advanceTimersByTimeAsync(5000);

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
    expect(voice.getView().mic).toBe('off');

    await voice.toggleMic();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe('a tutor that has not spoken yet', () => {
  it('counts as started from its first turn, and stays started', async () => {
    const { room } = await openVoice();
    expect(voice.getView().hasTutorStarted).toBe(false);
    fromAgent(room, { type: 'turnStarted', turnId: 'turn-a-1' });
    expect(voice.getView().hasTutorStarted).toBe(true);
    fromAgent(room, { type: 'stop', turnId: 'turn-a-1' });
    expect(voice.getView().hasTutorStarted).toBe(true);
  });
});

describe('the first pulses of a room', () => {
  const getPulses = (room: InstanceType<typeof FakeRoom>) => getSentMessages(room).filter((message) => message.type === 'pulse') as unknown as { hearsAgent: boolean }[];

  it('do not read as a lost link while a tutor track is here and no agent pulse has come yet, so the greeting is not cut', async () => {
    const { room } = await openVoice();

    room.emit('TrackSubscribed', { kind: 'audio' });
    await vi.advanceTimersByTimeAsync(600);

    expect(getPulses(room).length).toBeGreaterThan(0);
    expect(getPulses(room).every((pulse) => pulse.hearsAgent)).toBe(true);
  });

  it('do say the link is lost once an agent that was heard goes quiet', async () => {
    const { room } = await openVoice();
    room.emit('TrackSubscribed', { kind: 'audio' });
    fromAgent(room, { type: 'pulse' });

    await vi.advanceTimersByTimeAsync(2000);

    expect(getPulses(room).at(-1)?.hearsAgent).toBe(false);
  });
});

describe('rejoining after a drop', () => {
  it('joins again with the new access', async () => {
    const { room } = await openVoice(async () => ({ ...ROOM_ACCESS, token: 'fresh-token' }));

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(0);

    expect(room.connect).toHaveBeenLastCalledWith(ROOM_ACCESS.url, 'fresh-token', expect.anything());
    fromAgent(room, { type: 'pulse' });
    expect(voice.getView().phase).toBe('live');
    expect(voice.getView().startedFresh).toBe(false);
  });

  it('says so when the room closed and the join landed in a new one, because that tutor holds nothing of what was said', async () => {
    const { room } = await openVoice(async () => ({ ...ROOM_ACCESS, roomName: 'session-a-session-new' }));
    fromAgent(room, { type: 'thinking', isThinking: true });

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(0);

    fromAgent(room, { type: 'pulse' });
    expect(voice.getView()).toMatchObject({ phase: 'live', startedFresh: true, isThinking: false });
  });

  it('says nothing of the kind when the student never heard the first tutor', async () => {
    const { room } = await openVoice(async () => ({ ...ROOM_ACCESS, roomName: 'session-a-session-new' }));

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(0);

    fromAgent(room, { type: 'pulse' });
    expect(voice.getView().startedFresh).toBe(false);
  });

  it('drops that line once the student has gone on', async () => {
    const { room } = await openVoice(async () => ({ ...ROOM_ACCESS, roomName: 'session-a-session-new' }));
    fromAgent(room, { type: 'pulse' });
    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(0);

    fromAgent(room, { type: 'studentWords', text: 'so what', isFinal: false });
    expect(voice.getView().startedFresh).toBe(true);
    fromAgent(room, { type: 'studentWords', text: 'so what now', isFinal: true });

    expect(voice.getView().startedFresh).toBe(false);
  });

  it('leaves the room at once with no access, with the microphone off, rather than retrying for two minutes', async () => {
    stubMicrophone();
    const { room, getAccess } = await openVoice(async () => null);
    await voice.toggleMic();
    expect(voice.getView().mic).toBe('on');

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(voice.getView()).toMatchObject({ phase: 'ended', mic: 'off', closedBecause: null, isThinking: false });
  });

  it('keeps trying through a failed request, which a later try can get past', async () => {
    const { room, getAccess } = await openVoice();
    getAccess.mockRejectedValueOnce(new Error('offline'));

    room.emit('Disconnected', DROPPED);
    await vi.advanceTimersByTimeAsync(QUIET_LONG_ENOUGH_TO_REJOIN_MS);

    expect(getAccess).toHaveBeenCalledTimes(2);
    fromAgent(room, { type: 'pulse' });
    expect(voice.getView().phase).toBe('live');
  });
});
