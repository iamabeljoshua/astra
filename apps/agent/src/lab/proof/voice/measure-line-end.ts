import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { WebSocket } from 'ws';
import { readKey } from '../../../keys.ts';
import { MUSE_MODEL } from '../../../providers/meta.ts';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/hold-line-end' }, clips: { type: 'string', default: '10' }, noise: { type: 'string', default: '0' } } });

const SPEECH_FOLDER = '/Users/abel/.claude/orchestrate/astra-mvp/vendor-test/speech';
const VOICE = 'say-samantha';
const SAMPLE_RATE = 24_000;
const PACKET_MS = 80;
const PACKET_BYTES = (SAMPLE_RATE * 2 * PACKET_MS) / 1000;
const GIVE_UP_MS = 12_000;

type Mode = 'endpointingSilence' | 'endpointingEndStream' | 'pushToTalkEndStream';
const MODES: Mode[] = ['endpointingSilence', 'endpointingEndStream', 'pushToTalkEndStream'];

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

function addNoise(pcm: Buffer, level: number): Buffer {
  if (level === 0) return pcm;
  const noisy = Buffer.from(pcm);
  for (let offset = 0; offset + 1 < noisy.length; offset += 2) {
    const sample = noisy.readInt16LE(offset) + (Math.random() * 2 - 1) * level * 32768;
    noisy.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), offset);
  }
  return noisy;
}

function makeRoomTone(bytes: number, level: number): Buffer {
  return addNoise(Buffer.alloc(bytes), level);
}

interface Run {
  mode: Mode;
  clip: string;
  said: string;
  heard: string | null;
  handshakeMs: number;
  /** From the last sound of the clip, the moment a student's finger would come up. */
  finalAfterLastSoundMs: number | null;
  closeCode: number | null;
}

// One clip through one raw Muse socket. Sends only the sound up to the clip's last word, as a key lifted on that word would.
async function runClip({ mode, clip, said, lastMs, pcm, noiseLevel }: { mode: Mode; clip: string; said: string; lastMs: number; pcm: Buffer; noiseLevel: number }): Promise<Run> {
  const openedAtMs = Date.now();
  const socket = new WebSocket('wss://api.meta.ai/v1/asr/realtime');
  const handshake = { mode: mode === 'pushToTalkEndStream' ? 'PUSH_TO_TALK' : 'ENDPOINTING', authorization: { accessToken: `Bearer ${readKey('META_API_KEY')}` }, audioEncoding: 'PCM_24KHZ', model: MUSE_MODEL, partialMode: 'CUMULATIVE', languageBias: ['English'] };
  let handshakeMs = 0;
  let lastSoundAtMs = 0;
  let finalAtMs: number | null = null;
  let heard: string | null = null;
  let closeCode: number | null = null;
  const isDone = new Promise<void>((done) => {
    socket.on('close', (code) => {
      closeCode = code;
      done();
    });
    socket.on('error', () => done());
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as { type?: string; transcript?: string; final?: boolean; sessionId?: string };
      if (message.sessionId && !handshakeMs) handshakeMs = Date.now() - openedAtMs;
      const isFinal = message.type === 'speechComplete' || (message.type === 'transcript' && message.final === true);
      if (isFinal && finalAtMs === null && message.transcript) {
        finalAtMs = Date.now();
        heard = message.transcript;
        socket.close();
        done();
      }
    });
  });
  await new Promise((done) => socket.once('open', done));
  socket.send(JSON.stringify(handshake));
  while (!handshakeMs && Date.now() - openedAtMs < GIVE_UP_MS) await delay(5);
  const lineBytes = Math.min(pcm.length, Math.floor((lastMs * SAMPLE_RATE * 2) / 1000 / 2) * 2);
  const startedAtMs = Date.now();
  for (let offset = 0; offset < lineBytes; offset += PACKET_BYTES) {
    socket.send(pcm.subarray(offset, Math.min(offset + PACKET_BYTES, lineBytes)));
    const nextAtMs = startedAtMs + ((offset + PACKET_BYTES) / PACKET_BYTES) * PACKET_MS;
    await delay(Math.max(0, nextAtMs - Date.now()));
  }
  lastSoundAtMs = Date.now();
  if (mode !== 'endpointingSilence') socket.send('{"type":"endStream"}');
  while (mode === 'endpointingSilence' && finalAtMs === null && socket.readyState === WebSocket.OPEN && Date.now() - lastSoundAtMs < GIVE_UP_MS) {
    socket.send(makeRoomTone(PACKET_BYTES, noiseLevel));
    await delay(PACKET_MS);
  }
  await Promise.race([isDone, delay(GIVE_UP_MS)]);
  if (socket.readyState === WebSocket.OPEN) socket.close();
  return { mode, clip, said, heard, handshakeMs, finalAfterLastSoundMs: finalAtMs === null ? null : finalAtMs - lastSoundAtMs, closeCode };
}

function getPercentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] as number;
}

async function main(): Promise<void> {
  const out = args.out as string;
  mkdirSync(out, { recursive: true });
  const noiseLevel = Number(args.noise);
  const manifest = (JSON.parse(readFileSync(join(SPEECH_FOLDER, 'manifest.json'), 'utf8')) as Record<string, Record<string, { text: string; lastMs: number }>>)[VOICE] ?? {};
  const clips = Object.entries(manifest).slice(0, Number(args.clips));
  const runs: Run[] = [];
  for (const [clip, { text, lastMs }] of clips) {
    const pcm = addNoise(readFileSync(join(SPEECH_FOLDER, VOICE, `${clip}.pcm`)), noiseLevel);
    for (const mode of MODES) {
      const run = await runClip({ mode, clip, said: text, lastMs, pcm, noiseLevel });
      runs.push(run);
      console.log(JSON.stringify(run));
    }
  }
  const summary = MODES.map((mode) => {
    const ofMode = runs.filter((run) => run.mode === mode);
    const finals = ofMode.flatMap((run) => (run.finalAfterLastSoundMs === null ? [] : [run.finalAfterLastSoundMs])).sort((a, b) => a - b);
    const handshakes = ofMode.map((run) => run.handshakeMs).sort((a, b) => a - b);
    return { mode, runs: ofMode.length, withFinal: finals.length, finalP50: getPercentile(finals, 0.5), finalP95: getPercentile(finals, 0.95), finalWorst: finals.at(-1) ?? null, handshakeP50: getPercentile(handshakes, 0.5) };
  });
  console.log(JSON.stringify(summary, null, 1));
  writeFileSync(join(out, `line-end-noise-${noiseLevel}.json`), `${JSON.stringify({ noiseLevel, summary, runs }, null, 1)}\n`);
}

await main();
