import { type BoardState, createSampleClock, createScenePlayer, createTimerClock, describeBoard, type FiredCue, type OutputLevel, rebuildBoard, type SampleClock, type ScenePlayer } from '@astra/board';
import probeWorkletUrl from '@astra/board/audio-probe-worklet.js?url';
import { type AgentMessage, type BrowserMessage, parseAgentMessage, parseSessionEvent, type SessionEvent } from '@astra/contracts';
import { type RemoteTrack, Room, RoomEvent, Track } from 'livekit-client';
import { createPcmRecorder, type PcmRecorder } from './pcmRecorder';
import pcmTapWorkletUrl from './pcm-tap-worklet.js?url';

const LIVE_TOPIC = 'astra.live';
const LAB_TOPIC = 'astra.lab';
const TICK_MS = 4;
const LOWERED_GAIN = 0.25;
const SAMPLE_RATE = 48000;
const RESUME_LIMIT_MS = 300;
const HELLO_EVERY_MS = 500;
const GAINS: Record<OutputLevel, number> = { full: 1, lowered: LOWERED_GAIN, silent: 0 };

export interface LabRecords {
  clockKind: 'samples' | 'timer';
  sampleRate: number;
  baseLatency: number;
  outputLatencyMs: number[];
  fired: (FiredCue & { firedEpochMs: number })[];
  drawn: { id: string; drawnAtMs: number; drawnEpochMs: number; paintedAtMs: number | null }[];
  agentMessages: { type: AgentMessage['type']; turnId: string; atMs: number; epochMs: number; firstWord?: number; beatId?: string; count?: number; gapAtMs?: number; gapMs?: number }[];
  browserMessages: { type: BrowserMessage['type']; atMs: number }[];
  stops: { turnId: string; receivedAtMs: number; receivedEpochMs: number; audioFrameAtStop: number }[];
  probe: { kind: string; atMs: number; where: 'arriving' | 'output' }[];
  frames: { atMs: number; ms: number }[];
  log: SessionEvent[];
  turnsSent: string[];
  refused: string[];
}

export interface LabSession {
  records: LabRecords;
  player: ScenePlayer;
  pcm: PcmRecorder | null;
  command(command: object): void;
  getBoardNow(): { board: BoardState; atMs: number };
  getReplayBoard(atMs: number): BoardState;
  describeLive(atMs: number): ReturnType<typeof describeBoard>;
  describeReplay(atMs: number): ReturnType<typeof describeBoard>;
  noteDrawn(id: string): void;
  close(): Promise<void>;
}

export interface LabSessionOptions {
  url: string;
  token: string;
  shouldRecordPcm: boolean;
  onAgentReady(): void;
  onLogChange(log: readonly SessionEvent[]): void;
}

function createRecords(clockKind: LabRecords['clockKind'], audioContext: AudioContext): LabRecords {
  return { clockKind, sampleRate: audioContext.sampleRate, baseLatency: audioContext.baseLatency, outputLatencyMs: [], fired: [], drawn: [], agentMessages: [], browserMessages: [], stops: [], probe: [], frames: [], log: [], turnsSent: [], refused: [] };
}

function noteAgentMessage(records: LabRecords, message: AgentMessage, atMs: number): void {
  const epochMs = performance.timeOrigin + performance.now();
  const { type, turnId } = message;
  if (message.type === 'words') records.agentMessages.push({ type, turnId, atMs, epochMs, beatId: message.beatId, firstWord: message.firstWord, count: message.words.length });
  else if (message.type === 'audioGap') records.agentMessages.push({ type, turnId, atMs, epochMs, gapAtMs: message.atMs, gapMs: message.ms });
  else records.agentMessages.push({ type, turnId, atMs, epochMs });
}

interface TutorAudio {
  audioContext: AudioContext;
  gain: GainNode;
  sampleClock: SampleClock;
  records: LabRecords;
  pcm: PcmRecorder | null;
}

function listenToTutor(track: RemoteTrack, { audioContext, gain, sampleClock, records, pcm }: TutorAudio): void {
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const arriving = new AudioWorkletNode(audioContext, 'audio-probe');
  const output = new AudioWorkletNode(audioContext, 'audio-probe');
  const toMs = (frame: number) => (frame / audioContext.sampleRate) * 1000;
  arriving.port.onmessage = ({ data }) => {
    const event = { kind: data.kind, atMs: toMs(data.frame) };
    sampleClock.onProbeEvent(event);
    if (data.kind === 'onset' || data.kind === 'end') records.probe.push({ ...event, where: 'arriving' });
  };
  output.port.onmessage = ({ data }) => {
    if (data.kind === 'onset' || data.kind === 'end') records.probe.push({ kind: data.kind, atMs: toMs(data.frame), where: 'output' });
  };
  source.connect(arriving);
  source.connect(gain);
  gain.connect(output);
  gain.connect(audioContext.destination);
  pcm?.tap('arriving', source);
  pcm?.tap('output', gain);
  // Chromium pulls remote audio only while the stream is attached to an element, and muting it leaves the gain as the one route out.
  const element = track.attach();
  element.muted = true;
  document.body.append(element);
}

async function createTutorAudioContext(shouldRecordPcm: boolean): Promise<AudioContext> {
  const audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: SAMPLE_RATE });
  await audioContext.audioWorklet.addModule(probeWorkletUrl);
  if (shouldRecordPcm) await audioContext.audioWorklet.addModule(pcmTapWorkletUrl);
  await Promise.race([audioContext.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_LIMIT_MS))]);
  return audioContext;
}

// Connects a real room to the real player: the tutor's audio goes through a probe that counts samples and a gain that a stop closes at once.
export async function startLabSession({ url, token, shouldRecordPcm, onAgentReady, onLogChange }: LabSessionOptions): Promise<LabSession> {
  const audioContext = await createTutorAudioContext(shouldRecordPcm);
  const canCount = audioContext.state === 'running';
  const getGraphTimeMs = () => audioContext.currentTime * 1000;
  const getOutputLatencyMs = () => (audioContext.outputLatency || 0) * 1000;
  const sampleClock = createSampleClock({ getGraphTimeMs, getOutputLatencyMs });
  const clock = canCount ? sampleClock : createTimerClock({ getNowMs: () => performance.now() });
  const records = createRecords(canCount ? 'samples' : 'timer', audioContext);
  const pcm = shouldRecordPcm ? createPcmRecorder(audioContext) : null;
  const gain = audioContext.createGain();
  const room = new Room({ adaptiveStream: false, dynacast: false });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let frameAtStop = 0;
  let helloTimer: ReturnType<typeof setInterval> | undefined;

  const publish = (topic: string, message: object) => room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic });
  const player = createScenePlayer({
    clock,
    send(message) {
      records.browserMessages.push({ type: message.type, atMs: clock.getNowMs() });
      void publish(LIVE_TOPIC, message);
    },
    setOutputLevel(level) {
      gain.gain.setValueAtTime(GAINS[level], audioContext.currentTime);
      if (level === 'silent') frameAtStop = Math.round(audioContext.currentTime * audioContext.sampleRate);
    },
    onCueFired: (cue) => records.fired.push({ ...cue, firedEpochMs: performance.timeOrigin + performance.now() }),
  });

  const onLabMessage = (labMessage: { type: string; event?: unknown; turnId?: string }) => {
    if (labMessage.type === 'turnAudioSent') records.turnsSent.push(labMessage.turnId ?? '');
    if (labMessage.type === 'agentReady') {
      clearInterval(helloTimer);
      onAgentReady();
    }
    if (labMessage.type === 'logEvent') {
      const parsed = parseSessionEvent(labMessage.event);
      if (parsed.ok) records.log.push(parsed.value);
      else records.refused.push(parsed.problem);
      onLogChange(records.log);
    }
  };

  const onLiveMessage = (value: unknown) => {
    const parsed = parseAgentMessage(value);
    if (!parsed.ok) {
      records.refused.push(parsed.problem);
      return;
    }
    const nowMs = clock.getNowMs();
    noteAgentMessage(records, parsed.value, nowMs);
    const isFirstStop = parsed.value.type === 'stop' && !records.stops.some((stop) => stop.turnId === parsed.value.turnId);
    player.receive(parsed.value);
    if (isFirstStop) records.stops.push({ turnId: parsed.value.turnId, receivedAtMs: nowMs, receivedEpochMs: performance.timeOrigin + performance.now(), audioFrameAtStop: frameAtStop });
  };

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== Track.Kind.Audio) return;
    listenToTutor(track, { audioContext, gain, sampleClock, records, pcm });
    helloTimer = setInterval(() => void publish(LAB_TOPIC, { type: 'hello' }), HELLO_EVERY_MS);
    void publish(LAB_TOPIC, { type: 'hello' });
  });
  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    const value: unknown = JSON.parse(decoder.decode(payload));
    if (topic === LAB_TOPIC) onLabMessage(value as { type: string; event?: unknown; turnId?: string });
    if (topic === LIVE_TOPIC) onLiveMessage(value);
  });

  await room.connect(url, token);
  const ticker = setInterval(player.tick, TICK_MS);
  const latencyWatcher = setInterval(() => records.outputLatencyMs.push(getOutputLatencyMs()), 1000);

  return {
    records,
    player,
    pcm,
    command: (command) => void publish(LAB_TOPIC, command),
    getBoardNow: player.getBoardNow,
    getReplayBoard: (atMs) => rebuildBoard(records.log, atMs),
    describeLive: (atMs) => describeBoard(player.getBoard(atMs), atMs),
    describeReplay: (atMs) => describeBoard(rebuildBoard(records.log, atMs), atMs),
    noteDrawn(id) {
      const drawnAtMs = clock.getNowMs();
      const entry: LabRecords['drawn'][number] = { id, drawnAtMs, drawnEpochMs: performance.timeOrigin + performance.now(), paintedAtMs: null };
      records.drawn.push(entry);
      requestAnimationFrame(() => {
        entry.paintedAtMs = clock.getNowMs();
      });
    },
    async close() {
      clearInterval(ticker);
      clearInterval(latencyWatcher);
      clearInterval(helloTimer);
      await room.disconnect();
      await audioContext.close();
    },
  };
}
