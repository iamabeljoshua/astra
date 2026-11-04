import { type BoardState, createChoosingClock, createScenePlayer, describeBoard, type FiredCue, rebuildBoard, type ScenePlayer } from '@astra/board';
import { type AgentMessage, type BrowserMessage, parseAgentMessage, parseSessionEvent, type SessionEvent } from '@astra/contracts';
import { type RemoteTrack, Room, RoomEvent, Track } from 'livekit-client';
import type { BoardProblem } from '../board/boardPainting';
import { createTutorAudioContext, listenToTutor, OUTPUT_GAINS } from '../voice/tutorAudio';
import { createPcmRecorder, type PcmRecorder } from './pcmRecorder';
import pcmTapWorkletUrl from './pcm-tap-worklet.js?url';

const LIVE_TOPIC = 'astra.live';
const LAB_TOPIC = 'astra.lab';
const TICK_MS = 4;
const HELLO_EVERY_MS = 500;

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
  boardProblems: BoardProblem[];
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
  return { clockKind, sampleRate: audioContext.sampleRate, baseLatency: audioContext.baseLatency, outputLatencyMs: [], fired: [], drawn: [], agentMessages: [], browserMessages: [], stops: [], probe: [], frames: [], log: [], turnsSent: [], refused: [], boardProblems: [] };
}

function noteAgentMessage(records: LabRecords, message: AgentMessage, atMs: number): void {
  if (!('turnId' in message)) return;
  const epochMs = performance.timeOrigin + performance.now();
  const { type, turnId } = message;
  if (message.type === 'words') records.agentMessages.push({ type, turnId, atMs, epochMs, beatId: message.beatId, firstWord: message.firstWord, count: message.words.length });
  else if (message.type === 'audioGap') records.agentMessages.push({ type, turnId, atMs, epochMs, gapAtMs: message.atMs, gapMs: message.ms });
  else records.agentMessages.push({ type, turnId, atMs, epochMs });
}

// Connects a real room to the real player: the tutor's audio goes through a probe that counts samples and a gain that a stop closes at once.
export async function startLabSession({ url, token, shouldRecordPcm, onAgentReady, onLogChange }: LabSessionOptions): Promise<LabSession> {
  const audioContext = await createTutorAudioContext(shouldRecordPcm ? [pcmTapWorkletUrl] : []);
  const getGraphTimeMs = () => audioContext.currentTime * 1000;
  const getOutputLatencyMs = () => (audioContext.outputLatency || 0) * 1000;
  const clock = createChoosingClock({ getIsAudioRunning: () => audioContext.state === 'running', getGraphTimeMs, getOutputLatencyMs, getWallMs: () => performance.now() });
  const records = createRecords(clock.getKind(), audioContext);
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
    clockId: crypto.randomUUID(),
    send(message) {
      records.browserMessages.push({ type: message.type, atMs: clock.getNowMs() });
      void publish(LIVE_TOPIC, message);
    },
    setOutputLevel(level) {
      gain.gain.setValueAtTime(OUTPUT_GAINS[level], audioContext.currentTime);
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
    const message = parsed.value;
    noteAgentMessage(records, message, nowMs);
    if (message.type === 'turnStarted') records.clockKind = clock.getKind();
    const firstStopTurnId = message.type === 'stop' && !records.stops.some((stop) => stop.turnId === message.turnId) ? message.turnId : null;
    player.receive(message);
    if (firstStopTurnId) records.stops.push({ turnId: firstStopTurnId, receivedAtMs: nowMs, receivedEpochMs: performance.timeOrigin + performance.now(), audioFrameAtStop: frameAtStop });
  };

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== Track.Kind.Audio) return;
    listenToTutor(track, { audioContext, gain, clock, onProbe: (note) => records.probe.push(note), tapPcm: pcm ? (point, node) => pcm.tap(point, node) : undefined });
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
    getBoardNow: player.advanceToNow,
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
