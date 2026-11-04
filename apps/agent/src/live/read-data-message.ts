import type { ParseResult } from '@astra/contracts';

const decoder = new TextDecoder();

// The room's data channel is the one thing a browser can send the agent, so a broken message is refused here and never throws.
export function readDataMessage(payload: Uint8Array): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(decoder.decode(payload)) as unknown };
  } catch {
    return { ok: false, problem: 'message: expected JSON' };
  }
}
