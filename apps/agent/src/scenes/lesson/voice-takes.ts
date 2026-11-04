import type { tts } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { type Beat, getBeatText, getSpokenWords } from '@astra/contracts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFirstLoudMs } from '../../lab/proof/analyse-run.ts';
import { FAKE_SAMPLE_RATE, makeRenderedVoice, type RenderSpeech } from '../../providers/fakes.ts';

interface StoredTake {
  sampleRate: number;
  base64: string;
  words: { text: string; startMs: number }[];
}

export interface TurnVoice {
  tts: tts.TTS;
  onFrame?(frame: AudioFrame): void;
  onWords?(words: readonly { text: string; startMs: number }[]): void;
  /** Keeps what was just spoken, so the same words never cost credits twice. */
  save?(): void;
}

export interface LessonVoice {
  forTurn(beats: readonly Beat[]): TurnVoice;
  getLiveCharacters(): number;
  close(): Promise<void>;
}

const getTurnText = (beats: readonly Beat[]) => beats.map(getBeatText).join('\n');
const getTakePath = (root: string, voiceName: string, text: string) => join(root, 'voice', `${createHash('sha256').update(`${voiceName}|${text}`).digest('hex').slice(0, 24)}.json`);

// Each flush asks for its next words, so a stored turn plays beat by beat, the way the voice first sent it.
function makeStoredRender({ sampleRate, base64, words }: StoredTake): RenderSpeech {
  const bytes = Buffer.from(base64, 'base64');
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  const toSample = (ms: number) => Math.round((ms / 1000) * sampleRate);
  let nextWord = 0;
  return (text) => {
    const firstWord = nextWord;
    nextWord += getSpokenWords(text).length;
    const from = firstWord === 0 ? 0 : toSample(words[firstWord]?.startMs ?? 0);
    const to = nextWord >= words.length ? pcm.length : toSample(words[nextWord]?.startMs ?? 0);
    return { pcm: pcm.subarray(from, to), sampleRate, words: words.slice(firstWord, nextWord).map((word) => ({ text: word.text, startMs: word.startMs - (from / sampleRate) * 1000 })) };
  };
}

function saveTake(path: string, frames: readonly AudioFrame[], words: readonly { text: string; startMs: number }[]): void {
  const samples = frames.flatMap((frame) => [Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)]);
  const bytes = Buffer.concat(samples);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  const leadMs = findFirstLoudMs(pcm, FAKE_SAMPLE_RATE);
  const take: StoredTake = { sampleRate: FAKE_SAMPLE_RATE, base64: bytes.toString('base64'), words: words.map((word) => ({ text: word.text, startMs: word.startMs + leadMs })) };
  writeFileSync(`${path}.part`, JSON.stringify(take));
  renameSync(`${path}.part`, path);
}

/** Plays a kept take when these exact words were spoken before, and otherwise speaks live and keeps the take. Past its character limit it falls back to a tone, so a proof cannot overspend. */
export function createLessonVoice({ root, voiceName, makeLiveTts, characterLimit }: { root: string; voiceName: string; makeLiveTts: () => tts.TTS; characterLimit: number }): LessonVoice {
  let liveCharacters = 0;
  let live: tts.TTS | null = null;
  mkdirSync(join(root, 'voice'), { recursive: true });
  return {
    getLiveCharacters: () => liveCharacters,
    forTurn(beats) {
      const text = getTurnText(beats);
      const path = getTakePath(root, voiceName, text);
      if (existsSync(path)) return { tts: makeRenderedVoice({ name: 'kept', render: makeStoredRender(JSON.parse(readFileSync(path, 'utf8')) as StoredTake) }).makeTts() };
      if (liveCharacters + text.length > characterLimit) return { tts: makeRenderedVoice({ name: 'tone' }).makeTts() };
      liveCharacters += text.length;
      live ??= makeLiveTts();
      const frames: AudioFrame[] = [];
      const words: { text: string; startMs: number }[] = [];
      return { tts: live, onFrame: (frame) => frames.push(frame), onWords: (next) => words.push(...next), save: () => saveTake(path, frames, words) };
    },
    close: async () => {
      await live?.close();
    },
  };
}
