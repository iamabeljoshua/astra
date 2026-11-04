import { type BoardState, createChoosingClock, createScenePlayer, type FiredCue, type OutputLevel, type ScenePlayer } from '@astra/board';
import { type AgentMessage, type BrowserMessage, parseAgentMessage } from '@astra/contracts';
import { createLocalAudioTrack, DisconnectReason, type LocalAudioTrack, type RemoteTrack, Room, RoomEvent, Track } from 'livekit-client';
import { createLocalYield } from './localYield';
import { createTutorAudioContext, listenToTutor, listenToStudent, OUTPUT_GAINS, type ProbeNote } from './tutorAudio';

export const LIVE_TOPIC = 'astra.live';
const LAB_TOPIC = 'astra.lab';
const TICK_MS = 4;
const PULSE_EVERY_MS = 500;
/** Pulses come every 500 ms, so this many missed is a drop and not a late packet. */
const AGENT_QUIET_LIMIT_MS = 1200;
const HEARD_SHOWS_MS = 700;
const LONGEST_REJOIN_MS = 120_000;
const REJOIN_EVERY_MS = 2000;
/** A room can say connected with a data channel that carries nothing after a drop, and only a new join clears that. */
const REJOIN_AFTER_QUIET_MS = 3000;
/** Join and dispatch took 3.8 s at p50 and 7.5 s at worst, so past this the tutor is not coming. */
const TUTOR_ARRIVES_WITHIN_MS = 25_000;

export type LivePhase = 'connecting' | 'live' | 'reconnecting' | 'noTutor' | 'ended';
export type MicState = 'off' | 'starting' | 'on' | 'denied';

export interface StudentLine {
  text: string;
  isFinal: boolean;
}

export interface LiveVoiceView {
  phase: LivePhase;
  mic: MicState;
  isSoundBlocked: boolean;
  /** Code knows the student finished, so the dot shows it before any voice can. */
  isHeard: boolean;
  isTutorSpeaking: boolean;
  studentLines: readonly StudentLine[];
  /** Words the student has heard this turn, and the ones already known that are still to come. */
  tutorHeard: readonly string[];
  tutorComing: readonly string[];
}

export interface RoomAccess {
  url: string;
  token: string;
}

/** What a proof reads and a real microphone test shows. Holds timings only, never words or audio. */
export interface LiveVoiceRecords {
  firstAudioEpochMs: Record<string, number>;
  turnStartedEpochMs: Record<string, number>;
  stopEpochMs: Record<string, number>;
  heardEpochMs: number[];
  yieldEpochMs: { turnId: string; isYielding: boolean; atMs: number }[];
  localYieldEpochMs: number[];
  probe: (ProbeNote & { epochMs: number })[];
  fired: (FiredCue & { firedEpochMs: number })[];
  refused: string[];
  clockKinds: string[];
}

export interface LiveVoice {
  getView(): LiveVoiceView;
  subscribe(listener: () => void): () => void;
  getBoardNow(): { board: BoardState; atMs: number };
  sendTyped(text: string): void;
  setMicOn(isOn: boolean): Promise<void>;
  turnOnSound(): Promise<void>;
  mark(note: object): void;
  noteDrawn(id: string): void;
  close(): Promise<void>;
  records: LiveVoiceRecords;
  player: ScenePlayer;
}

export interface LiveVoiceOptions {
  getAccess(): Promise<RoomAccess>;
  /** False when the student opened the room by typing, because a greeting would talk over the reply. */
  wantsGreeting?: boolean;
  /** The browser's own speech cleanup. Only a microphone test turns it off. */
  usesSpeechCleanup?: boolean;
}

const getEpochMs = () => performance.timeOrigin + performance.now();

/** Muse gives no final with no frames, so silence is sent too. */
const MIC_PUBLISH_OPTIONS = { source: Track.Source.Microphone, dtx: false, red: false };

function createRecords(): LiveVoiceRecords {
  return { firstAudioEpochMs: {}, turnStartedEpochMs: {}, stopEpochMs: {}, heardEpochMs: [], yieldEpochMs: [], localYieldEpochMs: [], probe: [], fired: [], refused: [], clockKinds: [] };
}

// Connects the session to its room, plays what the agent sends against what the student hears, and sends back what played. It knows nothing of React.
export async function startLiveVoice({ getAccess, wantsGreeting = true, usesSpeechCleanup = true }: LiveVoiceOptions): Promise<LiveVoice> {
  const audioContext = await createTutorAudioContext();
  const clock = createChoosingClock({ getIsAudioRunning: () => audioContext.state === 'running', getGraphTimeMs: () => audioContext.currentTime * 1000, getOutputLatencyMs: () => (audioContext.outputLatency || 0) * 1000, getWallMs: () => performance.now() });
  const clockId = crypto.randomUUID();
  const records = createRecords();
  const gain = audioContext.createGain();
  const room = new Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const listeners = new Set<() => void>();
  const outbox: BrowserMessage[] = [];
  let view: LiveVoiceView = { phase: 'connecting', mic: 'off', isSoundBlocked: audioContext.state !== 'running', isHeard: false, isTutorSpeaking: false, studentLines: [], tutorHeard: [], tutorComing: [] };
  let lastAgentPulseEpochMs: number | null = null;
  let isClosed = false;
  let hasHeardFirstOnset = false;
  let currentTurnId: string | null = null;
  let heardTimer: ReturnType<typeof setTimeout> | undefined;
  let stopListening = () => {};
  let micTrack: LocalAudioTrack | null = null;
  let stopWatchingMic = () => {};
  let isRejoining = false;
  let hasSaidHello = false;
  let connectedAtEpochMs = getEpochMs();

  const setView = (changes: Partial<LiveVoiceView>) => {
    view = { ...view, ...changes };
    listeners.forEach((listener) => listener());
  };

  const hearsAgent = () => lastAgentPulseEpochMs !== null && getEpochMs() - lastAgentPulseEpochMs <= AGENT_QUIET_LIMIT_MS;

  // A report sent while the link is down would be lost, and the agent resumes from it, so it waits here until the agent can be heard again. A typed line waits here too if the agent has not joined yet.
  const send = (message: BrowserMessage) => {
    if (room.state !== 'connected' || !hearsAgent()) {
      outbox.push(message);
      return;
    }
    void room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: LIVE_TOPIC }).catch(() => outbox.push(message));
  };

  const flushOutbox = () => {
    for (const message of outbox.splice(0)) send(message);
  };

  const getStamp = () => ({ clockId, browserMs: Math.round(clock.getNowMs()), startedMsAgo: 0 });

  const setGain = (level: OutputLevel) => gain.gain.setValueAtTime(OUTPUT_GAINS[level], audioContext.currentTime);
  const localYield = createLocalYield({ setLevel: setGain, onYield: () => records.localYieldEpochMs.push(getEpochMs()) });

  const player = createScenePlayer({
    clock,
    clockId,
    send,
    setOutputLevel(level) {
      setGain(level);
      localYield.noteLevel(level);
    },
    onCueFired: (cue) => records.fired.push({ ...cue, firedEpochMs: getEpochMs() }),
  });

  const showHeard = () => {
    records.heardEpochMs.push(getEpochMs());
    setView({ isHeard: true });
    clearTimeout(heardTimer);
    heardTimer = setTimeout(() => setView({ isHeard: false }), HEARD_SHOWS_MS);
  };

  const addStudentWords = ({ text, isFinal }: StudentLine) => {
    const lines = view.studentLines.at(-1)?.isFinal === false ? view.studentLines.slice(0, -1) : view.studentLines;
    setView({ studentLines: [...lines, { text, isFinal }] });
  };

  const onAgentMessage = (message: AgentMessage) => {
    if (message.type === 'pulse') {
      lastAgentPulseEpochMs = getEpochMs();
      flushOutbox();
      return;
    }
    if (message.type === 'heard') return showHeard();
    if (message.type === 'studentWords') return addStudentWords(message);
    if (message.type === 'turnStarted') {
      records.turnStartedEpochMs[message.turnId] = getEpochMs();
      records.clockKinds.push(clock.getKind());
      currentTurnId = message.turnId;
      hasHeardFirstOnset = false;
    }
    if (message.type === 'yield') {
      records.yieldEpochMs.push({ turnId: message.turnId, isYielding: message.isYielding, atMs: getEpochMs() });
      localYield.noteAgentYield(message.isYielding);
    }
    if (message.type === 'stop') records.stopEpochMs[message.turnId] ??= getEpochMs();
    player.receive(message);
  };

  const onProbe = (note: ProbeNote) => {
    const epochMs = getEpochMs();
    records.probe.push({ ...note, epochMs });
    if (note.kind === 'onset' && note.where === 'arriving') {
      if (currentTurnId && !hasHeardFirstOnset) records.firstAudioEpochMs[currentTurnId] = epochMs;
      hasHeardFirstOnset = true;
    }
  };

  const readCaption = () => {
    const { heard, coming } = player.getCaptionWords();
    const isTutorSpeaking = heard.length + coming.length > 0 && coming.length > 0;
    const isSame = heard.length === view.tutorHeard.length && coming.length === view.tutorComing.length && isTutorSpeaking === view.isTutorSpeaking && heard.at(-1) === view.tutorHeard.at(-1);
    if (!isSame) setView({ tutorHeard: heard, tutorComing: coming, isTutorSpeaking });
  };

  const sendAudioState = () => {
    const isRunning = audioContext.state === 'running';
    setView({ isSoundBlocked: !isRunning });
    send({ type: 'audioState', ...getStamp(), isRunning });
  };
  audioContext.onstatechange = sendAudioState;

  const beat = () => {
    const nowMs = getEpochMs();
    const canHear = hearsAgent();
    if (!canHear && lastAgentPulseEpochMs !== null) player.freeze();
    if (room.state !== 'connected') return;
    const quietSinceMs = Math.max(lastAgentPulseEpochMs ?? nowMs, connectedAtEpochMs);
    if (lastAgentPulseEpochMs !== null && nowMs - quietSinceMs > REJOIN_AFTER_QUIET_MS) {
      void rejoin();
      return;
    }
    const message: BrowserMessage = { type: 'pulse', ...getStamp(), hearsAgent: canHear };
    void room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: false, topic: LIVE_TOPIC }).catch((error: unknown) => records.refused.push(`pulse not sent: ${String(error)}`));
  };

  const onDataReceived = (payload: Uint8Array, topic?: string) => {
    if (topic !== LIVE_TOPIC) return;
    let value: unknown;
    try {
      value = JSON.parse(decoder.decode(payload));
    } catch {
      records.refused.push('message: expected JSON');
      return;
    }
    const parsed = parseAgentMessage(value);
    if (parsed.ok) onAgentMessage(parsed.value);
    else records.refused.push(parsed.problem);
  };

  const connectRoom = async () => {
    const { url, token } = await getAccess();
    await room.connect(url, token);
  };

  // LiveKit retries a short drop itself. Once it gives up, or leaves a channel that carries nothing, a new token and a new join bring the same session back.
  async function rejoin(): Promise<void> {
    if (isRejoining) return;
    isRejoining = true;
    player.freeze();
    setView({ phase: 'reconnecting' });
    await room.disconnect(false).catch(() => {});
    const deadline = getEpochMs() + LONGEST_REJOIN_MS;
    while (!isClosed && getEpochMs() < deadline) {
      try {
        await connectRoom();
        if (micTrack) await room.localParticipant.publishTrack(micTrack, MIC_PUBLISH_OPTIONS);
        connectedAtEpochMs = getEpochMs();
        isRejoining = false;
        setView({ phase: 'live' });
        return;
      } catch {
        await room.disconnect(false).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, REJOIN_EVERY_MS));
      }
    }
    isRejoining = false;
    if (!isClosed) setView({ phase: 'ended' });
  }

  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return;
    stopListening();
    stopListening = listenToTutor(track, { audioContext, gain, clock, onProbe });
    clearTimeout(tutorWait);
    setView({ phase: 'live' });
    // The agent puts its track up last, so hearing it means the agent can hear this page.
    lastAgentPulseEpochMs = getEpochMs();
    send({ type: 'hello', ...getStamp(), wantsGreeting: wantsGreeting && !hasSaidHello });
    hasSaidHello = true;
    sendAudioState();
    flushOutbox();
    beat();
  });
  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => onDataReceived(payload, topic));
  room.on(RoomEvent.Reconnecting, () => {
    player.freeze();
    setView({ phase: 'reconnecting' });
  });
  room.on(RoomEvent.Reconnected, () => {
    connectedAtEpochMs = getEpochMs();
    setView({ phase: 'live' });
  });
  room.on(RoomEvent.Disconnected, (reason) => {
    if (isRejoining) return;
    player.freeze();
    const isFinal = isClosed || reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.DUPLICATE_IDENTITY || reason === DisconnectReason.ROOM_DELETED;
    setView({ phase: isFinal ? 'ended' : 'reconnecting' });
    if (!isFinal) void rejoin();
  });

  const tutorWait = setTimeout(() => setView({ phase: 'noTutor' }), TUTOR_ARRIVES_WITHIN_MS);
  try {
    await connectRoom();
  } catch (problem) {
    clearTimeout(tutorWait);
    await audioContext.close();
    throw problem;
  }
  const ticker = setInterval(() => {
    player.tick();
    readCaption();
  }, TICK_MS);
  const pulses = setInterval(beat, PULSE_EVERY_MS);

  return {
    records,
    player,
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getBoardNow() {
      const atMs = clock.getNowMs();
      return { board: player.getBoard(atMs), atMs };
    },
    sendTyped(text) {
      showHeard();
      addStudentWords({ text, isFinal: true });
      send({ type: 'typed', ...getStamp(), text });
    },
    async setMicOn(isOn) {
      if (!isOn) {
        stopWatchingMic();
        if (micTrack) await room.localParticipant.unpublishTrack(micTrack);
        micTrack?.stop();
        micTrack = null;
        return setView({ mic: 'off' });
      }
      setView({ mic: 'starting' });
      try {
        micTrack = await createLocalAudioTrack({ echoCancellation: usesSpeechCleanup, noiseSuppression: usesSpeechCleanup, autoGainControl: usesSpeechCleanup });
        await room.localParticipant.publishTrack(micTrack, MIC_PUBLISH_OPTIONS);
        stopWatchingMic = listenToStudent(micTrack.mediaStreamTrack, { audioContext, onSound: localYield.onStudentSound });
        setView({ mic: 'on' });
      } catch {
        setView({ mic: 'denied' });
      }
    },
    async turnOnSound() {
      await audioContext.resume();
    },
    mark(note) {
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(note)), { reliable: true, topic: LAB_TOPIC }).catch(() => {});
    },
    noteDrawn() {},
    async close() {
      isClosed = true;
      clearInterval(ticker);
      clearInterval(pulses);
      clearTimeout(heardTimer);
      clearTimeout(tutorWait);
      localYield.close();
      stopWatchingMic();
      micTrack?.stop();
      stopListening();
      await room.disconnect();
      await audioContext.close();
    },
  };
}
