import type { AudioFrame } from '@livekit/rtc-node';

export interface FrameQueue {
  push(frame: AudioFrame): void;
  /** No more frames are coming. */
  finish(): void;
  /** Drops what is waiting and ends the queue. */
  discard(): void;
  next(): Promise<AudioFrame | null>;
}

// Words go out the moment the voice gives them, so reading from the voice never waits for the slow side that plays the audio.
export function createFrameQueue(): FrameQueue {
  const frames: AudioFrame[] = [];
  let isFinished = false;
  let wake: (() => void) | null = null;
  return {
    push(frame) {
      frames.push(frame);
      wake?.();
    },
    finish() {
      isFinished = true;
      wake?.();
    },
    discard() {
      frames.length = 0;
      isFinished = true;
      wake?.();
    },
    async next() {
      while (frames.length === 0) {
        if (isFinished) return null;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      return frames.shift() ?? null;
    },
  };
}
