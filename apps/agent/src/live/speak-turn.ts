import { tts } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, getBeatText, getCues, getSpokenWords, type TimedWord, type TurnId } from '@astra/contracts';
import { createPlayoutTracker, type PlayoutTracker } from '@astra/board';
import { createWordTimeline } from './word-timeline.ts';

/** The same level the browser's probe calls audible, so both sides agree where the first sound is. */
const AUDIBLE_SAMPLE = 328;
const MS_PER_SECOND = 1000;
/** Audio handed over is still on its way to the student for about this long. */
const STILL_ARRIVING_MS = 300;

interface VoiceWord {
  text: string;
  startSeconds: number;
}

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

function getFrameMs(frame: AudioFrame): number {
  return (frame.samplesPerChannel / frame.sampleRate) * MS_PER_SECOND;
}

function findFirstAudibleMs(frame: AudioFrame): number | null {
  const index = frame.data.findIndex((sample) => Math.abs(sample) >= AUDIBLE_SAMPLE);
  return index < 0 ? null : (index / frame.sampleRate) * MS_PER_SECOND;
}

// Word times and audio arrive in one message on Flash and Turbo, so words go out the moment they are read and the audio waits its turn behind them.
export function speakTurn(options: SpeakTurnOptions): SpokenTurn {
  const { voice, output, messenger, turnId, beats, textPace, stalls = [], onFrameCaptured, onWords, onGap, getNowMs = Date.now } = options;
  const stream = voice.stream();
  const timeline = createWordTimeline(beats);
  const frames: AudioFrame[] = [];
  let isStopped = false;
  let isVoiceDone = false;
  let wakePump: (() => void) | null = null;
  let leadingSilenceMs: number | null = null;
  let silentAudioReadMs = 0;
  let wordsAwaitingZero: VoiceWord[] = [];

  /** Word times count from sample 0, and the contract and the browser's clock count from the first audible sample. */
  const toTimeline = (atMs: number) => Math.max(0, Math.round(atMs - (leadingSilenceMs ?? silentAudioReadMs)));
  const tracker: PlayoutTracker = createPlayoutTracker({
    onRanDry: ({ atMs }) => {
      const gap = { atMs: toTimeline(atMs) };
      messenger.sendOnBothChannels({ type: 'audioGap', turnId, ...gap });
      onGap?.({ ...gap, reportedAtMs: getNowMs() });
    },
  });

  const writeBeat = async (beat: Beat) => {
    const words = getSpokenWords(getBeatText(beat));
    const cues = getCues(beat);
    for (const [wordIndex, word] of words.entries()) {
      if (isStopped) return;
      const cuesHere = cues.filter((cue) => cue.atWord === wordIndex);
      if (textPace?.flushBeforeCues && cuesHere.length > 0) stream.flush();
      for (const cue of cuesHere) messenger.send({ type: 'cue', turnId, beatId: beat.id, atWord: cue.atWord, command: cue.command });
      stream.pushText(`${word} `);
      if (textPace) await delay(textPace.msPerWord);
    }
    if (isStopped) return;
    stream.flush();
    messenger.send({ type: 'beatClosed', turnId, beatId: beat.id, wordCount: words.length, expectsReply: beat.expectsReply });
  };

  const writeText = async () => {
    for (const beat of beats) await writeBeat(beat);
    if (!isStopped) stream.endInput();
  };

  const noteLeadingSilence = (frame: AudioFrame) => {
    if (leadingSilenceMs !== null) return;
    const firstAudibleMs = findFirstAudibleMs(frame);
    if (firstAudibleMs === null) silentAudioReadMs += getFrameMs(frame);
    else leadingSilenceMs = silentAudioReadMs + firstAudibleMs;
  };

  const sendWords = (voiceWords: readonly VoiceWord[]) => {
    wordsAwaitingZero.push(...voiceWords);
    if (leadingSilenceMs === null || wordsAwaitingZero.length === 0) return;
    const fromSound = wordsAwaitingZero.map((word) => ({ text: word.text, startMs: toTimeline(word.startSeconds * MS_PER_SECOND) }));
    onWords?.({ atMs: getNowMs(), words: fromSound });
    for (const batch of timeline.toBeatWords(fromSound)) messenger.send({ type: 'words', turnId, ...batch });
    wordsAwaitingZero = [];
  };

  const readVoice = async () => {
    for await (const chunk of stream) {
      if (isStopped || chunk === tts.SynthesizeStream.END_OF_STREAM) break;
      noteLeadingSilence(chunk.frame);
      sendWords((chunk.timedTranscripts ?? []).map((word) => ({ text: word.text, startSeconds: word.startTime ?? 0 })));
      frames.push(chunk.frame);
      wakePump?.();
    }
    if (!isStopped) {
      leadingSilenceMs ??= silentAudioReadMs;
      sendWords([]);
    }
    isVoiceDone = true;
    wakePump?.();
  };

  const nextFrame = async (): Promise<AudioFrame | null> => {
    while (frames.length === 0) {
      if (isVoiceDone || isStopped) return null;
      await new Promise<void>((resolve) => {
        wakePump = resolve;
      });
    }
    return frames.shift() ?? null;
  };

  const pumpAudio = async () => {
    let audioMs = 0;
    const pendingStalls = [...stalls];
    for (let frame = await nextFrame(); frame && !isStopped; frame = await nextFrame()) {
      const stall = pendingStalls[0];
      if (stall && audioMs >= stall.atAudioMs) {
        pendingStalls.shift();
        await delay(stall.ms);
        if (isStopped) return;
      }
      const gap = tracker.onFrame(getNowMs(), getFrameMs(frame));
      if (gap) {
        const reported = { atMs: toTimeline(gap.atMs), ms: Math.max(1, gap.ms) };
        messenger.sendOnBothChannels({ type: 'audioGap', turnId, ...reported });
        onGap?.({ ...reported, reportedAtMs: getNowMs() });
      }
      onFrameCaptured?.({ frame, capturedAtMs: getNowMs() });
      await output.captureFrame(frame);
      audioMs += getFrameMs(frame);
    }
    tracker.close();
  };

  messenger.send({ type: 'turnStarted', turnId });
  // A voice that ends early would leave the browser waiting for words that never come, so it is cut like any other turn and the log says what was heard.
  const endEarlyIfNeeded = async () => {
    if (isStopped || timeline.isComplete()) return;
    await output.waitForPlayout();
    await delay(STILL_ARRIVING_MS);
    if (!isStopped) messenger.sendOnBothChannels({ type: 'stop', turnId });
  };

  const finished = Promise.all([writeText(), readVoice(), pumpAudio()]).then(async () => {
    tracker.close();
    await endEarlyIfNeeded();
  });

  return {
    finished,
    getWordMismatches: timeline.getMismatches,
    stop() {
      if (isStopped) return;
      isStopped = true;
      messenger.sendOnBothChannels({ type: 'stop', turnId });
      tracker.close();
      frames.length = 0;
      output.clearQueue();
      stream.close();
      wakePump?.();
    },
  };
}
