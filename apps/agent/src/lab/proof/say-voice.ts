import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Beat, getBeatText, getSpokenWords } from '@astra/contracts';
import { FAKE_SAMPLE_RATE, type RenderSpeech, type SpokenAudio } from '../../providers/fakes.ts';

const SAY_VOICE = 'Samantha';
const MS_PER_SECOND = 1000;

function readWavSamples(path: string): Int16Array {
  const bytes = readFileSync(path);
  const dataAt = bytes.indexOf('data', 12, 'latin1');
  const length = bytes.readUInt32LE(dataAt + 4);
  const copy = bytes.subarray(dataAt + 8, dataAt + 8 + length);
  return new Int16Array(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.length));
}

function speak(text: string, folder: string): Int16Array {
  const path = join(folder, 'said.wav');
  execFileSync('say', ['-v', SAY_VOICE, '-o', path, '--file-format=WAVE', `--data-format=LEI16@${FAKE_SAMPLE_RATE}`, text]);
  return readWavSamples(path);
}

// Word times are each word's share of the phrase, so they are close and not exact.
function renderPhrase(text: string, folder: string): SpokenAudio {
  const words = getSpokenWords(text);
  const pcm = speak(text, folder);
  const lengths = words.map((word) => speak(word, folder).length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const durationMs = (pcm.length / FAKE_SAMPLE_RATE) * MS_PER_SECOND;
  let usedMs = 0;
  return {
    pcm,
    sampleRate: FAKE_SAMPLE_RATE,
    words: words.map((word, index) => {
      const startMs = usedMs;
      usedMs += ((lengths[index] as number) / total) * durationMs;
      return { text: word, startMs };
    }),
  };
}

/** Speaks every phrase once before the lesson, so speaking never holds up the audio already flowing. */
export function makeSayRenderer(beats: readonly Beat[]): RenderSpeech {
  const folder = mkdtempSync(join(tmpdir(), 'lab-say-'));
  const phrases = new Map(beats.map((beat) => [getBeatText(beat), renderPhrase(getBeatText(beat), folder)]));
  rmSync(folder, { recursive: true });
  return (text) => {
    const said = phrases.get(getSpokenWords(text).join(' '));
    if (!said) throw new Error(`No speech prepared for: ${text}`);
    return said;
  };
}
