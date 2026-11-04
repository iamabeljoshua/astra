/** Far above what a real page sends, which is one report a beat and a student's drawing. A tab can only hurt itself by passing it. */
export const MESSAGE_LIMITS = { burst: 200, refillEveryMs: 20 };

// A token bucket for data messages, because a browser can forge them as fast as it can send, and each one costs work and a line in the log.
export function createMessageGate({ getNowMs, limits = MESSAGE_LIMITS }: { getNowMs(): number; limits?: typeof MESSAGE_LIMITS }) {
  let tokens = limits.burst;
  let refilledAtMs = getNowMs();
  return {
    take(): boolean {
      const earned = Math.floor((getNowMs() - refilledAtMs) / limits.refillEveryMs);
      if (earned > 0) {
        tokens = Math.min(limits.burst, tokens + earned);
        refilledAtMs += earned * limits.refillEveryMs;
      }
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
