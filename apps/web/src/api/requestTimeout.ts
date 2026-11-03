import { getApiErrorFromThrown, REQUEST_TIME_LIMIT_REACHED } from './apiError';

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
// setTimeout reads its delay as a 32-bit integer, so a longer one, such as Infinity, would fire too soon.
const LONGEST_TIMER_DELAY_MS = 2 ** 31 - 1;

interface RequestLimits {
  timeoutMs: number;
  callerSignal: AbortSignal | null | undefined;
}

// Races the whole request, because a step that ignores its signal, such as a hung middleware, would otherwise never end.
export async function sendWithTimeout<Answer>(
  send: (signal: AbortSignal) => Promise<Answer>,
  { timeoutMs, callerSignal }: RequestLimits,
) {
  const controller = new AbortController();
  const stopForCaller = () => controller.abort(callerSignal?.reason);
  const stopped = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
  });
  const timer = setTimeout(() => controller.abort(REQUEST_TIME_LIMIT_REACHED), Math.min(timeoutMs, LONGEST_TIMER_DELAY_MS));
  callerSignal?.addEventListener('abort', stopForCaller, { once: true });
  if (callerSignal?.aborted) stopForCaller();

  try {
    return await Promise.race([send(controller.signal), stopped]);
  } catch (thrown) {
    throw getApiErrorFromThrown(thrown, controller.signal);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', stopForCaller);
  }
}
