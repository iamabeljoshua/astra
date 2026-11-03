import { tts } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, getBeatText, getCues, getSpokenWords, type TimedWord, type TurnId } from '@astra/contracts';
import { createPlayoutTracker, type PlayoutTracker } from '@astra/board';
import { createFirstSound, type FirstSound, getFrameMs } from './first-sound.ts';
import { createFrameQueue, type FrameQueue } from './frame-queue.ts';
import { createWordTimeline } from './word-timeline.ts';

const MS_PER_SECOND = 1000;
/** Audio handed over is still on its way to the student for about this long. */
const STILL_ARRIVING_MS = 300;

export interface VoiceOutput {
  captureFrame(frame: AudioFrame): Promise<void>;
  clearQueue(): void;
  waitForPlayout(): Promise<void>;
}

export interface TurnMessenger {
  send(message: AgentMessage): void;
  /** For what must get there even if a packet is lost: `stop`, `yield`, and `audioGap`. */
  sendOnBothChannels(message: AgentMessage): void;
}

/** Writes text as a model would, for the runs that measure real stalls. With none, a beat goes to the voice whole. */
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
  output: VoiceOutput;
  messenger: TurnMessenger;
  turnId: TurnId;
  beats: readonly Beat[];
  textPace?: TextPace;
  /** For proof runs: holds the audio back once it reaches `atAudioMs`, as a voice falling behind does. */
  stalls?: readonly { atAudioMs: number; ms: number }[];
  onFrameCaptured?(note: FrameNote): void;
  onWords?(words: { atMs: number; words: TimedWord[] }): void;
  onGap?(gap: { atMs: number; ms?: number; reportedAtMs: number }): void;
  getNowMs?(): number;
}

export interface SpokenTurn {
  finished: Promise<void>;
  stop(): void;
  getWordMismatches(): { ours: string; theirs: string }[];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TurnWork {
  options: SpeakTurnOptions;
  stream: tts.SynthesizeStream;
  timeline: ReturnType<typeof createWordTimeline>;
  frames: FrameQueue;
  firstSound: FirstSound;
  tracker: PlayoutTracker;
  isStopped(): boolean;
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
  for (const beat of work.options.beats) await writeBeat(work, beat);
  if (!work.isStopped()) work.stream.endInput();
}

// Holds the turn's first word times until the first sound is known, because they count from it.
function createWordSender({ options: { messenger, turnId, onWords, getNowMs = Date.now }, timeline, firstSound }: TurnWork) {
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
  for await (const chunk of work.stream) {
    if (work.isStopped() || chunk === tts.SynthesizeStream.END_OF_STREAM) break;
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

async function pumpAudio({ options, frames, firstSound, tracker, isStopped }: TurnWork): Promise<void> {
  const { output, messenger, turnId, stalls = [], onFrameCaptured, onGap, getNowMs = Date.now } = options;
  const pendingStalls = [...stalls];
  let audioMs = 0;
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
    await output.captureFrame(frame);
    audioMs += getFrameMs(frame);
  }
}

// A voice that ends early would leave the browser waiting for words that never come, so it is cut like any other turn and the log says what was heard.
async function cutIfVoiceEndedEarly({ options: { output, messenger, turnId }, timeline, isStopped }: TurnWork): Promise<void> {
  if (isStopped() || timeline.isComplete()) return;
  await output.waitForPlayout();
  await delay(STILL_ARRIVING_MS);
  if (!isStopped()) messenger.sendOnBothChannels({ type: 'stop', turnId });
}

// Word times and audio arrive in one message on Flash and Turbo, so words go out the moment they are read and the audio waits its turn behind them.
export function speakTurn(options: SpeakTurnOptions): SpokenTurn {
  const { voice, output, messenger, turnId, beats, onGap, getNowMs = Date.now } = options;
  const firstSound = createFirstSound();
  const frames = createFrameQueue();
  const stream = voice.stream();
  const timeline = createWordTimeline(beats);
  let isStopped = false;
  const tracker = createPlayoutTracker({
    onRanDry({ atMs }) {
      const gap = { atMs: firstSound.toTimeline(atMs) };
      messenger.sendOnBothChannels({ type: 'audioGap', turnId, ...gap });
      onGap?.({ ...gap, reportedAtMs: getNowMs() });
    },
  });
  const work: TurnWork = { options, stream, timeline, frames, firstSound, tracker, isStopped: () => isStopped };

  messenger.send({ type: 'turnStarted', turnId });
  const finished = Promise.all([writeText(work), readVoice(work), pumpAudio(work)]).then(async () => {
    tracker.close();
    await cutIfVoiceEndedEarly(work);
  });

  return {
    finished,
    getWordMismatches: timeline.getMismatches,
    stop() {
      if (isStopped) return;
      isStopped = true;
      messenger.sendOnBothChannels({ type: 'stop', turnId });
      tracker.close();
      frames.discard();
      output.clearQueue();
      stream.close();
    },
  };
}
