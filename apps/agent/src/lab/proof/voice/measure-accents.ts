import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { initializeLogger, stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { WebSocket } from 'ws';
import { makeTutorTranscriber } from '../../../providers/choose.ts';
import { isSmallReaction } from '../../../live/turn-words.ts';
import { readKey } from '../../../keys.ts';
import { summarise } from './read-trace.ts';
import { makeSayClip, MATH_AND_SPEECH_LINES, REACTION_LINES, type SpokenLine } from './make-speech.ts';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/m3-6-accents' }, only: { type: 'string' } } });

const VOICES = [
  { voice: 'Samantha', accent: 'American' },
  { voice: 'Daniel', accent: 'British' },
  { voice: 'Rishi', accent: 'Indian' },
  { voice: 'Karen', accent: 'Australian' },
  { voice: 'Moira', accent: 'Irish' },
];
const FRAME_SAMPLES = 2400;
const FRAME_MS = 100;
const SILENCE_AFTER_MS = 6000;

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

const normalise = (text: string) => text.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();

function countWordErrors(reference: string, heard: string): number {
  const from = normalise(reference).split(' ');
  const to = normalise(heard).split(' ').filter(Boolean);
  let row = Array.from({ length: to.length + 1 }, (_, index) => index);
  from.forEach((word, fromIndex) => {
    const next = [fromIndex + 1];
    to.forEach((other, toIndex) => next.push(Math.min((row[toIndex] as number) + (word === other ? 0 : 1), (row[toIndex + 1] as number) + 1, (next[toIndex] as number) + 1)));
    row = next;
  });
  return row[to.length] as number;
}

function getWordErrors(line: SpokenLine, heard: string): number {
  const allowed = [line.text, ...(line.accept ?? [])];
  return Math.min(...allowed.map((reference) => countWordErrors(reference, heard)));
}

async function runVoice({ voice, accent }: (typeof VOICES)[number], folder: string) {
  let isReady = false;
  const raw: { atMs: number; type: string; turnId?: string; text?: string }[] = [];
  const startedAllAtMs = Date.now();
  const transcriber = makeTutorTranscriber({
    apiKey: readKey('META_API_KEY'),
    onNote: (note) => {
      if (note.kind === 'ready') isReady = true;
    },
    webSocketFactory: (url, options) => {
      const socket = new WebSocket(url, options);
      socket.on('message', (data, isBinary) => {
        if (isBinary) return;
        const message = JSON.parse(data.toString()) as { type?: string; turnId?: string; transcript?: string };
        if (message.type && message.type !== 'audioProgress') raw.push({ atMs: Date.now() - startedAllAtMs, type: message.type, turnId: message.turnId, text: message.transcript });
      });
      return socket;
    },
  }).makeStt();
  const stream = transcriber.stream();
  let latest = { interimAt: null as number | null, finalAt: null as number | null, text: '' };
  const reading = (async () => {
    for await (const event of stream) {
      if (event.type === stt.SpeechEventType.INTERIM_TRANSCRIPT) latest.interimAt ??= Date.now();
      if (event.type === stt.SpeechEventType.FINAL_TRANSCRIPT && latest.finalAt === null) {
        latest.finalAt = Date.now();
        latest.text = event.alternatives?.[0]?.text ?? '';
      }
    }
  })();
  const silence = new Int16Array(FRAME_SAMPLES);
  const pushAtPace = async (pcm: Int16Array, startAtMs: number) => {
    for (let offset = 0, sent = 0; offset < pcm.length; offset += FRAME_SAMPLES, sent += 1) {
      const samples = pcm.slice(offset, offset + FRAME_SAMPLES);
      stream.pushFrame(new AudioFrame(samples, 24000, 1, samples.length));
      const nextAtMs = startAtMs + (sent + 1) * FRAME_MS;
      await delay(Math.max(0, nextAtMs - Date.now()));
    }
  };
  while (!isReady) {
    stream.pushFrame(new AudioFrame(silence, 24000, 1, FRAME_SAMPLES));
    await delay(FRAME_MS);
  }
  const rows = [];
  for (const [kind, lines] of [['speech', MATH_AND_SPEECH_LINES], ['reaction', REACTION_LINES]] as const) {
    for (const line of lines) {
      const clip = makeSayClip({ voice, line, folder });
      latest = { interimAt: null, finalAt: null, text: '' };
      const startedAtMs = Date.now();
      await pushAtPace(clip.pcm, startedAtMs);
      const lastSoundAtMs = startedAtMs + clip.lastMs;
      const firstSoundAtMs = startedAtMs + clip.firstMs;
      const quietFrom = Date.now();
      while (latest.finalAt === null && Date.now() - quietFrom < SILENCE_AFTER_MS) await pushAtPace(silence, Date.now());
      const settle = Date.now();
      while (Date.now() - settle < 300) await pushAtPace(silence, Date.now());
      rows.push({ kind, id: line.id, said: line.text, heard: latest.text, wordErrors: getWordErrors(line, latest.text), words: normalise(line.text).split(' ').length, partialFromFirstSoundMs: latest.interimAt === null ? null : Math.round(latest.interimAt - firstSoundAtMs), finalFromLastSoundMs: latest.finalAt === null ? null : Math.round(latest.finalAt - lastSoundAtMs), reactionRuleHolds: kind !== 'reaction' || line.id === 'number' || line.id === 'wait' ? null : isSmallReaction(latest.text) });
    }
  }
  stream.close();
  await reading;
  await transcriber.close();
  const speech = rows.filter((row) => row.kind === 'speech');
  const pickNumbers = (values: (number | null)[]) => values.flatMap((value) => (value === null ? [] : [value]));
  writeFileSync(join(folder, `../raw-${voice}.json`), JSON.stringify(raw));
  return { voice, accent, wordErrors: speech.reduce((sum, row) => sum + row.wordErrors, 0), words: speech.reduce((sum, row) => sum + row.words, 0), noFinal: rows.filter((row) => row.finalFromLastSoundMs === null).length, finalMs: summarise(pickNumbers(speech.map((row) => row.finalFromLastSoundMs))), partialMs: summarise(pickNumbers(speech.map((row) => row.partialFromFirstSoundMs))), rows };
}

initializeLogger({ pretty: false, level: 'silent' });
const out = args.out ?? '';
mkdirSync(out, { recursive: true });
const results = await Promise.all(VOICES.filter(({ voice }) => !args.only || args.only.includes(voice)).map((voice) => runVoice(voice, join(out, 'clips'))));
writeFileSync(join(out, 'accents.json'), `${JSON.stringify(results, null, 1)}\n`);
for (const result of results) console.log(result.accent, `errors ${result.wordErrors}/${result.words}`, `noFinal ${result.noFinal}`, 'final', result.finalMs.p50, result.finalMs.p95, 'partial', result.partialMs.p50);
process.exit(0);
