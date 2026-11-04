import type { tts } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { type Beat, getBeatText, getSpokenWords } from '@astra/contracts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findFirstLoudMs } from '../../lab/proof/analyse-run.ts';
import { FAKE_SAMPLE_RATE, makeRenderedVoice, type RenderSpeech } from '../../providers/fakes.ts';
import type { SpendLedger } from '../spend-ledger.ts';

const SHORTEST_LAST_WORD_MS = 100;
const BYTES_PER_SAMPLE = 2;
const MS_PER_SECOND = 1000;

interface TimedWord {
  text: string;
  startMs: number;
}

interface StoredTake {
  sampleRate: number;
  base64: string;
  words: TimedWord[];
}

export interface TurnVoice {
  tts: tts.TTS;
  onFrame?(frame: AudioFrame): void;
  onWords?(words: readonly TimedWord[]): void;
  save?(): void;
}

export interface LessonVoice {
  forTurn(beats: readonly Beat[]): TurnVoice;
}

export interface LessonVoices {
  forStudent(studentId: string): LessonVoice;
  close(): Promise<void>;
}

const getTurnText = (beats: readonly Beat[]) => beats.map(getBeatText).join('\n');
const getTakePath = (root: string, voiceName: string, text: string) => join(root, 'voice', `${createHash('sha256').update(`${voiceName}|${text}`).digest('hex').slice(0, 24)}.json`);

// A line cut mid-sentence can hold every word's time and stop before the last word plays, so a take proves it is whole by its length against its word times.
function isWholeTake({ audioMs, words, text }: { audioMs: number; words: readonly TimedWord[]; text: string }): boolean {
  const lastWord = words.at(-1);
  return lastWord !== undefined && words.length === getSpokenWords(text).length && audioMs >= lastWord.startMs + SHORTEST_LAST_WORD_MS;
}

const getAudioMs = (byteCount: number, sampleRate: number) => (byteCount / BYTES_PER_SAMPLE / sampleRate) * MS_PER_SECOND;

function readWholeTake(path: string, text: string): StoredTake | null {
  if (!existsSync(path)) return null;
  const take = JSON.parse(readFileSync(path, 'utf8')) as StoredTake;
  return isWholeTake({ audioMs: getAudioMs(Buffer.byteLength(take.base64, 'base64'), take.sampleRate), words: take.words, text }) ? take : null;
}

// Each flush asks for its next words, so a stored turn plays beat by beat.
function makeStoredRender({ sampleRate, base64, words }: StoredTake): RenderSpeech {
  const bytes = Buffer.from(base64, 'base64');
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / BYTES_PER_SAMPLE));
  const toSample = (ms: number) => Math.round((ms / MS_PER_SECOND) * sampleRate);
  let nextWord = 0;
  return (text) => {
    const firstWord = nextWord;
    nextWord += getSpokenWords(text).length;
    const from = firstWord === 0 ? 0 : toSample(words[firstWord]?.startMs ?? 0);
    const to = nextWord >= words.length ? pcm.length : toSample(words[nextWord]?.startMs ?? 0);
    return { pcm: pcm.subarray(from, to), sampleRate, words: words.slice(firstWord, nextWord).map((word) => ({ text: word.text, startMs: word.startMs - (from / sampleRate) * MS_PER_SECOND })) };
  };
}

async function saveWholeTake({ path, frames, words, text }: { path: string; frames: readonly AudioFrame[]; words: readonly TimedWord[]; text: string }): Promise<void> {
  const bytes = Buffer.concat(frames.map((frame) => Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)));
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / BYTES_PER_SAMPLE));
  const leadMs = findFirstLoudMs(pcm, FAKE_SAMPLE_RATE);
  const shifted = words.map((word) => ({ text: word.text, startMs: word.startMs + leadMs }));
  if (!isWholeTake({ audioMs: getAudioMs(bytes.length, FAKE_SAMPLE_RATE), words: shifted, text })) return;
  const take: StoredTake = { sampleRate: FAKE_SAMPLE_RATE, base64: bytes.toString('base64'), words: shifted };
  await writeFile(`${path}.part`, JSON.stringify(take));
  await rename(`${path}.part`, path);
}

export function createLessonVoice({ root, voiceName, makeLiveTts, ledger, isFree = false }: { root: string; voiceName: string; makeLiveTts: () => tts.TTS; ledger: SpendLedger; isFree?: boolean }): LessonVoices {
  let live: tts.TTS | null = null;
  mkdirSync(join(root, 'voice'), { recursive: true });
  const forTurn = (studentId: string, beats: readonly Beat[]): TurnVoice => {
    const text = getTurnText(beats);
    const path = getTakePath(root, voiceName, text);
    const stored = readWholeTake(path, text);
    if (stored) return { tts: makeRenderedVoice({ name: 'kept', render: makeStoredRender(stored) }).makeTts() };
    if (!isFree && ledger.isOverVoiceLimit(studentId, text.length)) return { tts: makeRenderedVoice({ name: 'tone' }).makeTts() };
    if (!isFree) ledger.charge({ studentId, voiceCharacters: text.length });
    live ??= makeLiveTts();
    const frames: AudioFrame[] = [];
    const words: TimedWord[] = [];
    return { tts: live, onFrame: (frame) => frames.push(frame), onWords: (next) => words.push(...next), save: () => void saveWholeTake({ path, frames, words, text }).catch((error: unknown) => console.warn(`::warning title=Voice take::a line could not be kept: ${String(error)}`)) };
  };
  return {
    forStudent: (studentId) => ({ forTurn: (beats) => forTurn(studentId, beats) }),
    close: async () => {
      await live?.close();
    },
  };
}
