import type { AudioFrame } from '@livekit/rtc-node';
import { TURN_SILENCE_MS } from '@astra/board';

export interface VoiceOutput {
  sampleRate: number;
  captureFrame(frame: AudioFrame): Promise<void>;
  clearQueue(): void;
  waitForPlayout(): Promise<void>;
}

export interface LineTurn {
  /** Resolves once the turn before has played out and the silence has passed. */
  opened: Promise<void>;
  captureFrame(frame: AudioFrame): Promise<void>;
  waitForPlayout(): Promise<void>;
  /** Drops what is queued, if this turn holds the line, and frees it at once. */
  cut(): void;
  leave(): void;
}

export interface VoiceLine {
  takeTurn(): LineTurn;
}

/** Whole samples per 10 ms is what LiveKit frames in, so any other rate plays slow by the part it drops, 2.27 ms a second at 22050 Hz. */
const SAMPLES_PER_SECOND_STEP = 100;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Monotonic, so a device clock jump is not a one hour stall, and still on the epoch the proof compares with the browser's. */
export const getSteadyNowMs = () => performance.timeOrigin + performance.now();

// The one way into a session's voice track. Each turn's first sound follows the last turn's audio by a silence the probe can see, so the browser never has to guess where a turn starts.
export function createVoiceLine(output: VoiceOutput, { getNowMs = getSteadyNowMs }: { getNowMs?(): number } = {}): VoiceLine {
  if (output.sampleRate % SAMPLES_PER_SECOND_STEP !== 0) throw new Error(`A voice at ${output.sampleRate} Hz would drift, because LiveKit frames 10 ms as whole samples`);
  let lastTurnGone: Promise<void> = Promise.resolve();
  let lastSoundLeftAtMs: number | null = null;

  return {
    takeTurn() {
      const turnBeforeGone = lastTurnGone;
      let markGone = () => {};
      lastTurnGone = new Promise((resolve) => {
        markGone = resolve;
      });
      let holdsLine = false;
      let hasSentSound = false;
      let hasLeft = false;
      const leave = () => {
        if (hasLeft) return;
        hasLeft = true;
        if (hasSentSound) lastSoundLeftAtMs = getNowMs();
        markGone();
      };
      const opened = turnBeforeGone.then(async () => {
        const waitMs = lastSoundLeftAtMs === null ? 0 : lastSoundLeftAtMs + TURN_SILENCE_MS - getNowMs();
        if (waitMs > 0) await delay(waitMs);
        holdsLine = !hasLeft;
      });
      return {
        opened,
        leave,
        captureFrame(frame) {
          hasSentSound = true;
          return output.captureFrame(frame);
        },
        waitForPlayout: () => output.waitForPlayout(),
        cut() {
          if (holdsLine) output.clearQueue();
          leave();
        },
      };
    },
  };
}
