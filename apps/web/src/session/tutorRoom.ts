import { createChoosingClock, createScenePlayer, type BoardState, type OutputLevel } from '@astra/board';
import probeWorkletUrl from '@astra/board/audio-probe-worklet.js?url';
import { parseAgentMessage } from '@astra/contracts';
import { type RemoteTrack, Room, RoomEvent, Track } from 'livekit-client';

const LIVE_TOPIC = 'astra.live';
const TICK_MS = 4;
const PULSE_EVERY_MS = 500;
const LOWERED_GAIN = 0.25;
const SAMPLE_RATE = 48000;
const RESUME_LIMIT_MS = 300;
const GAINS: Record<OutputLevel, number> = { full: 1, lowered: LOWERED_GAIN, silent: 0 };

export interface TutorRoom {
  getBoardNow(): { board: BoardState; atMs: number };
  getCaption(): string;
  /** The tutor is speaking, or working on a reply, so the dot is moving. */
  getIsActive(): boolean;
  getIsAudioRunning(): boolean;
  startAudio(): Promise<void>;
  sendTyped(text: string): void;
  close(): Promise<void>;
}

export interface TutorRoomOptions {
  url: string;
  token: string;
  onTutorHere(): void;
  /** A development bench listens here, so a proof can read the page's timings and sound. */
  bench?: { note(name: string): void; onAudioReady(audioContext: AudioContext, gain: GainNode): Promise<void> };
}

function listenToTutor(track: RemoteTrack, audioContext: AudioContext, gain: GainNode, onProbe: (kind: string, atMs: number) => void): void {
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const probe = new AudioWorkletNode(audioContext, 'audio-probe');
  probe.port.onmessage = ({ data }: MessageEvent<{ kind: string; frame: number }>) => onProbe(data.kind, (data.frame / audioContext.sampleRate) * 1000);
  source.connect(probe);
  source.connect(gain);
  gain.connect(audioContext.destination);
  // Chromium pulls remote audio only while the stream is attached to an element, and muting it leaves the gain as the one route out.
  const element = track.attach();
  element.muted = true;
  document.body.append(element);
}

async function createTutorAudioContext(): Promise<AudioContext> {
  const audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: SAMPLE_RATE });
  await audioContext.audioWorklet.addModule(probeWorkletUrl);
  await Promise.race([audioContext.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_LIMIT_MS))]);
  return audioContext;
}

// Connects a session's room to the board's player: the tutor's audio goes through a probe that counts samples, and through a gain a stop closes at once.
export async function joinTutorRoom({ url, token, onTutorHere, bench }: TutorRoomOptions): Promise<TutorRoom> {
  const audioContext = await createTutorAudioContext();
  const clock = createChoosingClock({ getIsAudioRunning: () => audioContext.state === 'running', getGraphTimeMs: () => audioContext.currentTime * 1000, getOutputLatencyMs: () => (audioContext.outputLatency || 0) * 1000, getWallMs: () => performance.now() });
  const clockId = crypto.randomUUID();
  const gain = audioContext.createGain();
  await bench?.onAudioReady(audioContext, gain);
  const room = new Room({ adaptiveStream: false, dynacast: false });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let isSounding = false;
  let isThinking = false;
  let isTutorHere = false;

  const publish = (message: object, isReliable = true) => room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: isReliable, topic: LIVE_TOPIC });
  const getStamp = () => ({ clockId, browserMs: Math.round(clock.getNowMs()), startedMsAgo: 0 });
  const player = createScenePlayer({
    clock,
    clockId,
    send: (message) => void publish(message),
    setOutputLevel: (level) => gain.gain.setValueAtTime(GAINS[level], audioContext.currentTime),
    onCueFired: () => bench?.note('cueFired'),
  });

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== Track.Kind.Audio) return;
    listenToTutor(track, audioContext, gain, (kind, atMs) => {
      clock.onProbeEvent({ kind, atMs } as Parameters<typeof clock.onProbeEvent>[0]);
      if (kind === 'onset') {
        isSounding = true;
        bench?.note('audioOnset');
      }
      if (kind === 'end') isSounding = false;
    });
    if (!isTutorHere) onTutorHere();
    isTutorHere = true;
  });
  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    if (topic !== LIVE_TOPIC) return;
    const parsed = parseAgentMessage(JSON.parse(decoder.decode(payload)));
    if (!parsed.ok) return;
    const message = parsed.value;
    if (message.type === 'thinking') isThinking = message.isThinking;
    else if (message.type !== 'pulse' && message.type !== 'heard' && message.type !== 'studentWords') player.receive(message);
  });

  await room.connect(url, token);
  const ticker = setInterval(player.tick, TICK_MS);
  const pulse = setInterval(() => void publish({ type: 'pulse', hearsAgent: isTutorHere, ...getStamp() }, false), PULSE_EVERY_MS);

  return {
    getBoardNow() {
      const atMs = clock.getNowMs();
      return { board: player.getBoard(atMs), atMs };
    },
    getCaption: player.getCaption,
    getIsActive: () => isSounding || isThinking,
    getIsAudioRunning: () => audioContext.state === 'running',
    startAudio: () => audioContext.resume(),
    sendTyped(text) {
      isThinking = true;
      bench?.note('typedSent');
      void publish({ type: 'typed', text, ...getStamp() });
    },
    async close() {
      clearInterval(ticker);
      clearInterval(pulse);
      await room.disconnect();
      await audioContext.close();
    },
  };
}
