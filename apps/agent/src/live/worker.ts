import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoSubscribe, cli, defineAgent, inference, initializeLogger, type JobContext, type JobProcess, ServerOptions } from '@livekit/agents';
import { AudioSource, DisconnectReason, LocalAudioTrack, type RemoteParticipant, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, parseBrowserMessage } from '@astra/contracts';
import { readKey } from '../lab/keys.ts';
import { renderTone } from '../providers/fakes.ts';
import { makeTutorTranscriber, makeTutorVoice } from '../providers/choose.ts';
import { makeRenderedVoice, RENDERED_SAMPLE_RATE } from '../providers/rendered-voice.ts';
import { type Ears, startEars, VAD_SETTINGS } from './ears.ts';
import { createLiveSession } from './live-session.ts';
import { createTakePicker, loadTakes } from './reactions.ts';
import { readDataMessage } from './read-data-message.ts';
import { createStandInTutor } from './stand-in-tutor.ts';
import { getSteadyNowMs, createVoiceLine } from './voice-line.ts';

export const LIVE_TOPIC = 'astra.live';
const AUDIO_QUEUE_MS = 200;
const PULSE_EVERY_MS = 500;
/** A tab closed on purpose can still be a reload, so the room waits this long. */
const LEFT_ON_PURPOSE_MS = 15_000;
/** A dropped link can come back, so the room waits this long before it closes. */
const LINK_DROPPED_MS = 120_000;
const STUDENT_IDENTITY_PREFIX = 'student-';

const encoder = new TextEncoder();

function makeTraceFile(roomName: string) {
  const folder = process.env.ASTRA_VOICE_TRACE;
  if (!folder) return () => {};
  mkdirSync(folder, { recursive: true });
  const path = join(folder, `${roomName}.jsonl`);
  return (name: string, fields: Record<string, unknown> = {}) => appendFileSync(path, `${JSON.stringify({ name, atMs: getSteadyNowMs(), ...fields })}\n`);
}

function makeVoice() {
  if (process.env.ASTRA_VOICE === 'fake') return makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts();
  return makeTutorVoice({ apiKey: readKey('ELEVENLABS_API_KEY') }).makeTts();
}

async function runSession(context: JobContext): Promise<void> {
  const { room } = context;
  const trace = makeTraceFile(room.name ?? 'room');
  trace('jobStarted');
  // Publishing fails once the room has gone, and a stray rejection would end the whole process.
  const publish = (message: AgentMessage, isReliable = true) => void room.localParticipant?.publishData(encoder.encode(JSON.stringify(message)), { reliable: isReliable, topic: LIVE_TOPIC }).catch((error: unknown) => trace('publishFailed', { problem: String(error) }));
  const source = new AudioSource(RENDERED_SAMPLE_RATE, 1, AUDIO_QUEUE_MS);
  const publishOptions = new TrackPublishOptions();
  publishOptions.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant?.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), publishOptions);

  const voice = makeVoice();
  voice.on('error', (error) => trace('voiceError', { problem: String(error.error) }));
  voice.prewarm();
  const transcriber = makeTutorTranscriber({ apiKey: readKey('META_API_KEY'), onNote: (note) => trace(`muse:${note.kind}`, note) }).makeStt();
  const allTakes = loadTakes();
  let ears: Ears | null = null;
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
    tutor: createStandInTutor(),
    takes: createTakePicker(allTakes),
    allTakes,
    setTurnCap: (ms) => ears?.setTurnCap(ms),
    trace,
  });
  ears = await startEars({ room, transcriber, vad: context.proc.userData.vad as inference.VAD, onEvent: session.onEars });

  let closing: ReturnType<typeof setTimeout> | undefined;
  const pulse = setInterval(() => publish({ type: 'pulse' }, false), PULSE_EVERY_MS);
  const finish = () => context.shutdown('the student left');

  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== LIVE_TOPIC || !participant?.identity.startsWith(STUDENT_IDENTITY_PREFIX)) return;
    const read = readDataMessage(payload);
    const parsed = read.ok ? parseBrowserMessage(read.value) : read;
    if (!parsed.ok) return trace('messageRefused', { problem: parsed.problem });
    clearTimeout(closing);
    session.onBrowser(parsed.value);
    if (parsed.value.type === 'pulse') session.greet();
  });
  room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
    if (!participant.identity.startsWith(STUDENT_IDENTITY_PREFIX)) return;
    const leftOnPurpose = participant.disconnectReason === DisconnectReason.CLIENT_INITIATED;
    trace('studentLeft', { leftOnPurpose });
    clearTimeout(closing);
    closing = setTimeout(finish, leftOnPurpose ? LEFT_ON_PURPOSE_MS : LINK_DROPPED_MS);
  });
  context.addShutdownCallback(async () => {
    trace('jobClosing');
    clearTimeout(closing);
    clearInterval(pulse);
    await session.close();
    await ears?.close();
    await transcriber.close();
    await voice.close();
    await source.close();
    await context.deleteRoom().catch(() => {});
    trace('jobClosed');
  });
}

export default defineAgent({
  prewarm: (process_: JobProcess) => {
    process_.userData.vad = new inference.VAD(VAD_SETTINGS);
  },
  entry: async (context: JobContext) => {
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
      port: Number(process.env.ASTRA_AGENT_PORT ?? 8081),
      wsURL: readKey('LIVEKIT_URL'),
      apiKey: readKey('LIVEKIT_API_KEY'),
      apiSecret: readKey('LIVEKIT_API_SECRET'),
    }),
  );
}
