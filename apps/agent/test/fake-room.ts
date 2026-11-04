import { EventEmitter } from 'node:events';
import { RoomEvent } from '@livekit/rtc-node';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FRAME_DELAY_MS = 4;

interface Sent {
  topic: string;
  message: { type?: string; beatId?: string; [field: string]: unknown };
}

export class FakeRoom extends EventEmitter {
  static last: FakeRoom;
  sent: Sent[] = [];
  isConnected = false;
  localParticipant = {
    publishData: async (bytes: Uint8Array, { topic }: { topic: string }) => {
      this.sent.push({ topic, message: JSON.parse(decoder.decode(bytes)) as Sent['message'] });
    },
    publishTrack: async () => ({}),
  };
  remoteParticipants = new Map<string, { sid: string; identity: string }>();

  constructor() {
    super();
    FakeRoom.last = this;
  }

  async connect() {
    this.isConnected = true;
  }

  async disconnect() {
    this.isConnected = false;
  }

  join(sid: string, identity = 'student-1') {
    const participant = { sid, identity };
    this.remoteParticipants.set(identity, participant);
    this.emit(RoomEvent.ParticipantConnected, participant);
  }

  leave(sid: string, identity = 'student-1') {
    this.emit(RoomEvent.ParticipantDisconnected, { sid, identity });
  }

  sendRaw(topic: string, bytes: Uint8Array) {
    this.emit(RoomEvent.DataReceived, bytes, undefined, undefined, topic);
  }

  send(topic: string, message: unknown) {
    this.sendRaw(topic, encoder.encode(JSON.stringify(message)));
  }

  getClosedBeats() {
    return this.sent.filter(({ message }) => message.type === 'beatClosed').map(({ message }) => message.beatId);
  }
}

export class FakeAudioSource {
  sampleRate: number;
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }
  captureFrame = () => new Promise<void>((resolve) => setTimeout(resolve, FRAME_DELAY_MS));
  clearQueue() {}
  waitForPlayout = async () => {};
  close = async () => {};
}
