import { AudioSource, dispose, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, type BeatId, type BrowserMessage, parseBrowserMessage, type PlayReport, type TurnId } from '@astra/contracts';
import type { tts } from '@livekit/agents';
import { getResumeBeats } from '../live/resume-plan.ts';
import { readDataMessage } from '../live/read-data-message.ts';
import { createSessionLog } from '../live/session-log.ts';
import { type SpokenTurn, speakTurn, type TextPace } from '../live/speak-turn.ts';
import { createVoiceLine } from '../live/voice-line.ts';
import { type LabRecorder } from './lab-recorder.ts';
import { getLessonTurn, getNamedLessonTurn, type LessonName, STOCK_MATH_TURN, STOCK_TURN } from './lesson.ts';

export const LIVE_TOPIC = 'astra.live';
export const LAB_TOPIC = 'astra.lab';
const AUDIO_QUEUE_MS = 200;
/** How long a resume waits for the browser to say what it played, as the design's wiring does. */
const REPORT_WAIT_MS = 1000;

export type LabCommand =
  | { type: 'play'; lesson?: LessonName; lessonTurn?: number; repeats?: number; cueEveryWords?: number; isStockPhrase?: boolean; isStockMath?: boolean; textPace?: TextPace; proofStalls?: { atAudioMs: number; ms: number }[]; wordsLateMs?: number; sendsWordsOneByOne?: boolean }
  | { type: 'interrupt' }
  | { type: 'resume'; textPace?: TextPace }
  | { type: 'finish' }
  | { type: 'sendRaw'; messages: unknown[] }
  /** The page has joined and hears the tutor's track, so the lesson can start without losing its first sound. */
  | { type: 'hello' };

export interface LabAgentOptions {
  url: string;
  token: string;
  voice: tts.TTS;
  sampleRate: number;
  recorder: LabRecorder;
}

interface ActiveTurn {
  id: TurnId;
  beats: readonly Beat[];
  spoken: SpokenTurn;
  reports: Map<BeatId, PlayReport>;
}

// Stand-in for the real agent: speaks a scripted lesson, reports gaps, and logs what the browser says played.
export async function runLabAgent({ url, token, voice, sampleRate, recorder }: LabAgentOptions): Promise<void> {
  const room = new Room();
  const encoder = new TextEncoder();
  const startedAtMs = Date.now();
  let turnCount = 0;
  let active = null as ActiveTurn | null;
  const beatsByTurn = new Map<TurnId, readonly Beat[]>();
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const publish = (topic: string, message: object, reliable = true) => room.localParticipant?.publishData(encoder.encode(JSON.stringify(message)), { reliable, topic });
  let wordsLateMs = 0;
  let sendsWordsOneByOne = false;
  let firstWordsAtMs: number | null = null;
  // Proof only. Each word time leaves at its own moment, so a cue never knows its later words as it fires.
  const sendEachWordAtItsTime = (message: AgentMessage & { type: 'words' }) => {
    firstWordsAtMs ??= Date.now();
    const startsAtMs = firstWordsAtMs;
    message.words.forEach((word, index) => {
      setTimeout(() => void publish(LIVE_TOPIC, { ...message, firstWord: message.firstWord + index, words: [word] }), Math.max(0, startsAtMs + word.startMs - Date.now()));
    });
  };
  const messenger = {
    send(message: AgentMessage) {
      if (message.type === 'words' && sendsWordsOneByOne) sendEachWordAtItsTime(message);
      else if (message.type === 'words' && wordsLateMs > 0) setTimeout(() => void publish(LIVE_TOPIC, message), wordsLateMs);
      else void publish(LIVE_TOPIC, message);
    },
    sendOnBothChannels(message: AgentMessage) {
      void publish(LIVE_TOPIC, message);
      void publish(LIVE_TOPIC, message, false);
    },
  };
  const log = createSessionLog({
    getNowMs: () => Date.now() - startedAtMs,
    getBeat: (turnId, beatId) => beatsByTurn.get(turnId)?.find((beat) => beat.id === beatId),
    onWritten: (event) => {
      void publish(LAB_TOPIC, { type: 'logEvent', event });
      recorder.noteLogEvent(event);
    },
    onRefused: (problem) => recorder.noteRefused(`log refused: ${problem}`),
  });

  await room.connect(url, token, { autoSubscribe: false, dynacast: false });
  const source = new AudioSource(sampleRate, 1, AUDIO_QUEUE_MS);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant?.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), options);
  const line = createVoiceLine(source);
  voice.on('error', (error) => recorder.noteRefused(`voice error: ${String(error.error)}`));
  voice.prewarm();

  const startTurn = (beats: readonly Beat[], { textPace, proofStalls }: Pick<LabCommand & { type: 'play' }, 'textPace' | 'proofStalls'> = {}) => {
    const id = `turn-${(turnCount += 1)}` as TurnId;
    beatsByTurn.set(id, beats);
    recorder.startTurn(id, beats);
    const spoken = speakTurn({
      voice,
      line,
      messenger,
      turnId: id,
      beats,
      textPace,
      proofStalls,
      onFrameCaptured: (note) => recorder.noteFrame(id, note),
      onWords: (words) => recorder.noteWords(id, words),
      onGap: (gap) => recorder.noteGap(id, gap),
      onFailure: (failure) => recorder.noteRefused(`turn failed: ${String(failure)}`),
    });
    active = { id, beats, spoken, reports: new Map() };
    void spoken.finished.then(() => {
      recorder.finishTurn(id, spoken.getWordMismatches());
      void publish(LAB_TOPIC, { type: 'turnAudioSent', turnId: id });
    });
  };

  const hasEveryReport = (turn: ActiveTurn) => [...turn.spoken.getWordsSent().keys()].every((beatId) => turn.reports.has(beatId));

  const whenReported = async (turn: ActiveTurn): Promise<void> => {
    const deadline = Date.now() + REPORT_WAIT_MS;
    while (!hasEveryReport(turn) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  };

  const resumeTurn = async (turn: ActiveTurn, textPace?: TextPace) => {
    await whenReported(turn);
    startTurn(getResumeBeats({ beats: turn.beats, reports: turn.reports, wordsSent: turn.spoken.getWordsSent(), resumeTag: `r${turnCount}` }), { textPace });
  };

  const getTurnBeats = (command: LabCommand & { type: 'play' }): readonly Beat[] => {
    if (command.isStockMath) return STOCK_MATH_TURN;
    if (command.isStockPhrase) return STOCK_TURN;
    return command.lesson ? getNamedLessonTurn({ ...command, lesson: command.lesson }) : getLessonTurn(command);
  };

  const runCommand = (command: LabCommand) => {
    if (command.type === 'play') {
      wordsLateMs = command.wordsLateMs ?? 0;
      sendsWordsOneByOne = command.sendsWordsOneByOne ?? false;
      firstWordsAtMs = null;
      startTurn(getTurnBeats(command), command);
    }
    if (command.type === 'interrupt') {
      recorder.noteStopDecided(active?.id);
      active?.spoken.stop();
    }
    if (command.type === 'resume' && active) void resumeTurn(active, command.textPace);
    if (command.type === 'finish') finish();
    if (command.type === 'sendRaw') for (const message of command.messages) void publish(LIVE_TOPIC, message as object);
    if (command.type === 'hello') void publish(LAB_TOPIC, { type: 'agentReady' });
  };

  const onBrowserMessage = (message: BrowserMessage) => {
    recorder.noteBrowserMessage(message);
    if (message.type === 'played') active?.reports.set(message.beatId, message);
    log.write(message);
  };

  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    const read = readDataMessage(payload);
    if (!read.ok) return recorder.noteRefused(read.problem);
    if (topic === LAB_TOPIC) runCommand(read.value as LabCommand);
    if (topic !== LIVE_TOPIC) return;
    const parsed = parseBrowserMessage(read.value);
    if (parsed.ok) onBrowserMessage(parsed.value);
    else recorder.noteRefused(parsed.problem);
  });

  await finished;
  active?.spoken.stop();
  await active?.spoken.finished;
  await source.close();
  await room.disconnect();
  await voice.close();
  await dispose();
}
