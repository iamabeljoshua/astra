import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

const WORD_MS = 240;
const FIRST_CHARACTER_MS = 81;
const CHARACTER_MS = 20;
const WORDS_PER_MESSAGE = 3;
const BETWEEN_MESSAGES_MS = 10;
const AMPLITUDE = 12000;
const TONE_HZ = 700;

export interface FakeWireOptions {
  leadingSilenceMs?: number;
}

export interface FakeWire {
  baseURL: string;
  getConnectionCount(): number;
  getMessagesAfterClose(): number;
  getOutputFormats(): string[];
  /** Each `voice_settings` the client sent, as it arrived. */
  getVoiceSettings(): unknown[];
  close(): Promise<void>;
}

interface Alignment {
  chars: string[];
  charStartTimesMs: number[];
  charDurationsMs: number[];
}

interface ContextState {
  id: string;
  cursorMs: number;
  isStarted: boolean;
  isClosed: boolean;
  queue: Promise<void>;
}

function renderSamples(ms: number, isSilent: boolean, sampleRate: number): Buffer {
  const count = Math.round((ms / 1000) * sampleRate);
  const samples = new Int16Array(count);
  if (!isSilent) for (let index = 0; index < count; index++) samples[index] = Math.round(AMPLITUDE * Math.sin((2 * Math.PI * TONE_HZ * index) / sampleRate));
  return Buffer.from(samples.buffer);
}

// Alignment comes in the same message as its audio, as real Flash and Turbo send it, and the first character starts at 0 however much silence leads.
function alignWords(words: string[], startMs: number): Alignment {
  const alignment: Alignment = { chars: [], charStartTimesMs: [], charDurationsMs: [] };
  words.forEach((word, wordIndex) => {
    const wordStartMs = startMs + wordIndex * WORD_MS;
    [...`${word} `].forEach((char, charIndex) => {
      const isVeryFirst = startMs === 0 && wordIndex === 0;
      const atMs = isVeryFirst ? (charIndex === 0 ? 0 : FIRST_CHARACTER_MS + (charIndex - 1) * CHARACTER_MS) : wordStartMs + charIndex * CHARACTER_MS;
      alignment.chars.push(char);
      alignment.charStartTimesMs.push(atMs);
      alignment.charDurationsMs.push(CHARACTER_MS);
    });
  });
  return alignment;
}

function speakContext({ socket, context, text, leadingSilenceMs, sampleRate, onSentAfterClose }: { socket: WebSocket; context: ContextState; text: string; leadingSilenceMs: number; sampleRate: number; onSentAfterClose: () => void }): void {
  const words = text.split(/\s+/).filter(Boolean);
  for (let offset = 0; offset < words.length; offset += WORDS_PER_MESSAGE) {
    const piece = words.slice(offset, offset + WORDS_PER_MESSAGE);
    context.queue = context.queue.then(async () => {
      await new Promise((done) => setTimeout(done, BETWEEN_MESSAGES_MS));
      if (socket.readyState !== socket.OPEN) return;
      const lead = context.isStarted ? 0 : leadingSilenceMs;
      const audio = Buffer.concat([renderSamples(lead, true, sampleRate), renderSamples(piece.length * WORD_MS, false, sampleRate)]);
      const startMs = context.cursorMs;
      context.isStarted = true;
      context.cursorMs += lead + piece.length * WORD_MS;
      socket.send(JSON.stringify({ contextId: context.id, audio: audio.toString('base64'), alignment: alignWords(piece, startMs), normalizedAlignment: alignWords(piece, startMs) }));
      if (context.isClosed) onSentAfterClose();
    });
  }
}

/** Speaks the wire of ElevenLabs' multi-stream socket, with a tone per word. It keeps sending after `close_context`, as the real one does. */
export async function startFakeElevenLabsWire({ leadingSilenceMs = 0 }: FakeWireOptions = {}): Promise<FakeWire> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((done) => server.once('listening', done));
  let connections = 0;
  let messagesAfterClose = 0;
  const outputFormats: string[] = [];
  const voiceSettings: unknown[] = [];
  server.on('connection', (socket, request) => {
    connections += 1;
    const outputFormat = new URL(request.url ?? '', 'ws://wire').searchParams.get('output_format') ?? '';
    outputFormats.push(outputFormat);
    const sampleRate = Number(outputFormat.split('_')[1]);
    const contexts = new Map<string, ContextState>();
    socket.on('message', (raw) => {
      const packet = JSON.parse(String(raw)) as { context_id: string; text?: string; close_context?: boolean; voice_settings?: unknown };
      if (packet.voice_settings) voiceSettings.push(packet.voice_settings);
      const context = contexts.get(packet.context_id) ?? { id: packet.context_id, cursorMs: 0, isStarted: false, isClosed: false, queue: Promise.resolve() };
      contexts.set(packet.context_id, context);
      if (packet.close_context) {
        context.isClosed = true;
        context.queue = context.queue.then(() => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ contextId: context.id, isFinal: true }));
        });
      } else if (packet.text?.trim()) {
        speakContext({ socket, context, text: packet.text, leadingSilenceMs, sampleRate, onSentAfterClose: () => (messagesAfterClose += 1) });
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    getConnectionCount: () => connections,
    getMessagesAfterClose: () => messagesAfterClose,
    getOutputFormats: () => outputFormats,
    getVoiceSettings: () => voiceSettings,
    close: () =>
      new Promise((done) => {
        for (const client of server.clients) client.terminate();
        server.close(() => done());
      }),
  };
}
