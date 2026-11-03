import { WebSocket } from 'ws';

export interface RawVoiceMessage {
  atMs: number;
  contextId: string | null;
  audioBytes: number;
  isFinal: boolean;
  chars: string[];
  startsMs: number[];
}

export interface VendorTap {
  messages: RawVoiceMessage[];
  /** Whatever the socket said on opening, including `character-cost` if the vendor sends it. */
  upgradeHeaders: Record<string, string | string[] | undefined>[];
}

// Proof runs only. Reads what the vendor really sent beneath the plugin, because the plugin rewrites word times and hides the first word's offset.
export function tapVendorSocket(): VendorTap {
  const tap: VendorTap = { messages: [], upgradeHeaders: [] };
  const emit = WebSocket.prototype.emit;
  WebSocket.prototype.emit = function (this: WebSocket, event: string, ...args: unknown[]) {
    if (event === 'upgrade') tap.upgradeHeaders.push((args[0] as { headers: Record<string, string | string[] | undefined> }).headers);
    if (event === 'message') {
      const data = JSON.parse(String(args[0])) as { contextId?: string; context_id?: string; audio?: string; isFinal?: boolean; alignment?: { chars?: string[]; charStartTimesMs?: number[]; charsStartTimesMs?: number[] } };
      tap.messages.push({
        atMs: Date.now(),
        contextId: data.contextId ?? data.context_id ?? null,
        audioBytes: data.audio ? Buffer.byteLength(data.audio, 'base64') : 0,
        isFinal: Boolean(data.isFinal),
        chars: data.alignment?.chars ?? [],
        startsMs: data.alignment?.charStartTimesMs ?? data.alignment?.charsStartTimesMs ?? [],
      });
    }
    return emit.call(this, event, ...args);
  } as typeof emit;
  return tap;
}
