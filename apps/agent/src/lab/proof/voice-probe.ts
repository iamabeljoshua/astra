import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { initializeLogger, tts } from '@livekit/agents';
import { makeElevenLabsVoice } from '../../providers/elevenlabs.ts';
import { makeTutorVoice, TUTOR_VOICE_ID } from '../../providers/choose.ts';
import { readKey } from '../keys.ts';
import { OVERLONG_LINE, STOCK_PHRASE } from '../lesson.ts';
import { getPercentiles } from './analyse-run.ts';
import { createOverlongWatch } from './overlong-watch.ts';
import { tapVendorSocket } from './vendor-tap.ts';

const CREDITS_PER_CHARACTER = 0.22;
const SAMPLE_RATE = 22050;
const MS_PER_SECOND = 1000;
const OVERLONG_RATIO = 2;

const { values: args } = parseArgs({
  options: {
    job: { type: 'string' },
    model: { type: 'string', default: 'eleven_flash_v2_5' },
    voiceId: { type: 'string' },
    count: { type: 'string', default: '20' },
    out: { type: 'string', default: '/tmp/m3-2-voice' },
    text: { type: 'string' },
    msPerCharacter: { type: 'string', default: '65' },
  },
});

initializeLogger({ pretty: false, level: 'warn' });
const apiKey = readKey('ELEVENLABS_API_KEY');
const model = args.model as string;
const out = args.out as string;
mkdirSync(out, { recursive: true });

const makeVoice = () => (args.voiceId ? makeElevenLabsVoice({ name: 'other', apiKey, voiceId: args.voiceId, model }) : makeTutorVoice({ apiKey, model })).makeTts();

interface HeardLine {
  firstFrameMs: number;
  audioMs: number;
  wordsEndMs: number;
  overlongAtAudioMs: number | null;
  overlongAtMs: number | null;
  pcm: Int16Array[];
  words: { text: string; startMs: number }[];
}

async function speakLine(voice: tts.TTS, text: string): Promise<HeardLine> {
  const watch = createOverlongWatch({ typicalMsPerCharacter: Number(args.msPerCharacter) });
  const startedAtMs = performance.now();
  const stream = voice.stream();
  stream.pushText(`${text} `);
  stream.flush();
  stream.endInput();
  const line: HeardLine = { firstFrameMs: 0, audioMs: 0, wordsEndMs: 0, overlongAtAudioMs: null, overlongAtMs: null, pcm: [], words: [] };
  let charactersAligned = 0;
  for await (const chunk of stream) {
    if (chunk === tts.SynthesizeStream.END_OF_STREAM) break;
    if (line.pcm.length === 0) line.firstFrameMs = performance.now() - startedAtMs;
    line.pcm.push(chunk.frame.data);
    line.audioMs += (chunk.frame.samplesPerChannel / chunk.frame.sampleRate) * MS_PER_SECOND;
    for (const word of chunk.timedTranscripts ?? []) {
      charactersAligned += word.text.length;
      line.words.push({ text: word.text.trim(), startMs: Math.round((word.startTime ?? 0) * MS_PER_SECOND) });
      line.wordsEndMs = (word.endTime ?? 0) * MS_PER_SECOND;
    }
    if (line.overlongAtAudioMs === null && watch.isOverlong(line.audioMs, Math.max(charactersAligned, 1))) {
      line.overlongAtAudioMs = line.audioMs;
      line.overlongAtMs = performance.now() - startedAtMs;
    }
  }
  return line;
}

function writeWav(name: string, chunks: Int16Array[]): void {
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes.length, 40);
  writeFileSync(join(out, name), Buffer.concat([header, bytes]));
}

function saveResult(name: string, result: object): void {
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(result, null, 1)}\n`);
  console.log(name, JSON.stringify(result).slice(0, 1500));
}

// Repeats one line on the real path and asks whether the live watch would have caught the takes that ran long.
async function checkOverlong(): Promise<void> {
  const count = Number(args.count);
  const text = args.text ?? OVERLONG_LINE;
  const voice = makeVoice();
  voice.prewarm();
  const rows = [];
  for (let attempt = 0; attempt < count; attempt += 1) {
    const line = await speakLine(voice, text);
    rows.push({ audioMs: Math.round(line.audioMs), wordsEndMs: Math.round(line.wordsEndMs), firstFrameMs: Math.round(line.firstFrameMs), overlongAtAudioMs: line.overlongAtAudioMs && Math.round(line.overlongAtAudioMs), overlongAtMs: line.overlongAtMs && Math.round(line.overlongAtMs) });
    if (rows.length === 1 || line.audioMs > (rows[0]?.audioMs ?? 0) * 1.6) writeWav(`overlong-${model}-${attempt}.wav`, line.pcm);
  }
  await voice.close();
  const medianMs = getPercentiles(rows.map((row) => row.audioMs)).p50 ?? 0;
  const overlong = rows.filter((row) => row.audioMs >= medianMs * OVERLONG_RATIO);
  const flagged = rows.filter((row) => row.overlongAtAudioMs !== null);
  saveResult(`overlong-${args.voiceId ?? 'casey'}-${model}`, {
    text,
    model,
    requests: rows.length,
    credits: Math.round(rows.length * text.length * CREDITS_PER_CHARACTER),
    medianMs,
    overlong: overlong.length,
    flagged: flagged.length,
    caught: overlong.filter((row) => row.overlongAtAudioMs !== null).length,
    falseAlarms: flagged.filter((row) => row.audioMs < medianMs * OVERLONG_RATIO).length,
    trippedAt: overlong.map((row) => ({ audioMs: row.audioMs, wordsEndMs: row.wordsEndMs, overlongAtAudioMs: row.overlongAtAudioMs, overlongAtMs: row.overlongAtMs })),
    rows,
  });
}

async function measureFirstAudio(): Promise<void> {
  const count = Number(args.count);
  const text = 'Watch it climb, slower and slower.';
  const cold = [];
  for (let attempt = 0; attempt < Math.min(count, 5); attempt += 1) {
    const voice = makeVoice();
    cold.push((await speakLine(voice, text)).firstFrameMs);
    await voice.close();
  }
  const voice = makeVoice();
  voice.prewarm();
  await new Promise((done) => setTimeout(done, 1000));
  const warm = [];
  for (let attempt = 0; attempt < count; attempt += 1) warm.push((await speakLine(voice, text)).firstFrameMs);
  await voice.close();
  saveResult(`first-audio-${model}`, { model, text, credits: Math.round((cold.length + warm.length) * text.length * CREDITS_PER_CHARACTER), coldSocket: getPercentiles(cold), warmSocket: getPercentiles(warm), warmFirstRequestMs: Math.round(warm[0] ?? 0), warmRest: getPercentiles(warm.slice(1)) });
}

const NUMBER_LINES = ['It falls at 9.8 metres per second, about 2.5 times faster.', 'So 3/4 of 12 is 9, and x^2 + 1 stays above 0.', "That's 100% right: ninety-nine isn't 1,000."];

async function compareAlignments(): Promise<void> {
  const rows = [];
  for (const preferredAlignment of ['original', 'normalized'] as const) {
    const voice = makeElevenLabsVoice({ name: preferredAlignment, apiKey, voiceId: args.voiceId ?? TUTOR_VOICE_ID, model, preferredAlignment }).makeTts();
    for (const text of NUMBER_LINES) {
      const line = await speakLine(voice, text);
      const ours = text.split(/\s+/);
      const theirs = line.words.map((word) => word.text);
      rows.push({ preferredAlignment, text, ours: ours.length, theirs: theirs.length, isSame: ours.join(' ') === theirs.join(' '), voiceWords: theirs.join(' ') });
    }
    await voice.close();
  }
  saveResult(`alignment-${model}`, { model, credits: Math.round(rows.reduce((sum, row) => sum + row.text.length, 0) * CREDITS_PER_CHARACTER), rows });
}

const WHOLE_SENTENCE = 'Gravity pulls it down the whole way, even at the very top of the climb.';
const FLUSHED_PIECES = ['Gravity pulls it down', 'the whole way, even', 'at the very top', 'of the climb.'];

async function speakPieces(voice: tts.TTS, pieces: readonly string[]): Promise<HeardLine> {
  const stream = voice.stream();
  const line: HeardLine = { firstFrameMs: 0, audioMs: 0, wordsEndMs: 0, overlongAtAudioMs: null, overlongAtMs: null, pcm: [], words: [] };
  const reading = (async () => {
    for await (const chunk of stream) {
      if (chunk === tts.SynthesizeStream.END_OF_STREAM) break;
      line.pcm.push(chunk.frame.data);
      line.audioMs += (chunk.frame.samplesPerChannel / chunk.frame.sampleRate) * MS_PER_SECOND;
      for (const word of chunk.timedTranscripts ?? []) line.words.push({ text: word.text.trim(), startMs: Math.round((word.startTime ?? 0) * MS_PER_SECOND) });
    }
  })();
  for (const piece of pieces) {
    stream.pushText(`${piece} `);
    stream.flush();
    await new Promise((done) => setTimeout(done, 300));
  }
  stream.endInput();
  await reading;
  return line;
}

async function makeClips(): Promise<void> {
  const voice = makeVoice();
  voice.prewarm();
  const name = model.replace('eleven_', '').replace('_v2_5', '');
  const whole = await speakPieces(voice, [WHOLE_SENTENCE]);
  writeWav(`casey-${name}-whole.wav`, whole.pcm);
  const flushed = await speakPieces(voice, FLUSHED_PIECES);
  writeWav(`casey-${name}-flushed.wav`, flushed.pcm);
  await voice.close();
  saveResult(`clips-${name}`, { model, wholeMs: Math.round(whole.audioMs), flushedMs: Math.round(flushed.audioMs), stretch: Number((flushed.audioMs / whole.audioMs).toFixed(2)), wholeWords: whole.words, flushedWords: flushed.words, credits: Math.round(WHOLE_SENTENCE.length * 2 * CREDITS_PER_CHARACTER) });
}

// Saves one take and reports how much the same phrase's word times vary between requests.
async function storeStockPhrase(): Promise<void> {
  const voice = makeVoice();
  voice.prewarm();
  const takes = [];
  for (let attempt = 0; attempt < 5; attempt += 1) takes.push(await speakLine(voice, STOCK_PHRASE));
  await voice.close();
  const kept = takes[0] as HeardLine;
  const pcm = Buffer.concat(kept.pcm.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
  writeFileSync(join(out, 'stock-phrase.json'), JSON.stringify({ sampleRate: SAMPLE_RATE, base64: pcm.toString('base64'), words: kept.words }));
  writeWav(`stock-phrase-${model}.wav`, kept.pcm);
  saveResult(`stock-phrase-times-${model}`, { model, credits: Math.round(5 * STOCK_PHRASE.length * CREDITS_PER_CHARACTER), audioMs: takes.map((take) => Math.round(take.audioMs)), wordStartsMs: takes.map((take) => take.words.map((word) => word.startMs)) });
}

const LONG_TEXT = 'Gravity pulls the ball down the whole way, even at the very top of the climb, and sideways nothing pushes it at all. '.repeat(2);

// `close_context` does not cancel, so this stops a long line after its first audio and counts what the vendor still sends.
async function stopEarly(): Promise<void> {
  const tap = tapVendorSocket();
  const voice = makeVoice();
  voice.prewarm();
  const rows = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stream = voice.stream();
    stream.pushText(LONG_TEXT);
    stream.flush();
    stream.endInput();
    let framesAfterStop = 0;
    let stoppedAtMs: number | null = null;
    for await (const chunk of stream) {
      if (chunk === tts.SynthesizeStream.END_OF_STREAM) break;
      if (stoppedAtMs !== null) framesAfterStop += 1;
      else {
        stoppedAtMs = Date.now();
        stream.close();
      }
    }
    await new Promise((done) => setTimeout(done, 3000));
    const after = tap.messages.filter((message) => stoppedAtMs !== null && message.atMs > stoppedAtMs && message.audioBytes > 0);
    rows.push({ framesAfterStop, vendorMessagesAfterStop: after.length, vendorAudioAfterStopMs: Math.round(after.reduce((sum, message) => sum + message.audioBytes / 2 / SAMPLE_RATE, 0) * MS_PER_SECOND) });
    tap.messages.length = 0;
    const next = await speakLine(voice, 'Still here.');
    rows.push({ firstFrameAfterStopMs: Math.round(next.firstFrameMs) });
  }
  await voice.close();
  saveResult(`stop-early-${model}`, { model, credits: Math.round(2 * (LONG_TEXT.length + 11) * CREDITS_PER_CHARACTER), rows });
}

const JOBS: Record<string, () => Promise<void>> = { 'stop-early': stopEarly, overlong: checkOverlong, 'first-audio': measureFirstAudio, alignment: compareAlignments, clips: makeClips, 'stock-phrase': storeStockPhrase };
const job = JOBS[args.job ?? ''];
if (!job) throw new Error(`Choose a job from ${Object.keys(JOBS).join(', ')}`);
await job();
process.exit(0);
