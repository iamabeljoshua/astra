import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFirstLoudMs } from './analyse-run.ts';

interface RecordedTurn {
  turnId: string;
  sampleRate: number;
  words: { words: { text: string; startMs: number }[] }[];
}

const [runFolder, outputPath, repeatsText = '1', onlyTurn] = process.argv.slice(2);
if (!runFolder || !outputPath) throw new Error('Name a real run folder and a file to write');

// Keeps a real run's audio and word times as one take, so later runs can use real speech and spend no credits.
const recorded = JSON.parse(readFileSync(join(runFolder, 'agent.json'), 'utf8')) as { turns: RecordedTurn[] };
const turns = recorded.turns.filter((turn) => !onlyTurn || turn.turnId === onlyTurn);
const sampleRate = turns[0]?.sampleRate ?? 0;
const parts: Buffer[] = [];
const words: { text: string; startMs: number }[] = [];
let takeMs = 0;
for (let round = 0; round < Number(repeatsText); round += 1) {
  for (const turn of turns) {
    const bytes = readFileSync(join(runFolder, `${turn.turnId}.pcm`));
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
    const leadMs = findFirstLoudMs(pcm, turn.sampleRate);
    for (const word of turn.words.flatMap((chunk) => chunk.words)) words.push({ text: word.text, startMs: word.startMs + leadMs + takeMs });
    parts.push(bytes);
    takeMs += (pcm.length / turn.sampleRate) * 1000;
  }
}
writeFileSync(outputPath, JSON.stringify({ sampleRate, base64: Buffer.concat(parts).toString('base64'), words }));
console.log(JSON.stringify({ sampleRate, seconds: Math.round(takeMs / 1000), words: words.length }));
