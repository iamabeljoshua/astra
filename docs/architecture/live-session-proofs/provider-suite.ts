// What every adapter must give us. M3.6 moves this to apps/agent as a test, and a real vendor passes it before it ships.
// Run with plain Node, with the fakes running: node fake-providers.mjs, then node provider-suite.ts.
import { initializeLogger, stt, tts } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCartesiaVoice } from './providers/cartesia.ts';
import { TRANSCRIBERS, VOICES } from './providers/choose.ts';
import { makeFakeModel } from './providers/fakes.ts';
import type { TranscriberAdapter, TutorEvent, TutorModelAdapter, VoiceAdapter } from './providers/types.ts';

initializeLogger({ pretty: false, level: 'warn' });

const HERE = dirname(fileURLToPath(import.meta.url));
const FIRST_LINE = 'Your hand, right up until it lets go.';
const SECOND_LINE = 'After that, nothing pushes it.';
const CLOSE_WITHIN_MS = 500;
const MIC_RATE = 48000;
const MIC_FRAME_SAMPLES = 480;
const SETTLE_MS = 1500;
const STT_PORT = process.env.FAKE_STT_PORT ?? 17802;
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface VoiceOutput {
  words: { text: string; startTime: number }[];
  audioSeconds: number;
}

async function hearVoice(stream: tts.SynthesizeStream): Promise<VoiceOutput> {
  const output: VoiceOutput = { words: [], audioSeconds: 0 };
  for await (const chunk of stream) {
    if (chunk === tts.SynthesizeStream.END_OF_STREAM) break;
    output.audioSeconds += chunk.frame.samplesPerChannel / chunk.frame.sampleRate;
    for (const word of chunk.timedTranscripts ?? []) output.words.push({ text: word.text.trim(), startTime: word.startTime ?? 0 });
  }
  return output;
}

async function checkVoice(adapter: VoiceAdapter): Promise<string[]> {
  const problems: string[] = [];
  const voice = adapter.makeTts();
  if (!voice.capabilities.alignedTranscript) problems.push('a voice must give word times, because the board clock needs them');
  const stream = voice.stream();
  const heard = hearVoice(stream);
  stream.pushText(`${FIRST_LINE} `);
  stream.flush();
  stream.pushText(`${SECOND_LINE} `);
  stream.flush();
  stream.endInput();
  const { words, audioSeconds } = await heard;
  const expected = `${FIRST_LINE} ${SECOND_LINE}`.split(' ');
  if (words.map((word) => word.text).join(' ') !== expected.join(' ')) problems.push(`word times must name every word in order, and they named ${words.length} of ${expected.length}`);
  if (words.some((word, index) => index > 0 && word.startTime < (words[index - 1]?.startTime ?? 0))) problems.push('word times must rise across a flush, on one timeline');
  if (words.some((word) => word.startTime > audioSeconds)) problems.push('a word time must lie inside the audio');
  if (audioSeconds === 0) problems.push('a voice must give audio');
  const cancelled = voice.stream();
  const stopped = hearVoice(cancelled);
  cancelled.pushText(`${FIRST_LINE} `);
  cancelled.flush();
  await delay(50);
  cancelled.close();
  const timedOut = await Promise.race([stopped.then(() => false), delay(CLOSE_WITHIN_MS).then(() => true)]);
  if (timedOut) problems.push(`a closed stream must end within ${CLOSE_WITHIN_MS} ms`);
  return problems;
}

function readSpeechFrames(): AudioFrame[] {
  const bytes = readFileSync(join(HERE, 'speech', 'twice.wav'));
  const start = bytes.indexOf('data') + 8;
  const samples = new Int16Array(bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + bytes.byteLength));
  const frames: AudioFrame[] = [];
  for (let offset = 0; offset + MIC_FRAME_SAMPLES <= samples.length; offset += MIC_FRAME_SAMPLES) {
    frames.push(new AudioFrame(samples.slice(offset, offset + MIC_FRAME_SAMPLES), MIC_RATE, 1, MIC_FRAME_SAMPLES));
  }
  return frames;
}

async function checkTranscriber(adapter: TranscriberAdapter): Promise<string[]> {
  const problems: string[] = [];
  const text = 'It lands twice as far.';
  await fetch(`http://127.0.0.1:${STT_PORT}/script`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:${STT_PORT}/script`, { method: 'POST', body: JSON.stringify({ text }) });
  const transcriber = adapter.makeStt();
  if (!transcriber.capabilities.streaming) problems.push('a transcriber must stream');
  if (!transcriber.capabilities.interimResults) problems.push('a transcriber must give interim text, because a stop rests on the first real word');
  const stream = transcriber.stream();
  const seen: { type: stt.SpeechEventType; text: string }[] = [];
  const reading = (async () => {
    for await (const event of stream) seen.push({ type: event.type, text: event.alternatives?.[0]?.text ?? '' });
  })();
  for (const frame of readSpeechFrames()) {
    stream.pushFrame(frame);
    await delay(1);
  }
  await delay(SETTLE_MS);
  stream.endInput();
  await Promise.race([reading, delay(SETTLE_MS)]);
  stream.close();
  const firstInterim = seen.findIndex((event) => event.type === stt.SpeechEventType.INTERIM_TRANSCRIPT && event.text !== '');
  const final = seen.findIndex((event) => event.type === stt.SpeechEventType.FINAL_TRANSCRIPT && event.text === text);
  if (firstInterim < 0) problems.push('a transcriber must give interim text');
  if (final < 0) problems.push('a transcriber must give final text');
  if (firstInterim >= 0 && final >= 0 && firstInterim > final) problems.push('interim text must come before the final');
  return problems;
}

async function checkModel(adapter: TutorModelAdapter): Promise<string[]> {
  const problems: string[] = [];
  const controller = new AbortController();
  const events: TutorEvent[] = [];
  for await (const event of adapter.stream({ instructions: 'proof', turns: [{ role: 'student', text: 'Why?' }] }, controller.signal)) events.push(event);
  if (events.filter((event) => event.kind === 'text').length < 2) problems.push('a model must stream its text in pieces, because the voice starts on the first words');
  if (!events.some((event) => event.kind === 'usage')) problems.push('a model must report its tokens, because cost is measured from them');
  const cancel = new AbortController();
  let afterAbort = 0;
  for await (const event of adapter.stream({ instructions: 'proof', turns: [] }, cancel.signal)) {
    if (cancel.signal.aborted && event.kind === 'text') afterAbort += 1;
    cancel.abort();
  }
  if (afterAbort > 0) problems.push('a cancelled model must stop writing');
  return problems;
}

const TEXT = 'Gravity pulls on it the whole way down, even at the very top.';
const SILENT_MODEL: TutorModelAdapter = {
  name: 'whole-reply-at-once',
  async *stream() {
    yield { kind: 'text', text: TEXT };
  },
};
const cases = [
  { kind: 'voice', adapter: VOICES.fakeCartesia, check: checkVoice, passes: true },
  { kind: 'voice', adapter: VOICES.inProcess, check: checkVoice, passes: true },
  { kind: 'voice', adapter: makeCartesiaVoice({ name: 'no-word-times', apiKey: 'fake', baseUrl: `http://127.0.0.1:${process.env.FAKE_TTS_PORT ?? 17801}`, wordTimestamps: false }), check: checkVoice, passes: false },
  { kind: 'transcriber', adapter: TRANSCRIBERS.fakeDeepgram, check: checkTranscriber, passes: true },
  { kind: 'model', adapter: makeFakeModel({ name: 'fake-fast', text: TEXT }), check: checkModel, passes: true },
  { kind: 'model', adapter: makeFakeModel({ name: 'fake-slow', text: TEXT, firstTextMs: 300 }), check: checkModel, passes: true },
  { kind: 'model', adapter: SILENT_MODEL, check: checkModel, passes: false },
];
const rows = [];
for (const { kind, adapter, check, passes } of cases) {
  // Each case's own check takes that kind of adapter, and the table keeps them paired.
  const problems = await (check as (item: unknown) => Promise<string[]>)(adapter);
  rows.push({ kind, name: (adapter as { name: string }).name, shouldPass: passes, problems, asExpected: (problems.length === 0) === passes });
}
const summary = { asExpected: rows.filter((row) => row.asExpected).length, of: rows.length, rows };
writeFileSync(join(HERE, 'results', 'provider-suite.json'), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.asExpected === summary.of ? 0 : 1);
