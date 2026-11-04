import type { tts } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { type Beat, getBeatText, getSpokenWords } from '@astra/contracts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { findFirstLoudMs } from '../../lab/proof/analyse-run.ts';
import { FAKE_SAMPLE_RATE, renderTone } from '../../providers/fakes.ts';
import { makeRenderedVoice, type RenderSpeech } from '../../providers/rendered-voice.ts';
import type { SpendLedger } from '../spend-ledger.ts';

const SHARED_LINES_PAYER = 'shared-lines';
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
  /** Past a voice limit, so this turn plays a tone and the page should say why. */
  isAtLimit?: boolean;
}

/** Where a lesson's lines are kept. A library card's lines are shared. A typed lesson's stay under that student, beside the scene they belong to, and before it has a topic nothing is kept. */
export type VoiceShelf = { kind: 'shared' } | { kind: 'student'; sceneId: string } | { kind: 'nowhere' };

export interface LessonVoice {
  forTurn(beats: readonly Beat[]): TurnVoice;
}

export interface LessonVoices {
  forStudent(studentId: string, getShelf?: () => VoiceShelf): LessonVoice;
  close(): Promise<void>;
}

const getTurnText = (beats: readonly Beat[]) => beats.map(getBeatText).join('\n');
const getTakeName = (voiceName: string, text: string) => `${createHash('sha256').update(`${voiceName}|${text}`).digest('hex').slice(0, 24)}.json`;
const getSharedFolder = (root: string) => join(root, 'voice');

function getShelfFolder(root: string, studentId: string, shelf: VoiceShelf): string | null {
  if (shelf.kind === 'shared') return getSharedFolder(root);
  return shelf.kind === 'student' ? join(root, 'student-voice', studentId, shelf.sceneId) : null;
}

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
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.part`, JSON.stringify(take));
  await rename(`${path}.part`, path);
}

export function createLessonVoice({ root, voiceName, makeLiveTts, ledger, isFree = false }: { root: string; voiceName: string; makeLiveTts: () => tts.TTS; ledger: SpendLedger; isFree?: boolean }): LessonVoices {
  let live: tts.TTS | null = null;
  const forTurn = (studentId: string, shelf: VoiceShelf, beats: readonly Beat[]): TurnVoice => {
    const text = getTurnText(beats);
    const name = getTakeName(voiceName, text);
    const folder = getShelfFolder(root, studentId, shelf);
    // Before a typed lesson has a topic it only says the app's own fixed lines, so it may read one a card kept, and it keeps nothing.
    const stored = readWholeTake(join(folder ?? getSharedFolder(root), name), text);
    if (stored) return { tts: makeRenderedVoice({ name: 'kept', render: makeStoredRender(stored) }).makeTts() };
    const isShared = shelf.kind === 'shared';
    const isAtLimit = isShared ? ledger.isOverSharedVoiceLimit(text.length) : ledger.isOverVoiceLimit(studentId, text.length);
    if (!isFree && isAtLimit) return { tts: makeRenderedVoice({ name: 'tone', render: renderTone }).makeTts(), isAtLimit: true };
    if (!isFree) ledger.charge({ studentId: isShared ? SHARED_LINES_PAYER : studentId, voiceCharacters: text.length });
    live ??= makeLiveTts();
    const frames: AudioFrame[] = [];
    const words: TimedWord[] = [];
    const save = folder ? () => void saveWholeTake({ path: join(folder, name), frames, words, text }).catch((error: unknown) => console.warn(`::warning title=Voice take::a line could not be kept: ${String(error)}`)) : () => {};
    return { tts: live, onFrame: (frame) => frames.push(frame), onWords: (next) => words.push(...next), save };
  };
  return {
    forStudent: (studentId, getShelf = () => ({ kind: 'shared' })) => ({ forTurn: (beats) => forTurn(studentId, getShelf(), beats) }),
    close: async () => {
      await live?.close();
    },
  };
}
