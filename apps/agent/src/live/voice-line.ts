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
  /** Leaves, and drops what is queued unless a later turn has opened, because then the queue is that turn's. */
  cut(): void;
  leave(): void;
}

export interface VoiceLine {
  takeTurn(): LineTurn;
}

/** LiveKit frames audio in 10 ms of whole samples, so any other rate plays slow by the part it drops, 2.27 ms a second at 22050 Hz. */
const FRAMES_PER_SECOND = 100;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Monotonic, so a device clock jump is not a one hour stall, and still on the epoch the proof compares with the browser's. */
export const getSteadyNowMs = () => performance.timeOrigin + performance.now();

// The one way into a session's voice track. Each turn's first sound follows the last turn's audio by a silence the probe can see, so the browser never has to guess where a turn starts.
export function createVoiceLine(output: VoiceOutput, { getNowMs = getSteadyNowMs }: { getNowMs?(): number } = {}): VoiceLine {
  if (output.sampleRate % FRAMES_PER_SECOND !== 0) throw new Error(`A voice at ${output.sampleRate} Hz would drift, because LiveKit frames 10 ms as whole samples`);
  let lastTurnGone: Promise<void> = Promise.resolve();
  let lastSoundLeftAtMs: number | null = null;
  let lastOpenedTurn: LineTurn | null = null;

  return {
    takeTurn() {
      const turnBeforeGone = lastTurnGone;
      let markGone = () => {};
      lastTurnGone = new Promise((resolve) => {
        markGone = resolve;
      });
      let hasSentSound = false;
      let hasLeft = false;
      const leave = () => {
        if (hasLeft) return;
        hasLeft = true;
        if (hasSentSound) lastSoundLeftAtMs = getNowMs();
        // A turn stopped in the queue leaves early, and the line stays taken until the turn before it has gone.
        void turnBeforeGone.then(markGone);
      };
      const opened = turnBeforeGone.then(async () => {
        const waitMs = lastSoundLeftAtMs === null ? 0 : lastSoundLeftAtMs + TURN_SILENCE_MS - getNowMs();
        if (waitMs > 0) await delay(waitMs);
        if (!hasLeft) lastOpenedTurn = turn;
      });
      const turn: LineTurn = {
        opened,
        leave,
        captureFrame(frame) {
          hasSentSound = true;
          return output.captureFrame(frame);
        },
        waitForPlayout: () => output.waitForPlayout(),
        cut() {
          leave();
          if (lastOpenedTurn !== turn) return;
          try {
            output.clearQueue();
          } catch {
            // A closed source throws here, and it has no queue left to clear.
          }
        },
      };
      return turn;
    },
  };
}
