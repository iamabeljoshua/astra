import type { AudioFrame } from '@livekit/rtc-node';

export interface FrameQueue {
  push(frame: AudioFrame): void;
  finish(): void;
  discard(): void;
  next(): Promise<AudioFrame | null>;
}

// Lets the voice reader send words at once, without waiting on the slower side that plays the audio.
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
