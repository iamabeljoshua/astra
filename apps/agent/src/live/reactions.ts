import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Beat, parseBeat } from '@astra/contracts';
import { makeRenderedVoice, RENDERED_SAMPLE_RATE, type SpokenAudio } from '../providers/rendered-voice.ts';
import type { VoiceAdapter } from '../providers/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TAKES_FOLDER = join(HERE, '../../assets/reactions');

export type TakeUse = 'reaction' | 'working' | 'greeting' | 'prompt' | 'voiceLost' | 'talkInvitation';

/** One recording in the tutor's voice, with the word times of that recording. */
export interface StoredTake {
  id: string;
  use: TakeUse;
  phrase: string;
  sampleRate: number;
  words: { text: string; startMs: number }[];
  base64: string;
}

export function readTake(json: string, path = 'take'): StoredTake {
  const take = JSON.parse(json) as StoredTake;
  if (take.sampleRate !== RENDERED_SAMPLE_RATE) throw new Error(`${path} is at ${take.sampleRate} Hz, and a stored take must be at ${RENDERED_SAMPLE_RATE} Hz`);
  return take;
}

export function loadTakes(folder = TAKES_FOLDER): StoredTake[] {
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readTake(readFileSync(join(folder, name), 'utf8'), name));
}

export function getTakeAudio(take: StoredTake): SpokenAudio {
  const bytes = Buffer.from(take.base64, 'base64');
  return { pcm: new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2)), sampleRate: take.sampleRate, words: take.words };
}

export function makeTakeVoice(take: StoredTake): VoiceAdapter {
  const audio = getTakeAudio(take);
  return makeRenderedVoice({ name: take.id, render: () => audio });
}

export function getTakeBeat(take: StoredTake, beatId: string): Beat {
  const parsed = parseBeat({ id: beatId, script: [take.phrase], expectsReply: false });
  if (!parsed.ok) throw new Error(`${take.id}: ${parsed.problem}`);
  return parsed.value;
}

const TURNS_BEFORE_A_REPEAT = 3;

export interface TakePicker {
  /** Goes round every take of these uses. */
  next(...uses: readonly TakeUse[]): StoredTake | null;
}

// Goes round the takes in a fixed order, so which phrase comes next is the same in every run and no phrase repeats too soon.
export function createTakePicker(takes: readonly StoredTake[]): TakePicker {
  const recentPhrases: string[] = [];
  const nextIndexByUses = new Map<string, number>();
  return {
    next(...uses) {
      const key = uses.join();
      const candidates = takes.filter((take) => uses.includes(take.use));
      if (candidates.length === 0) return null;
      const start = nextIndexByUses.get(key) ?? 0;
      const ordered = candidates.map((_, offset) => candidates[(start + offset) % candidates.length] as StoredTake);
      const picked = ordered.find((take) => !recentPhrases.includes(take.phrase)) ?? (ordered[0] as StoredTake);
      nextIndexByUses.set(key, (candidates.indexOf(picked) + 1) % candidates.length);
      recentPhrases.push(picked.phrase);
      if (recentPhrases.length > TURNS_BEFORE_A_REPEAT - 1) recentPhrases.shift();
      return picked;
    },
  };
}
