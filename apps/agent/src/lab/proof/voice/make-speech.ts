import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_RATE = 24000;
const AUDIBLE = 328;

export interface SpokenLine {
  id: string;
  text: string;
  /** Spellings a person would call correct, so "Mhm" is not a word error for "Mm-hmm". */
  accept?: string[];
}

function readWavData(path: string): Buffer {
  const file = readFileSync(path);
  const dataAt = file.indexOf('data');
  return file.subarray(dataAt + 8);
}

// Synthetic speech from the Mac's own voices, which cost nothing and hold no one's real voice.
export function makeSayClip({ voice, line, folder }: { voice: string; line: SpokenLine; folder: string }): { pcm: Int16Array; firstMs: number; lastMs: number; durationMs: number } {
  mkdirSync(folder, { recursive: true });
  const stem = join(folder, `${voice.replaceAll(' ', '-')}-${line.id}`);
  if (!existsSync(`${stem}.pcm`)) {
    execFileSync('say', ['-v', voice, '-o', `${stem}.aiff`, line.text]);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${SAMPLE_RATE}`, '-c', '1', `${stem}.aiff`, `${stem}.wav`]);
    writeFileSync(`${stem}.pcm`, readWavData(`${stem}.wav`));
    rmSync(`${stem}.aiff`);
    rmSync(`${stem}.wav`);
  }
  const bytes = readFileSync(`${stem}.pcm`);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  const first = pcm.findIndex((sample) => Math.abs(sample) >= AUDIBLE);
  let last = pcm.length - 1;
  while (last > 0 && Math.abs(pcm[last] as number) < AUDIBLE) last -= 1;
  const toMs = (sample: number) => (sample / SAMPLE_RATE) * 1000;
  return { pcm, firstMs: toMs(Math.max(first, 0)), lastMs: toMs(last), durationMs: toMs(pcm.length) };
}

export const MATH_AND_SPEECH_LINES: SpokenLine[] = [
  { id: 'x-squared', text: 'x squared over two', accept: ['ex squared over two', 'x squared over 2', 'x^2 over 2', 'x² over 2', 'x² over two', 'x squared / 2', 'x^2/2'] },
  { id: 'minus-b', text: 'negative b over two a', accept: ['minus b over two a', '-b over 2a', 'negative b over 2a', 'negative b over 2 a'] },
  { id: 'twice', text: 'It lands twice as far.' },
  { id: 'why-down', text: 'Wait, then why does it come down?' },
  { id: 'numerator', text: 'Is the numerator bigger than the denominator?' },
  { id: 'derivative', text: 'The derivative of x squared is two x.', accept: ['the derivative of x squared is 2x', 'the derivative of x² is 2x', 'the derivative of x^2 is 2x'] },
  { id: 'discriminant', text: 'The discriminant is b squared minus four a c.', accept: ['the discriminant is b squared minus 4ac', 'the discriminant is b² minus 4ac', 'the discriminant is b squared minus 4 a c', 'the discriminant is b^2 - 4ac'] },
  { id: 'root', text: "What's the square root of sixteen?", accept: ["what's the square root of 16"] },
  { id: 'line', text: 'y equals two x plus three.', accept: ['y equals 2x plus 3', 'y = 2x + 3'] },
  { id: 'sideways', text: 'Sideways speed stays the same because no force pushes it.' },
];

export const REACTION_LINES: SpokenLine[] = [
  { id: 'uh-huh', text: 'Uh-huh.', accept: ['uhhuh', 'uh huh', 'mhm'] },
  { id: 'mm-hmm', text: 'Mm-hmm.', accept: ['mhm', 'mhmm', 'mmhmm', 'mmhm', 'mm hm', 'mm-hm'] },
  { id: 'hmm', text: 'Hmm.', accept: ['hm', 'hmmm', 'hmmmm', 'mm', 'mmm'] },
  { id: 'aha', text: 'Aha.', accept: ['ah ha', 'ah-ha'] },
  { id: 'mm-mm', text: 'Mm-mm.', accept: ['mm mm', 'mmm', 'mm', 'mhm'] },
  { id: 'okay', text: 'Okay.', accept: ['ok'] },
  { id: 'yeah', text: 'Yeah.', accept: ['yes'] },
  { id: 'wait', text: 'Wait.' },
  { id: 'number', text: '42', accept: ['forty two', 'forty-two'] },
];

export const LONG_LINES: SpokenLine[] = [
  { id: 'long-1', text: 'If I throw a ball straight up and it takes three seconds to reach the top, how do I work out how fast it was going when it left my hand?' },
  { id: 'long-2', text: 'So the sideways speed stays the same the whole way, but the upward speed keeps shrinking until it reaches zero at the very top of the arc.' },
  { id: 'long-3', text: 'I think it lands twice as far because it has twice as much time in the air, and the sideways speed never changes while it is flying.' },
  { id: 'long-4', text: 'What I do not understand is why the ball keeps moving forward at all once nothing is pushing it, because I thought things stop on their own.' },
];
