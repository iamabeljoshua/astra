import { type BoardState, createChoosingClock, createScenePlayer, type FiredCue, type OutputLevel, type ScenePlayer } from '@astra/board';
import { checkWorkOnBoard, cleanTypedLine, getNod } from '@astra/board/shared';
import { getKeptBoard, keepBoard } from './keptBoard.ts';
import { type AgentMessage, type BrowserMessage, clipTypedText, type components, type ElementId, type InkPoint, LINK_QUIET_LIMIT_MS, parseAgentMessage, PULSE_EVERY_MS, type SessionRecap, type StudentWork, type TutorClosedReason } from '@astra/contracts';
import { DisconnectReason, type RemoteTrack, Room, RoomEvent, Track } from 'livekit-client';
import heldMicWorkletUrl from './held-mic-worklet.js?url';
import { createLocalYield } from './localYield';
import { createMicrophone, type MicState } from './microphone';
import { type MicLine, openMicLine } from './micLine';
import { createTutorAudioContext, listenToTutor, listenToStudent, OUTPUT_GAINS, type ProbeNote, resumeAudio } from './tutorAudio';

export type { MicState };

export const LIVE_TOPIC = 'astra.live';
const LAB_TOPIC = 'astra.lab';
const TICK_MS = 4;
const HEARD_SHOWS_MS = 700;
const LONGEST_REJOIN_MS = 120_000;
const REJOIN_EVERY_MS = 2000;
/** A room can say connected with a data channel that carries nothing after a drop, and only a new join clears that. */
const REJOIN_AFTER_QUIET_MS = 3000;
const TUTOR_ARRIVES_WITHIN_MS = 25_000;
const INK_POINTS_IN_A_MESSAGE = 300;
const TYPING_NOTED_EVERY_MS = 400;
const LOUDNESS_WINDOW = 256;
const MIDDLE_SAMPLE = 128;
const LOUDEST_PEAK = 60;
/** A crashed job never comes back, and each join mints a token and keeps the room alive, so a page stops trying after this many with no pulse. */
const MOST_REJOINS_WITHOUT_TUTOR = 3;

export type LivePhase = 'connecting' | 'live' | 'reconnecting' | 'noTutor' | 'tutorLost' | 'closedForQuiet' | 'ended';

/** The page has left the room for good, and only opening a new one brings the tutor back. */
export const isVoiceOver = (phase: LivePhase) => phase === 'noTutor' || phase === 'tutorLost' || phase === 'closedForQuiet' || phase === 'ended';

export interface StudentLine {
  text: string;
  isFinal: boolean;
}

export interface LiveVoiceView {
  phase: LivePhase;
  mic: MicState;
  isSoundBlocked: boolean;
  /** The room has been quiet for most of its limit and closes soon unless something happens. */
  isQuietWarning: boolean;
  /** Code knows the student finished, so the dot shows it before any voice can. */
  isHeard: boolean;
  /** The tutor has no words yet, and the dot says why it is quiet. */
  isThinking: boolean;
  isTutorSpeaking: boolean;
  /** Why the tutor will not speak again in this room, or null while it can. */
  closedBecause: TutorClosedReason | null;
  firstWord: string | null;
  isStopped: boolean;
  typingNoteCount: number;
  costUsd: number | null;
  /** This page's room closed and it joined a new one, so the tutor now holds nothing of what was said. */
  startedFresh: boolean;
  /** The tutor has begun its first turn in this page, so the wait for it is over. */
  hasTutorStarted: boolean;
  studentLines: readonly StudentLine[];
  /** Words the student has heard this turn, and the ones already known that are still to come. */
  tutorHeard: readonly string[];
  tutorComing: readonly string[];
  /** What the session's end says, once the tutor has decided. */
  recap: SessionRecap | null;
  /** The tutor has said whether there is a recap. */
  isRecapDecided: boolean;
}

export type RoomAccess = NonNullable<components['schemas']['LiveRoomResponseDto']['access']>;

export interface LiveVoiceRecords {
  firstAudioEpochMs: Record<string, number>;
  turnStartedEpochMs: Record<string, number>;
  stopEpochMs: Record<string, number>;
  heardEpochMs: number[];
  yieldEpochMs: { turnId: string; isYielding: boolean; atMs: number }[];
  localYieldEpochMs: number[];
  earsOpenEpochMs: number[];
  replayedTurns: string[];
  probe: (ProbeNote & { epochMs: number })[];
  fired: (FiredCue & { firedEpochMs: number })[];
  refused: string[];
  clockKinds: string[];
}

export interface LiveVoice {
  getView(): LiveVoiceView;
  subscribe(listener: () => void): () => void;
  getBoardNow(): { board: BoardState; atMs: number };
  /** `isOpening` marks a line this page sends to start the tutor, which the student did not type. */
  sendTyped(text: string, isOpening?: boolean): void;
  /** Whether the tutor can be reached to give a recap, asking nothing yet. */
  canAskForRecap(): boolean;
  /** Asks the tutor for its recap, which also ends its teaching, and says whether the ask could be sent. */
  askForRecap(): boolean;
  /** The board could not draw this mark, so the agent can tell the tutor the student did not see it. */
  reportMarkNotDrawn(markId: string): void;
  sendWork(work: StudentWork, startedMsAgo?: number): void;
  sendInkStroke(id: ElementId, points: readonly InkPoint[]): void;
  sendInkPeek(strokes: readonly ElementId[]): void;
  sendInkDone(id: ElementId, strokes: readonly ElementId[], task: ElementId | null): void;
  noteTyping(): void;
  movePoint(task: ElementId, x: number): void;
  sendPause(seconds: number, draft?: string): void;
  stopTutor(): void;
  getLoudness(): number;
  toggleMic(): Promise<void>;
  /** Answers a quiet warning, so the room stays open. */
  sayStillHere(): void;
  turnOnSound(): Promise<void>;
  mark(note: object): void;
  close(): Promise<void>;
  records: LiveVoiceRecords;
  player: ScenePlayer;
}

export interface LiveVoiceOptions {
  /** Null means there is no room to join, and the caller knows why. */
  getAccess(): Promise<RoomAccess | null>;
  /** False when the student opened the room by typing, because a greeting would talk over the reply. */
  wantsGreeting?: boolean;
  /** The browser's own speech cleanup. Only a microphone test turns it off. */
  usesSpeechCleanup?: boolean;
}

const getEpochMs = () => performance.timeOrigin + performance.now();

/** Muse gives no final with no frames, so silence is sent too. */
const MIC_PUBLISH_OPTIONS = { source: Track.Source.Microphone, dtx: false, red: false };

function createRecords(): LiveVoiceRecords {
  return { firstAudioEpochMs: {}, turnStartedEpochMs: {}, stopEpochMs: {}, heardEpochMs: [], yieldEpochMs: [], localYieldEpochMs: [], earsOpenEpochMs: [], replayedTurns: [], probe: [], fired: [], refused: [], clockKinds: [] };
}

// Connects the session to its room, plays what the agent sends against what the student hears, and sends back what played. It knows nothing of React.
export async function startLiveVoice({ getAccess, wantsGreeting = true, usesSpeechCleanup = true }: LiveVoiceOptions): Promise<LiveVoice> {
  // Setting up the audio took 90 to 480 ms under load, and the room's answer does not depend on it, so neither waits for the other.
  const firstAccess = getAccess();
  firstAccess.catch(() => {});
  const audioContext = await createTutorAudioContext([heldMicWorkletUrl]);
  const clock = createChoosingClock({ getIsAudioRunning: () => audioContext.state === 'running', getGraphTimeMs: () => audioContext.currentTime * 1000, getOutputLatencyMs: () => (audioContext.outputLatency || 0) * 1000, getWallMs: () => performance.now() });
  const clockId = crypto.randomUUID();
  const records = createRecords();
  const gain = audioContext.createGain();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = LOUDNESS_WINDOW;
  gain.connect(analyser);
  const loudnessSamples = new Uint8Array(LOUDNESS_WINDOW);
  const room = new Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const listeners = new Set<() => void>();
  const outbox: BrowserMessage[] = [];
  let typingNotedAtMs = -Infinity;
  let view: LiveVoiceView = { phase: 'connecting', mic: 'off', isSoundBlocked: audioContext.state !== 'running', isQuietWarning: false, isThinking: false, isHeard: false, isTutorSpeaking: false, closedBecause: null, firstWord: null, isStopped: false, typingNoteCount: 0, costUsd: null, startedFresh: false, hasTutorStarted: false, studentLines: [], tutorHeard: [], tutorComing: [], recap: null, isRecapDecided: false };
  let lastAgentPulseEpochMs: number | null = null;
  let isClosed = false;
  let hasHeardFirstOnset = false;
  let currentTurnId: string | null = null;
  let heardTimer: ReturnType<typeof setTimeout> | undefined;
  let stopListening = () => {};
  let isRejoining = false;
  let hasLeftRoom = false;
  let hasTutorTrack = false;
  let hasHeardTutor = false;
  let isPublishOwed = false;
  let rejoinsSincePulse = 0;
  let hasSaidHello = false;
  let roomName: string | null = null;
  let connectedAtEpochMs = getEpochMs();

  const setView = (changes: Partial<LiveVoiceView>) => {
    view = { ...view, ...changes };
    listeners.forEach((listener) => listener());
  };

  const hearsAgent = () => lastAgentPulseEpochMs !== null && getEpochMs() - lastAgentPulseEpochMs <= LINK_QUIET_LIMIT_MS;

  // Before the first pulse a tutor's track is what says the agent is listening. Pulses come on the lossy channel, and waiting for one held hello for up to 4.9 s.
  const canReachAgent = () => hearsAgent() || (lastAgentPulseEpochMs === null && hasTutorTrack);

  // A report sent while the link is down would be lost, and the agent resumes from it, so it waits here until the agent can be heard again. A typed line waits here too if the agent has not joined yet.
  const send = (message: BrowserMessage) => {
    if (room.state !== 'connected' || !canReachAgent()) {
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
    setView({ studentLines: [...lines, { text, isFinal }], startedFresh: view.startedFresh && !isFinal });
  };

  // No tutor will answer again, so a microphone left on would send a student's voice to an empty room.
  const closeTutor = (closedBecause: TutorClosedReason) => {
    setView({ closedBecause, isThinking: false, isHeard: false });
    void mic.setOn(false);
  };

  const onWorkRead = (work: StudentWork) => {
    const nowMs = clock.getNowMs();
    const checked = checkWorkOnBoard(work, player.getBoard(nowMs));
    player.addStudentOperations([{ kind: 'worked', atMs: nowMs, action: { action: 'worked', work, ...checked } }]);
    setView({ firstWord: getNod(work, checked) });
  };

  const onAgentMessage = (message: AgentMessage) => {
    // Only the job's own words say a tutor is here, because a crashed job's track outlives it.
    hasHeardTutor = true;
    clearTimeout(tutorWait);
    if (view.phase === 'connecting') setView({ phase: 'live' });
    if (message.type === 'tutorClosed') return closeTutor(message.reason);
    if (message.type === 'workRead') return onWorkRead(message.work);
    if (message.type === 'pulse') {
      lastAgentPulseEpochMs = getEpochMs();
      rejoinsSincePulse = 0;
      if (view.phase === 'reconnecting') setView({ phase: 'live' });
      flushOutbox();
      return;
    }
    if (message.type === 'earsOpen') {
      records.earsOpenEpochMs.push(getEpochMs());
      mic.getLine()?.release();
      return;
    }
    if (message.type === 'quietWarning') return setView({ isQuietWarning: message.isOn });
    if (message.type === 'closingForQuiet') return leaveRoom('closedForQuiet');
    if (message.type === 'recap') return setView({ recap: message.recap, isRecapDecided: true, isThinking: false });
    if (message.type === 'heard') return showHeard();
    if (message.type === 'thinking') return setView({ isThinking: message.isThinking });
    if (message.type === 'costSoFar') return setView({ costUsd: message.usd });
    if (message.type === 'studentWords') return addStudentWords(message);
    if (message.type === 'turnStarted' && message.turnId in records.turnStartedEpochMs) {
      records.replayedTurns.push(message.turnId);
    } else if (message.type === 'turnStarted') {
      setView({ firstWord: null, isStopped: false });
      records.turnStartedEpochMs[message.turnId] = getEpochMs();
      if (!view.hasTutorStarted) setView({ hasTutorStarted: true });
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

  const leaveRoom = (phase: LivePhase) => {
    hasLeftRoom = true;
    clearTimeout(tutorWait);
    player.freeze();
    setView({ phase, isQuietWarning: false, isThinking: false });
    void mic.setOn(false);
    void room.disconnect();
  };

  const beat = () => {
    if (hasLeftRoom || isRejoining) return;
    const nowMs = getEpochMs();
    const canHear = hearsAgent();
    if (!canHear && lastAgentPulseEpochMs !== null) player.freeze();
    if (room.state !== 'connected') return;
    const quietSinceMs = Math.max(lastAgentPulseEpochMs ?? nowMs, connectedAtEpochMs);
    if (lastAgentPulseEpochMs !== null && nowMs - quietSinceMs > REJOIN_AFTER_QUIET_MS) {
      if (rejoinsSincePulse >= MOST_REJOINS_WITHOUT_TUTOR) leaveRoom('tutorLost');
      else void rejoin();
      return;
    }
    // A link can only be lost once it has been heard, or the first beat would read as lost and cut the greeting.
    const message: BrowserMessage = { type: 'pulse', ...getStamp(), hearsAgent: lastAgentPulseEpochMs === null || canHear };
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

  const connectRoom = async (asked = getAccess()): Promise<boolean> => {
    const access = await asked;
    if (!access) return false;
    if (!hasLeftRoom) await room.connect(access.url, access.token);
    // Each room has its own job, and a new job holds nothing of what was said, so the student hears that here and not from a tutor who has forgotten. A tutor they never heard has forgotten nothing.
    if (hasHeardTutor && roomName !== null && access.roomName !== roomName) setView({ startedFresh: true, isThinking: false });
    if (roomName === null) player.addStudentOperations(getKeptBoard(access.roomName));
    roomName = access.roomName;
    return true;
  };

  const showReconnecting = () => {
    if (view.phase !== 'connecting') setView({ phase: 'reconnecting' });
  };

  const publishMic = (line: MicLine) => room.localParticipant.publishTrack(line.track, MIC_PUBLISH_OPTIONS);

  const mic = createMicrophone<MicLine>({
    async capture() {
      await resumeAudio(audioContext);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: usesSpeechCleanup, noiseSuppression: usesSpeechCleanup, autoGainControl: usesSpeechCleanup } });
      const [captured] = stream.getAudioTracks();
      if (!captured) throw new DOMException('the browser gave no track', 'NotFoundError');
      const line = openMicLine(captured, audioContext);
      const stopWatching = listenToStudent(captured, { audioContext, onSound: localYield.onStudentSound });
      return {
        ...line,
        stop() {
          stopWatching();
          line.stop();
        },
      };
    },
    // During a rejoin the join publishes whatever line is open, so publishing here too would race it. During LiveKit's own retry there is no room to publish into, so it waits for the room to come back.
    async publish(line) {
      if (room.state === 'connected' && !isRejoining) await publishMic(line);
      else if (!isRejoining) isPublishOwed = true;
    },
    async unpublish(line) {
      if (room.state === 'connected') await room.localParticipant.unpublishTrack(line.track);
    },
    onState: (state) => setView({ mic: state }),
  });
  const onPageHide = () => {
    mic.stopAtOnce();
    if (roomName !== null) keepBoard(roomName, player.getOperations());
  };
  window.addEventListener('pagehide', onPageHide);

  // LiveKit retries a short drop itself. Once it gives up, or leaves a channel that carries nothing, a new token and a new join bring the same session back. A closed tutor gets no rejoin, because a new join would open a room and pay for another one.
  async function rejoin(): Promise<void> {
    if (isRejoining || hasLeftRoom || view.closedBecause) return;
    isRejoining = true;
    isPublishOwed = false;
    rejoinsSincePulse += 1;
    player.freeze();
    // A new join means a new track and maybe a new Muse session, so what the student says meanwhile waits for the ears as it does at the start.
    mic.getLine()?.hold();
    showReconnecting();
    await room.disconnect(false).catch(() => {});
    const deadline = getEpochMs() + LONGEST_REJOIN_MS;
    while (!isClosed && !hasLeftRoom && getEpochMs() < deadline) {
      try {
        if (!(await connectRoom())) {
          isRejoining = false;
          return leaveRoom('ended');
        }
        if (hasLeftRoom) break;
        connectedAtEpochMs = getEpochMs();
        let published: MicLine | null = null;
        while (mic.getLine() !== published) {
          if (published) await room.localParticipant.unpublishTrack(published.track);
          published = mic.getLine();
          if (published) await publishMic(published);
        }
        isRejoining = false;
        return;
      } catch {
        await room.disconnect(false).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, REJOIN_EVERY_MS));
      }
    }
    isRejoining = false;
    if (!isClosed && !hasLeftRoom) leaveRoom('ended');
  }

  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return;
    stopListening();
    stopListening = listenToTutor(track, { audioContext, gain, clock, onProbe });
    hasTutorTrack = true;
    send({ type: 'hello', ...getStamp(), wantsGreeting: wantsGreeting && !hasSaidHello });
    hasSaidHello = true;
    sendAudioState();
    flushOutbox();
    beat();
  });
  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => onDataReceived(payload, topic));
  room.on(RoomEvent.Reconnecting, () => {
    player.freeze();
    showReconnecting();
  });
  room.on(RoomEvent.Reconnected, () => {
    connectedAtEpochMs = getEpochMs();
    const line = isPublishOwed ? mic.getLine() : null;
    isPublishOwed = false;
    if (line) publishMic(line).catch(() => mic.setOn(false));
  });
  room.on(RoomEvent.Disconnected, (reason) => {
    if (isRejoining || hasLeftRoom) return;
    player.freeze();
    // Before the tutor is heard, a closed room is a warm room timing out under a late press, and asking again finds out if the session has finished.
    const isRoomGoneForGood = reason === DisconnectReason.ROOM_DELETED && hasHeardTutor;
    const isFinal = isClosed || view.closedBecause !== null || reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.DUPLICATE_IDENTITY || isRoomGoneForGood;
    if (isFinal) return leaveRoom('ended');
    showReconnecting();
    void rejoin();
  });

  const tutorWait = setTimeout(() => leaveRoom('noTutor'), TUTOR_ARRIVES_WITHIN_MS);
  try {
    if (!(await connectRoom(firstAccess))) throw new Error('there is no room to join');
  } catch (problem) {
    clearTimeout(tutorWait);
    window.removeEventListener('pagehide', onPageHide);
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
    sendTyped(text, isOpening = false) {
      const clipped = clipTypedText(text);
      showHeard();
      addStudentWords({ text: clipped, isFinal: true });
      send({ type: 'typed', ...getStamp(), text: clipped, ...(isOpening ? { isOpening } : {}) });
    },
    canAskForRecap: () => !hasLeftRoom && canReachAgent(),
    askForRecap() {
      if (hasLeftRoom || !canReachAgent()) return false;
      void mic.setOn(false);
      send({ type: 'endingSession', ...getStamp() });
      return true;
    },
    reportMarkNotDrawn(markId) {
      send({ type: 'markNotDrawn', ...getStamp(), markId });
    },
    sendWork(given, startedMsAgo = 0) {
      const work = given.way === 'write' ? { ...given, text: clipTypedText(cleanTypedLine(given.text)) } : given;
      const nowMs = clock.getNowMs();
      const checked = checkWorkOnBoard(work, player.getBoard(nowMs));
      player.addStudentOperations([{ kind: 'worked', atMs: nowMs, action: { action: 'worked', work, ...checked } }]);
      showHeard();
      setView({ firstWord: getNod(work, checked) });
      send({ type: 'worked', ...getStamp(), startedMsAgo, work });
    },
    sendInkStroke(id, points) {
      const atMs = clock.getNowMs();
      player.addStudentOperations([{ kind: 'inkStroke', atMs, id, points }]);
      for (let start = 0; start < points.length; start += INK_POINTS_IN_A_MESSAGE) send({ type: 'acted', ...getStamp(), action: { action: 'inkStroke', id, points: points.slice(start, start + INK_POINTS_IN_A_MESSAGE) } });
    },
    sendInkPeek(strokes) {
      send({ type: 'inkPeek', ...getStamp(), strokes: [...strokes] });
    },
    noteTyping() {
      const nowMs = clock.getNowMs();
      if (nowMs - typingNotedAtMs < TYPING_NOTED_EVERY_MS) return;
      typingNotedAtMs = nowMs;
      setView({ typingNoteCount: view.typingNoteCount + 1 });
      send({ type: 'typing', ...getStamp() });
    },
    sendInkDone(id, strokes, task) {
      showHeard();
      send({ type: 'inkDone', ...getStamp(), id, strokes: [...strokes], ...(task ? { task } : {}) });
    },
    movePoint(task, x) {
      player.addStudentOperations([{ kind: 'pointMoved', atMs: clock.getNowMs(), task, x }]);
    },
    getLoudness() {
      analyser.getByteTimeDomainData(loudnessSamples);
      const peak = loudnessSamples.reduce((largest, sample) => Math.max(largest, Math.abs(sample - MIDDLE_SAMPLE)), 0);
      return Math.min(1, peak / LOUDEST_PEAK);
    },
    stopTutor() {
      setView({ isStopped: true });
      player.freeze();
      send({ type: 'stopTutor', ...getStamp() });
    },
    sendPause(seconds, draft) {
      send({ type: 'paused', ...getStamp(), seconds, ...(draft ? { draft: clipTypedText(draft) } : {}) });
    },
    async toggleMic() {
      if (!hasLeftRoom && !view.closedBecause) await mic.toggle();
    },
    sayStillHere() {
      setView({ isQuietWarning: false });
      send({ type: 'stillHere', ...getStamp() });
    },
    async turnOnSound() {
      await audioContext.resume();
    },
    mark(note) {
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(note)), { reliable: true, topic: LAB_TOPIC }).catch(() => {});
    },
    async close() {
      isClosed = true;
      clearInterval(ticker);
      clearInterval(pulses);
      clearTimeout(heardTimer);
      clearTimeout(tutorWait);
      localYield.close();
      window.removeEventListener('pagehide', onPageHide);
      await mic.close();
      stopListening();
      await room.disconnect();
      await audioContext.close();
    },
  };
}
