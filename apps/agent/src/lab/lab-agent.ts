import { AudioSource, dispose, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, type BeatId, type BrowserMessage, getResumeScript, parseBeat, parseBrowserMessage, type PlayReport, type TurnId } from '@astra/contracts';
import type { tts } from '@livekit/agents';
import { createSessionLog } from '../live/session-log.ts';
import { type SpokenTurn, speakTurn, type TextPace } from '../live/speak-turn.ts';
import { type LabRecorder } from './lab-recorder.ts';
import { type LessonName, LESSONS, STOCK_MATH_TURN, STOCK_TURN } from './lesson.ts';

export const LIVE_TOPIC = 'astra.live';
export const LAB_TOPIC = 'astra.lab';
const AUDIO_QUEUE_MS = 200;

export type LabCommand =
  | { type: 'play'; lesson?: LessonName; lessonTurn?: number; isStockPhrase?: boolean; isStockMath?: boolean; textPace?: TextPace; proofStalls?: { atAudioMs: number; ms: number }[]; wordsLateMs?: number }
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
  const decoder = new TextDecoder();
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
  const messenger = {
    send(message: AgentMessage) {
      if (message.type === 'words' && wordsLateMs > 0) setTimeout(() => void publish(LIVE_TOPIC, message), wordsLateMs);
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
  });

  await room.connect(url, token, { autoSubscribe: false, dynacast: false });
  const source = new AudioSource(sampleRate, 1, AUDIO_QUEUE_MS);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant?.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), options);
  voice.on('error', (error) => recorder.noteRefused(`voice error: ${String(error.error)}`));
  voice.prewarm();

  const startTurn = (beats: readonly Beat[], { textPace, proofStalls }: Pick<LabCommand & { type: 'play' }, 'textPace' | 'proofStalls'> = {}) => {
    const id = `turn-${(turnCount += 1)}` as TurnId;
    beatsByTurn.set(id, beats);
    recorder.startTurn(id, beats);
    const spoken = speakTurn({
      voice,
      output: source,
      messenger,
      turnId: id,
      beats,
      textPace,
      proofStalls,
      onFrameCaptured: (note) => recorder.noteFrame(id, note),
      onWords: (words) => recorder.noteWords(id, words),
      onGap: (gap) => recorder.noteGap(id, gap),
    });
    active = { id, beats, spoken, reports: new Map() };
    void spoken.finished.then(() => {
      recorder.finishTurn(id, spoken.getWordMismatches());
      void publish(LAB_TOPIC, { type: 'turnAudioSent', turnId: id });
    });
  };

  const getTurnBeats = ({ isStockPhrase, isStockMath, lesson, lessonTurn }: LabCommand & { type: 'play' }): readonly Beat[] => {
    if (isStockMath) return STOCK_MATH_TURN;
    return isStockPhrase ? STOCK_TURN : (LESSONS[lesson ?? 'jump-shot'][lessonTurn ?? 0] ?? []);
  };

  // The rest of a cut turn, starting with the word it was cut on.
  const getResumeBeats = (turn: ActiveTurn): Beat[] =>
    turn.beats.flatMap((beat) => {
      const report = turn.reports.get(beat.id);
      if (!report) return [beat];
      if (report.ending === 'finished') return [];
      const fromWord = Math.max(report.playedWords - 1, 0);
      const parsed = parseBeat({ id: `${beat.id}-r${turnCount}`, script: getResumeScript(beat, { fromWord, firedCues: report.firedCueMs.length, frozen: report.frozen }), expectsReply: beat.expectsReply });
      return parsed.ok ? [parsed.value] : [];
    });

  const runCommand = (command: LabCommand) => {
    if (command.type === 'play') {
      wordsLateMs = command.wordsLateMs ?? 0;
      startTurn(getTurnBeats(command), command);
    }
    if (command.type === 'interrupt') {
      recorder.noteStopDecided(active?.id);
      active?.spoken.stop();
    }
    if (command.type === 'resume' && active) startTurn(getResumeBeats(active), command);
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
    const value: unknown = JSON.parse(decoder.decode(payload));
    if (topic === LAB_TOPIC) runCommand(value as LabCommand);
    if (topic !== LIVE_TOPIC) return;
    const parsed = parseBrowserMessage(value);
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
