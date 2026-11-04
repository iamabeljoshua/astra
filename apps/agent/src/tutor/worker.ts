import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoSubscribe, cli, defineAgent, initializeLogger, type JobContext, ServerOptions } from '@livekit/agents';
import { AudioSource, LocalAudioTrack, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, getBeatText, parseBrowserMessage } from '@astra/contracts';
import { readKey } from '../lab/keys.ts';
import { createTakePicker, loadTakes } from '../live/reactions.ts';
import { readDataMessage } from '../live/read-data-message.ts';
import { createVoiceLine, getSteadyNowMs } from '../live/voice-line.ts';
import { makeAnthropicTutorModel, type TutorModelName } from '../providers/anthropic.ts';
import { makeTutorVoice } from '../providers/choose.ts';
import { makeRecordedTutorModel } from '../providers/fake-model.ts';
import { renderTone } from '../providers/fakes.ts';
import { makeRenderedVoice, RENDERED_SAMPLE_RATE } from '../providers/rendered-voice.ts';
import { createTutorBrain, type StudentProfile, type TurnSummary } from './brain.ts';
import { TUTOR_SYSTEM } from './prompt.ts';
import { createSpendLedger } from './spend-ledger.ts';
import { createTutorSession } from './tutor-session.ts';

export const LIVE_TOPIC = 'astra.live';
const AGENT_NAME = 'astra-tutor';
const AUDIO_QUEUE_MS = 200;
const PULSE_EVERY_MS = 500;
const LEFT_ROOM_CLOSES_AFTER_MS = 120_000;
const STUDENT_IDENTITY_PREFIX = 'student-';
const DEFAULT_LIMIT_USD = 8;
const DEFAULT_LIMIT_CREDITS = 1500;

const encoder = new TextEncoder();

function makeTraceFile(roomName: string) {
  const folder = process.env.ASTRA_TUTOR_TRACE;
  if (!folder) return () => {};
  mkdirSync(folder, { recursive: true });
  const path = join(folder, `${roomName}.jsonl`);
  return (name: string, fields: Record<string, unknown> = {}) => appendFileSync(path, `${JSON.stringify({ name, atMs: getSteadyNowMs(), ...fields })}\n`);
}

function makeLedger() {
  const path = process.env.ASTRA_SPEND_FILE;
  if (!path) return null;
  return createSpendLedger(path, { limitUsd: Number(process.env.ASTRA_SPEND_LIMIT_USD ?? DEFAULT_LIMIT_USD), limitCredits: Number(process.env.ASTRA_SPEND_LIMIT_CREDITS ?? DEFAULT_LIMIT_CREDITS) });
}

function makeVoice(ledger: ReturnType<typeof makeLedger>) {
  if (process.env.ASTRA_VOICE === 'fake' || ledger?.isOverVoiceLimit()) return makeRenderedVoice({ name: 'fake', render: renderTone }).makeTts();
  return makeTutorVoice({ apiKey: readKey('ELEVENLABS_API_KEY') }).makeTts();
}

function makeModel() {
  const name = process.env.ASTRA_TUTOR_MODEL ?? 'sonnet-5-5';
  if (name === 'recorded') return makeRecordedTutorModel();
  return makeAnthropicTutorModel({ name: name as TutorModelName, apiKey: readKey('ANTHROPIC_API_KEY') });
}

// The API puts the student's level, interests, and goal on the dispatch, so the agent needs no database and no other student data.
function readProfile(metadata: string | undefined): StudentProfile | null {
  if (!metadata) return null;
  const { level, interests, goal } = JSON.parse(metadata) as Partial<StudentProfile>;
  return typeof level === 'string' && typeof goal === 'string' && Array.isArray(interests) ? { level, goal, interests } : null;
}

async function runSession(context: JobContext): Promise<void> {
  const { room } = context;
  const trace = makeTraceFile(room.name ?? 'room');
  const ledger = makeLedger();
  trace('jobStarted');
  const publish = (message: AgentMessage, isReliable = true) => room.localParticipant?.publishData(encoder.encode(JSON.stringify(message)), { reliable: isReliable, topic: LIVE_TOPIC });
  const source = new AudioSource(RENDERED_SAMPLE_RATE, 1, AUDIO_QUEUE_MS);
  const publishOptions = new TrackPublishOptions();
  publishOptions.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant?.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), publishOptions);

  const voice = makeVoice(ledger);
  voice.on('error', (error) => trace('voiceError', { problem: String(error.error) }));
  voice.prewarm();
  const model = makeModel();
  void model.warm(TUTOR_SYSTEM).catch((error: unknown) => trace('warmFailed', { problem: String(error) }));
  const onTurnEnd = (summary: TurnSummary) => {
    const { firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated } = summary;
    trace('turnWritten', { firstTextMs, firstBeatMs, attempts, endedAs, costUsd, usage, refused, refusalCategory, isUsageEstimated, words: summary.spokenText.split(/\s+/).length });
    ledger?.charge({ anthropicUsd: costUsd, voiceCharacters: summary.beats.map(getBeatText).join(' ').length });
  };
  const brain = createTutorBrain({ model, profile: readProfile(context.job.metadata), trace, onTurnEnd, isOverBudget: () => ledger?.isOverModelLimit() ?? false });
  const allTakes = loadTakes();
  const session = createTutorSession({
    messenger: {
      send: (message) => void publish(message),
      sendOnBothChannels(message) {
        void publish(message);
        void publish(message, false);
      },
    },
    line: createVoiceLine(source),
    voice,
    brain,
    takes: createTakePicker(allTakes),
    allTakes,
    trace,
  });

  let closing: ReturnType<typeof setTimeout> | undefined;
  const pulse = setInterval(() => void publish({ type: 'pulse' }, false), PULSE_EVERY_MS);
  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== LIVE_TOPIC || !participant?.identity.startsWith(STUDENT_IDENTITY_PREFIX)) return;
    const read = readDataMessage(payload);
    const parsed = read.ok ? parseBrowserMessage(read.value) : read;
    if (!parsed.ok) return trace('messageRefused', { problem: parsed.problem });
    clearTimeout(closing);
    session.onBrowser(parsed.value);
    if (parsed.value.type === 'pulse') session.greet();
  });
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    if (!participant.identity.startsWith(STUDENT_IDENTITY_PREFIX)) return;
    trace('studentLeft');
    closing = setTimeout(() => context.shutdown('the student left'), LEFT_ROOM_CLOSES_AFTER_MS);
  });
  context.addShutdownCallback(async () => {
    trace('jobClosing');
    clearTimeout(closing);
    clearInterval(pulse);
    await session.close();
    await voice.close();
    await source.close();
    await context.deleteRoom().catch(() => {});
  });
}

export default defineAgent({
  entry: async (context: JobContext) => {
    await context.connect(undefined, AutoSubscribe.SUBSCRIBE_NONE);
    await runSession(context);
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeLogger({ pretty: false, level: 'warn' });
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: process.env.ASTRA_AGENT_NAME ?? AGENT_NAME,
      numIdleProcesses: 1,
      port: Number(process.env.ASTRA_AGENT_PORT ?? 8081),
      wsURL: process.env.LIVEKIT_URL ?? readKey('LIVEKIT_URL'),
      apiKey: process.env.LIVEKIT_API_KEY ?? readKey('LIVEKIT_API_KEY'),
      apiSecret: process.env.LIVEKIT_API_SECRET ?? readKey('LIVEKIT_API_SECRET'),
    }),
  );
}
