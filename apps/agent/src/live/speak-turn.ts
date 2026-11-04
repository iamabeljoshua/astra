import { tts } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, type BeatId, getBeatText, getCues, getSpokenWords, type TimedWord, type TurnId } from '@astra/contracts';
import { createPlayoutTracker, type PlayoutTracker } from '@astra/board';
import { createFirstSound, type FirstSound, getFrameMs } from './first-sound.ts';
import { createFrameQueue, type FrameQueue } from './frame-queue.ts';
import { getSteadyNowMs, type LineTurn, type VoiceLine } from './voice-line.ts';
import { createWordTimeline } from './word-timeline.ts';

const MS_PER_SECOND = 1000;
const STILL_ARRIVING_MS = 300;

export interface TurnMessenger {
  send(message: AgentMessage): void;
  sendOnBothChannels(message: AgentMessage): void;
}

export interface TextPace {
  msPerWord: number;
  flushBeforeCues: boolean;
}

export interface FrameNote {
  frame: AudioFrame;
  capturedAtMs: number;
}

export interface SpeakTurnOptions {
  voice: tts.TTS;
  line: VoiceLine;
  messenger: TurnMessenger;
  turnId: TurnId;
  /** Beats come as the brain writes them. A stopped turn asks for no more. */
  beats: Iterable<Beat> | AsyncIterable<Beat>;
  textPace?: TextPace;
  proofStalls?: readonly { atAudioMs: number; ms: number }[];
  onBeatStarted?(beat: Beat): void;
  onFirstAudioRead?(atMs: number): void;
  onFrameCaptured?(note: FrameNote): void;
  onWords?(words: { atMs: number; words: TimedWord[] }): void;
  onGap?(gap: { atMs: number; ms?: number; reportedAtMs: number }): void;
  getNowMs?(): number;
}

export interface SpokenTurn {
  finished: Promise<void>;
  stop(): void;
  getWordMismatches(): { ours: string; theirs: string }[];
  /** Words were sent to the voice that have not come back, so a silence now is the voice's and not the writer's. */
  isVoiceOwing(): boolean;
  /** How many words of each beat have left the agent, the only record if the browser's report is lost. */
  getWordsSent(): Map<BeatId, number>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TurnWork {
  options: SpeakTurnOptions;
  stream: tts.SynthesizeStream;
  timeline: ReturnType<typeof createWordTimeline>;
  frames: FrameQueue;
  firstSound: FirstSound;
  tracker: PlayoutTracker;
  lineTurn: LineTurn;
  noteAudioSent(ms: number): void;
  isStopped(): boolean;
}

// A turn's messages wait with its audio, so the browser never unmutes or starts a clock before the last turn's audio has gone.
function createHeldMessenger(messenger: TurnMessenger) {
  let held: AgentMessage[] | null = [];
  return {
    send(message: AgentMessage) {
      if (held) held.push(message);
      else messenger.send(message);
    },
    sendOnBothChannels: (message: AgentMessage) => messenger.sendOnBothChannels(message),
    release() {
      const waiting = held ?? [];
      held = null;
      waiting.forEach((message) => messenger.send(message));
    },
    isHolding: () => held !== null,
  };
}

async function writeBeat({ options: { messenger, turnId, textPace }, stream, isStopped }: TurnWork, beat: Beat): Promise<void> {
  const words = getSpokenWords(getBeatText(beat));
  const cues = getCues(beat);
  for (const [wordIndex, word] of words.entries()) {
    if (isStopped()) return;
    const cuesHere = cues.filter((cue) => cue.atWord === wordIndex);
    if (textPace?.flushBeforeCues && cuesHere.length > 0) stream.flush();
    for (const cue of cuesHere) messenger.send({ type: 'cue', turnId, beatId: beat.id, atWord: cue.atWord, command: cue.command });
    stream.pushText(`${word} `);
    if (textPace) await delay(textPace.msPerWord);
  }
  if (isStopped()) return;
  stream.flush();
  messenger.send({ type: 'beatClosed', turnId, beatId: beat.id, wordCount: words.length, expectsReply: beat.expectsReply });
}

async function writeText(work: TurnWork): Promise<void> {
  for await (const beat of work.options.beats) {
    if (work.isStopped()) return;
    work.timeline.addBeat(beat);
    work.options.onBeatStarted?.(beat);
    await writeBeat(work, beat);
  }
  if (!work.isStopped()) work.stream.endInput();
}

// Holds the turn's first word times until the first sound is known, because they count from it.
function createWordSender({ options: { messenger, turnId, onWords, getNowMs = getSteadyNowMs }, timeline, firstSound }: TurnWork) {
  let waiting: { text: string; atVoiceMs: number }[] = [];
  return (words: readonly { text: string; atVoiceMs: number }[]) => {
    waiting.push(...words);
    if (!firstSound.isKnown() || waiting.length === 0) return;
    const fromSound = waiting.map((word) => ({ text: word.text, startMs: firstSound.toTimeline(word.atVoiceMs) }));
    waiting = [];
    onWords?.({ atMs: getNowMs(), words: fromSound });
    for (const batch of timeline.toBeatWords(fromSound)) messenger.send({ type: 'words', turnId, ...batch });
  };
}

async function readVoice(work: TurnWork): Promise<void> {
  const sendWords = createWordSender(work);
  const { onFirstAudioRead, getNowMs = getSteadyNowMs } = work.options;
  let hasReadAudio = false;
  for await (const chunk of work.stream) {
    if (work.isStopped() || chunk === tts.SynthesizeStream.END_OF_STREAM) break;
    if (!hasReadAudio) onFirstAudioRead?.(getNowMs());
    hasReadAudio = true;
    work.firstSound.noteFrame(chunk.frame);
    sendWords((chunk.timedTranscripts ?? []).map((word) => ({ text: word.text, atVoiceMs: (word.startTime ?? 0) * MS_PER_SECOND })));
    work.frames.push(chunk.frame);
  }
  if (!work.isStopped()) {
    work.firstSound.settle();
    sendWords([]);
  }
  work.frames.finish();
}

async function pumpAudio({ options, frames, firstSound, tracker, lineTurn, noteAudioSent, isStopped }: TurnWork): Promise<void> {
  const { messenger, turnId, proofStalls = [], onFrameCaptured, onGap, getNowMs = getSteadyNowMs } = options;
  const pendingStalls = [...proofStalls];
  let audioMs = 0;
  await lineTurn.opened;
  for (let frame = await frames.next(); frame && !isStopped(); frame = await frames.next()) {
    const stall = pendingStalls[0];
    if (stall && audioMs >= stall.atAudioMs) {
      pendingStalls.shift();
      await delay(stall.ms);
      if (isStopped()) return;
    }
    const gap = tracker.onFrame(getNowMs(), getFrameMs(frame));
    if (gap) {
      const reported = { atMs: firstSound.toTimeline(gap.atMs), ms: Math.max(1, gap.ms) };
      messenger.sendOnBothChannels({ type: 'audioGap', turnId, ...reported });
      onGap?.({ ...reported, reportedAtMs: getNowMs() });
    }
    onFrameCaptured?.({ frame, capturedAtMs: getNowMs() });
    await lineTurn.captureFrame(frame);
    audioMs += getFrameMs(frame);
    noteAudioSent(audioMs);
  }
}

// A voice that ends early would leave the browser waiting for words, so the turn is cut like any other and the log says what was heard.
async function cutIfVoiceEndedEarly({ options: { messenger, turnId }, timeline, isStopped }: TurnWork): Promise<void> {
  if (isStopped() || timeline.isComplete()) return;
  await delay(STILL_ARRIVING_MS);
  if (!isStopped()) messenger.sendOnBothChannels({ type: 'stop', turnId });
}

// Flash and Turbo send word times and audio in one message, so words go out as soon as they are read and the audio queues behind them.
export function speakTurn(options: SpeakTurnOptions): SpokenTurn {
  const { voice, line, messenger, turnId, onGap, getNowMs = getSteadyNowMs } = options;
  const firstSound = createFirstSound();
  const frames = createFrameQueue();
  const stream = voice.stream();
  const timeline = createWordTimeline();
  const lineTurn = line.takeTurn();
  const heldMessenger = createHeldMessenger(messenger);
  let isStopped = false;
  let audioSentMs = 0;
  const tracker = createPlayoutTracker({
    onRanDry({ atMs }) {
      const gap = { atMs: firstSound.toTimeline(atMs) };
      messenger.sendOnBothChannels({ type: 'audioGap', turnId, ...gap });
      onGap?.({ ...gap, reportedAtMs: getNowMs() });
    },
  });
  const work: TurnWork = {
    options: { ...options, messenger: heldMessenger },
    stream,
    timeline,
    frames,
    firstSound,
    tracker,
    lineTurn,
    noteAudioSent(ms) {
      audioSentMs = ms;
    },
    isStopped: () => isStopped,
  };

  heldMessenger.send({ type: 'turnStarted', turnId });
  void lineTurn.opened.then(() => {
    if (!isStopped) heldMessenger.release();
  });
  const finished = Promise.all([writeText(work), readVoice(work), pumpAudio(work)])
    .then(async () => {
      tracker.close();
      if (isStopped) return;
      await lineTurn.waitForPlayout();
      await cutIfVoiceEndedEarly(work);
    })
    .finally(lineTurn.leave);

  return {
    finished,
    getWordMismatches: timeline.getMismatches,
    isVoiceOwing: () => !timeline.isComplete(),
    getWordsSent: () => timeline.getWordsSent(firstSound.toTimeline(audioSentMs)),
    stop() {
      if (isStopped) return;
      isStopped = true;
      if (!heldMessenger.isHolding()) messenger.sendOnBothChannels({ type: 'stop', turnId });
      tracker.close();
      frames.discard();
      lineTurn.cut();
      stream.close();
    },
  };
}
