import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUTOR_VOICE_ID } from '../../providers/choose.ts';
import { AUDIBLE_SAMPLE } from '../../live/first-sound.ts';
import type { StoredTake, TakeUse } from '../../live/reactions.ts';
import { readKey } from '../../keys.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(HERE, '../../../assets/reactions');
const SAMPLE_RATE = 24000;
const SAMPLES_PER_MS = SAMPLE_RATE / 1000;
const TAIL_MS = 40;
const API = 'https://api.elevenlabs.io/v1';

const LINES: { id: string; use: TakeUse; phrase: string }[] = [
  { id: 'reaction-hm', use: 'reaction', phrase: 'Hm.' },
  { id: 'reaction-i-see', use: 'reaction', phrase: 'I see.' },
  { id: 'working-1', use: 'working', phrase: 'Let me work that out.' },
  { id: 'working-2', use: 'working', phrase: 'Let me work that out.' },
  { id: 'working-3', use: 'working', phrase: 'Let me work that out.' },
  { id: 'greeting', use: 'greeting', phrase: 'Welcome, I am Astra, your personal AI tutor.' },
  { id: 'prompt-take-your-time', use: 'prompt', phrase: 'Take your time.' },
  { id: 'voice-lost', use: 'voiceLost', phrase: 'Sorry, I lost my voice for a moment. Say that again?' },
];

const ONLY = process.argv[2];

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
}

function getWordStartsSeconds({ characters, character_start_times_seconds: starts }: Alignment): { text: string; startSeconds: number }[] {
  const words: { text: string; startSeconds: number }[] = [];
  let current: { text: string; startSeconds: number } | null = null;
  characters.forEach((character, index) => {
    if (character.trim() === '') {
      current = null;
      return;
    }
    if (!current) {
      current = { text: '', startSeconds: starts[index] ?? 0 };
      words.push(current);
    }
    current.text += character;
  });
  return words;
}

function getAudibleRange(pcm: Int16Array): { first: number; last: number } {
  const first = pcm.findIndex((sample) => Math.abs(sample) >= AUDIBLE_SAMPLE);
  let last = pcm.length - 1;
  while (last > 0 && Math.abs(pcm[last] as number) < AUDIBLE_SAMPLE) last -= 1;
  return { first: Math.max(first, 0), last };
}

// Each take starts on its first audible sample, because leading silence would spend a reaction's 200 ms before it made a sound.
function trimTake(line: (typeof LINES)[number], base64: string, alignment: Alignment): StoredTake {
  const bytes = Buffer.from(base64, 'base64');
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  const { first, last } = getAudibleRange(pcm);
  const trimmed = pcm.slice(first, Math.min(last + TAIL_MS * SAMPLES_PER_MS, pcm.length));
  const firstMs = first / SAMPLES_PER_MS;
  const words = getWordStartsSeconds(alignment).map(({ text, startSeconds }) => ({ text, startMs: Math.max(0, Math.round(startSeconds * 1000 - firstMs)) }));
  return { ...line, sampleRate: SAMPLE_RATE, words, base64: Buffer.from(trimmed.buffer, trimmed.byteOffset, trimmed.byteLength).toString('base64') };
}

async function readUsedCharacters(apiKey: string): Promise<number> {
  const response = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': apiKey } });
  const { character_count: used } = (await response.json()) as { character_count: number };
  return used;
}

const apiKey = readKey('ELEVENLABS_API_KEY');
const usedBefore = await readUsedCharacters(apiKey);
for (const line of LINES.filter(({ id }) => !ONLY || id === ONLY)) {
  const response = await fetch(`${API}/text-to-speech/${TUTOR_VOICE_ID}/with-timestamps?output_format=pcm_${SAMPLE_RATE}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ text: line.phrase, model_id: 'eleven_flash_v2_5' }),
  });
  if (!response.ok) throw new Error(`${line.id}: ${response.status}`);
  const { audio_base64: audio, alignment } = (await response.json()) as { audio_base64: string; alignment: Alignment };
  const take = trimTake(line, audio, alignment);
  writeFileSync(join(FOLDER, `${line.id}.json`), `${JSON.stringify(take)}\n`);
  console.log(line.id, `${Math.round((Buffer.from(take.base64, 'base64').length / 2 / SAMPLE_RATE) * 1000)} ms`, take.words.map((word) => `${word.text}@${word.startMs}`).join(' '));
}
console.log(`credits used ${(await readUsedCharacters(apiKey)) - usedBefore}, which ElevenLabs can report late`);
