import { clipTypedText } from '@astra/contracts';

/** Three quick messages are a student thinking aloud, and past that each one costs a request nobody hears. */
export const TYPED_LIMITS = { burst: 3, refillEveryMs: 2000 };

export interface TypedGateOptions {
  getNowMs(): number;
  onRelease(text: string): void;
  onHeld(): void;
  limits?: typeof TYPED_LIMITS;
}

// A token bucket that holds what comes too fast and sends it together, so a flood costs one request every two seconds and no words are lost.
export function createTypedGate({ getNowMs, onRelease, onHeld, limits = TYPED_LIMITS }: TypedGateOptions) {
  let tokens = limits.burst;
  let refilledAtMs = getNowMs();
  let held: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const refill = () => {
    const earned = Math.floor((getNowMs() - refilledAtMs) / limits.refillEveryMs);
    if (earned === 0) return;
    tokens = Math.min(limits.burst, tokens + earned);
    refilledAtMs += earned * limits.refillEveryMs;
  };

  const releaseHeld = () => {
    refill();
    if (held === null || tokens < 1) return;
    const text = held;
    held = null;
    tokens -= 1;
    onRelease(text);
  };

  return {
    offer(text: string) {
      refill();
      if (held === null && tokens >= 1) {
        tokens -= 1;
        onRelease(text);
        return;
      }
      onHeld();
      held = clipTypedText(held === null ? text : `${held}\n${text}`);
      clearTimeout(timer);
      timer = setTimeout(releaseHeld, Math.max(0, refilledAtMs + limits.refillEveryMs - getNowMs()));
    },
    close() {
      clearTimeout(timer);
    },
  };
}
