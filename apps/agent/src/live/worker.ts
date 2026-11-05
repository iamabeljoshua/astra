import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoSubscribe, cli, defineAgent, inference, initializeLogger, type JobContext, type JobProcess, ServerOptions } from '@livekit/agents';
import { randomUUID } from 'node:crypto';
import { AudioSource, DataPacketKind, DisconnectReason, LocalAudioTrack, type RemoteParticipant, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, parseBrowserMessage, parseSceneBrowserMessage, PULSE_EVERY_MS, SCENE_TOPIC, type SceneAgentMessage } from '@astra/contracts';
import { readKey } from '../keys.ts';
import { renderNothing, renderTone } from '../providers/fakes.ts';
import { makeTutorTranscriber, makeTutorVoice } from '../providers/choose.ts';
import { makeRenderedVoice, RENDERED_SAMPLE_RATE } from '../providers/rendered-voice.ts';
import { type Ears, startEars, VAD_SETTINGS } from './ears.ts';
import { createClosingWait } from './closing-wait.ts';
import { createEarlyMessages } from './early-messages.ts';
import { createLiveSession, type SceneHeard } from './live-session.ts';
import type { SpeechBreak } from './word-timeline.ts';
import { createTakePicker, loadTakes } from './reactions.ts';
import { readDataMessage } from './read-data-message.ts';
import type { LessonEvent, LessonState } from '../lesson-plan/plan-progress.ts';
import type { ApiLink } from '../tutor/api-link.ts';
import { hasTutorScenes, makeApiLink, makeTutorBrain, warmTutorModel } from '../tutor/make-brain.ts';
import { hasFastScenes, makeTutorScenes, type SessionScenes } from '../tutor/make-tutor-scenes.ts';
import { getSpokenCharacters } from '../tutor/tutor-scenes.ts';
import { createHeardRecorder } from './heard-recorder.ts';
import { createLogSaver, type LogSaver } from './log-saver.ts';
import { getSteadyNowMs, createVoiceLine } from './voice-line.ts';

/** The rate in `docs/architecture/live-session.md`, $3 for 1,000 minutes. */
const MUSE_USD_PER_MINUTE = 3 / 1000;
const MS_PER_MINUTE = 60_000;
const LIVE_TOPIC = 'astra.live';
const LAB_TOPIC = 'astra.lab';
const AUDIO_QUEUE_MS = 200;
/** A tab closed on purpose can still be a reload, so the room waits this long. */
const LEFT_ON_PURPOSE_MS = 15_000;
/** A dropped link can come back, so the room waits this long before it closes. */
const LINK_DROPPED_MS = 120_000;
/** Long enough for the page to hear why before the room goes. */
const SAY_WHY_BEFORE_CLOSING_MS = 500;
const STUDENT_IDENTITY_PREFIX = 'student-';
// The SDK refuses students at 70% load, and any limit below none still refuses them on a busy laptop at 100%, as 0.98 did. Hosting sets its own limit when it exists.
const LOAD_LIMIT = Number(process.env.ASTRA_AGENT_LOAD_LIMIT ?? Infinity);

const encoder = new TextEncoder();

// Timings only, and only when asked for. Words stay out unless a test on test speech asks for them too, because a transcript must not reach a file by accident.
function makeTraceFile(roomName: string) {
  const folder = process.env.ASTRA_VOICE_TRACE;
  if (!folder) return () => {};
  const keepsWords = process.env.ASTRA_VOICE_TRACE_WORDS === '1';
  mkdirSync(folder, { recursive: true });
  const path = join(folder, `${roomName}.jsonl`);
  return (name: string, { text, ...fields }: Record<string, unknown> = {}) => appendFileSync(path, `${JSON.stringify({ name, atMs: getSteadyNowMs(), ...fields, ...(keepsWords && text !== undefined ? { text } : {}) })}\n`);
}

function makeVoice() {
  if (process.env.ASTRA_VOICE === 'fake') return makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts();
  if (process.env.ASTRA_VOICE === 'silent') return makeRenderedVoice({ name: 'silent', render: renderNothing }).makeTts();
  return makeTutorVoice({ apiKey: readKey('ELEVENLABS_API_KEY') }).makeTts();
}

// A session the student comes back to gets a new job with its own clock and count, so each job saves its own run of the log.
function makeLogSaver(link: ApiLink | null, trace: (name: string, fields?: Record<string, unknown>) => void): LogSaver | null {
  if (!link) return null;
  const runId = randomUUID();
  const runStartedAt = new Date();
  return createLogSaver({ save: (events) => link.saveLog({ runId, runStartedAt, events }), onFailed: (problem) => trace('logSaveFailed', { problem }) });
}

async function runSession(context: JobContext): Promise<void> {
  const { room } = context;
  const trace = makeTraceFile(room.name ?? 'room');
  trace('jobStarted', { pid: process.pid });
  // Publishing fails once the room has gone, and a stray rejection would end the whole process.
  const publish = (message: AgentMessage, isReliable = true) => void room.localParticipant?.publishData(encoder.encode(JSON.stringify(message)), { reliable: isReliable, topic: LIVE_TOPIC }).catch((error: unknown) => trace('publishFailed', { problem: String(error) }));
  const source = new AudioSource(RENDERED_SAMPLE_RATE, 1, AUDIO_QUEUE_MS);

  const voice = makeVoice();
  voice.on('error', (error) => trace('voiceError', { problem: String(error.error) }));
  voice.prewarm();
  let hearingSinceMs: number | null = null;
  const transcriber = makeTutorTranscriber({
    apiKey: readKey('META_API_KEY'),
    onNote(note) {
      trace(`muse:${note.kind}`, note);
      if (note.kind === 'hearing') {
        hearingSinceMs ??= Date.now();
        publish({ type: 'earsOpen' });
      }
      if (note.kind === 'lineFlushed') session.onEars({ type: 'lineFlushed' });
    },
  }).makeStt();
  const allTakes = loadTakes();
  let ears: Ears | null = null;
  let scenes: SessionScenes | null = null;
  let lastFirstTextMs: number | null = null;
  const sceneHooks = {
    onAskScene: (topic: string) => scenes?.onTutorAsk(topic),
    onStudentWords: (words: string) => scenes?.noteStudentWords(words),
    onLessonChange(state: LessonState, event: LessonEvent | null) {
      scenes?.queue?.onLesson(state, event);
      if (hasFastScenes() && state.active) scenes?.noteTopic(state.active.plan.topic);
    },
    getPictureTopic: () => scenes?.queue?.getPictureTopic() ?? null,
    onSafetyReply() {
      scenes?.noteSafetyReply();
      scenes?.queue?.noteSafetyReply();
    },
    onCardKnown: (title: string | null) => scenes?.noteCard(title),
    onTurnWritten(turn: { wasLead: boolean; firstTextMs: number | null; spokenText: string; refusalCategory: string | null }) {
      lastFirstTextMs = turn.firstTextMs;
      scenes?.queue?.noteTutorReply(turn);
    },
  };
  const { brain, lessonPlanner, caps, cardTitle, flushSpend, readMeaning, readStrokes, readSpokenWords, writeRecap, readSafety, getSpentUsd, writeRecord, noteNeedsAPerson } = makeTutorBrain({ roomName: room.name ?? '', jobId: context.job.id, trace, showSafetyHelp: () => publish({ type: 'safetyHelp' }), onSessionTitle(title) {
      publish({ type: 'sessionTitle', title });
      scenes?.noteTopic(title);
    }, ...(hasTutorScenes() ? { sceneHooks } : {}) });
  const apiLink = makeApiLink(room.name ?? '');
  const logSaver = makeLogSaver(apiLink, trace);
  const session = createLiveSession({
    messenger: {
      send: (message) => publish(message),
      sendOnBothChannels(message) {
        publish(message);
        publish(message, false);
      },
    },
    line: createVoiceLine(source),
    voice,
    tutor: brain,
    takes: createTakePicker(allTakes),
    allTakes,
    setTurnCap: (ms) => ears?.setTurnCap(ms),
    endLine: () => transcriber.endLine(),
    onQuietLimit: () => void setTimeout(() => context.shutdown('the room stayed quiet'), SAY_WHY_BEFORE_CLOSING_MS),
    ...(process.env.ASTRA_QUIET_LIMIT_MS ? { quietLimitMs: Number(process.env.ASTRA_QUIET_LIMIT_MS) } : {}),
    trace,
    ...(readMeaning ? { readMeaning } : {}),
    ...(readStrokes ? { readStrokes } : {}),
    ...(readSpokenWords ? { readSpokenWords } : {}),
    ...(writeRecap ? { writeRecap } : {}),
    ...(readSafety ? { readSafety } : {}),
    ...(logSaver ? { onLogWritten: logSaver.note } : {}),
    onRecap(recap) {
      if (recap.kind === 'gentle') noteNeedsAPerson?.();
      void apiLink?.saveRecap(recap).catch((problem: unknown) => trace('recapSaveFailed', { problem: String(problem) }));
    },
    onEndingOver: () => void setTimeout(() => context.shutdown('the recap is over'), SAY_WHY_BEFORE_CLOSING_MS),
    ...(process.env.ASTRA_SAVE_HEARD && process.env.NODE_ENV !== 'production' ? { recordTurn: createHeardRecorder(process.env.ASTRA_SAVE_HEARD, room.name ?? 'room') } : {}),
    onPause: () => scenes?.notePause(),
    ...(hasTutorScenes()
      ? {
          onStudentTurn: () => scenes?.noteStudentTurn(),
          onEnding: () => scenes?.close(),
          getOpeningScene: () => scenes?.getOpeningScene() ?? Promise.resolve(null),
          onLinkChange: (isUp: boolean) => scenes?.notePageLink(isUp),
          waitForPicture: () => scenes?.waitForPicture() ?? Promise.resolve(true),
        }
      : {}),
    ...(hasTutorScenes() && hasFastScenes()
      ? {
          sentenceBreaks: { queueMs: AUDIO_QUEUE_MS, onBreak: (kind: SpeechBreak) => scenes?.noteSentenceBreak(kind) },
          onSceneCut: (heard: SceneHeard) => scenes?.noteSceneCut(heard),
          takeOwedCommands: () => scenes?.takeOwedCommands() ?? [],
        }
      : {}),
    ...(process.env.ASTRA_SHOW_COST === '1' ? { getCostSoFar: () => (getSpentUsd?.() ?? 0) + (hearingSinceMs === null ? 0 : ((Date.now() - hearingSinceMs) / MS_PER_MINUTE) * MUSE_USD_PER_MINUTE) } : {}),
  });
  if (hasTutorScenes() && caps) {
    scenes = makeTutorScenes({
      caps,
      moveToNextStep: () => lessonPlanner?.moveToNextStep(),
      getLastFirstTextMs: () => lastFirstTextMs,
      getCardTitle: () => cardTitle?.() ?? null,
      send: (message: SceneAgentMessage) => void room.localParticipant?.publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: SCENE_TOPIC }).catch((error: unknown) => trace('sceneNotSent', { problem: String(error) })),
      canSpeak: session.isAtPause,
      speak: session.speakScene,
      canCutIn: session.canCutInScene,
      isInBreath: session.isInBreath,
      cutIn: session.cutInScene,
      getLevel: () => brain.getStudentLevel?.() ?? null,
      isTutorClosed: () => brain.getClosedReason?.() != null,
      onShown(shown) {
        brain.noteSceneTurn?.(shown);
        const voiceCharacters = getSpokenCharacters(shown.beats);
        if (shown.isShared) caps.addSharedVoice(voiceCharacters, shown.studentId);
        else caps.addTurn({ usd: 0, voiceCharacters });
      },
      trace,
    });
  }
  ears = await startEars({ room, transcriber, vad: context.proc.userData.vad as inference.VAD, onEvent: session.onEars });

  const closing = createClosingWait({ leftOnPurposeMs: LEFT_ON_PURPOSE_MS, linkDroppedMs: LINK_DROPPED_MS, onClose: () => context.shutdown('the student left') });
  const pulse = setInterval(() => publish({ type: 'pulse' }, false), PULSE_EVERY_MS);

  // A microphone test labels each line in the trace, and without a trace this does nothing.
  const noteMark = (payload: Uint8Array) => {
    const read = readDataMessage(payload);
    if (read.ok) trace('mark', { mark: read.value });
  };

  const readFromStudent = (payload: Uint8Array, identity: string, topic: string | undefined) => {
    if (topic === LAB_TOPIC) return noteMark(payload);
    if (topic === SCENE_TOPIC) {
      const message = readDataMessage(payload);
      const scene = message.ok ? parseSceneBrowserMessage(message.value) : message;
      if (scene.ok) scenes?.onPage(scene.value, identity.slice(STUDENT_IDENTITY_PREFIX.length));
      return;
    }
    if (topic !== LIVE_TOPIC) return;
    const read = readDataMessage(payload);
    const parsed = read.ok ? parseBrowserMessage(read.value) : read;
    if (!parsed.ok) return trace('messageRefused', { problem: parsed.problem });
    closing.cancel();
    session.onBrowser(parsed.value);
  };
  const earlyMessages = createEarlyMessages();

  room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
    if (!participant) {
      if (kind === DataPacketKind.KIND_RELIABLE) earlyMessages.hold({ payload, topic });
      return;
    }
    if (participant.identity.startsWith(STUDENT_IDENTITY_PREFIX)) readFromStudent(payload, participant.identity, topic);
  });
  room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
    if (!participant.identity.startsWith(STUDENT_IDENTITY_PREFIX)) return;
    trace('studentJoined');
    closing.cancel();
    const early = earlyMessages.take();
    if (early.length > 0) trace('earlyMessagesRead', { count: early.length });
    for (const { payload, topic } of early) readFromStudent(payload, participant.identity, topic);
  });
  room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
    if (!participant.identity.startsWith(STUDENT_IDENTITY_PREFIX)) return;
    const leftOnPurpose = participant.disconnectReason === DisconnectReason.CLIENT_INITIATED;
    trace('studentLeft', { leftOnPurpose });
    closing.studentLeft({ leftOnPurpose });
  });
  const publishOptions = new TrackPublishOptions();
  publishOptions.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant?.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), publishOptions);
  trace('voiceTrackUp');
  publish({ type: 'pulse' }, false);

  context.addShutdownCallback(async () => {
    trace('jobClosing');
    closing.cancel();
    clearInterval(pulse);
    scenes?.close();
    await session.close();
    await logSaver?.close();
    if (process.env.ASTRA_VOICE_TRACE_WORDS === '1') trace('sessionLog', { events: session.getLog() });
    await flushSpend();
    const recordWriting = writeRecord?.();
    await ears?.close();
    await transcriber.close();
    await voice.close();
    await source.close();
    await context.deleteRoom().catch(() => {});
    await recordWriting;
    await flushSpend();
    trace('jobClosed');
  });
}

export default defineAgent({
  prewarm: (process_: JobProcess) => {
    process_.userData.vad = new inference.VAD(VAD_SETTINGS);
  },
  entry: async (context: JobContext) => {
    warmTutorModel();
    await context.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    await runSession(context);
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeLogger({ pretty: false, level: 'warn' });
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: process.env.ASTRA_AGENT_NAME ?? 'astra-tutor',
      numIdleProcesses: 1,
      loadThreshold: LOAD_LIMIT,
      port: Number(process.env.ASTRA_AGENT_PORT ?? 8081),
      wsURL: readKey('LIVEKIT_URL'),
      apiKey: readKey('LIVEKIT_API_KEY'),
      apiSecret: readKey('LIVEKIT_API_SECRET'),
    }),
  );
}
