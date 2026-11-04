import { readFileSync } from 'node:fs';
import { summarise } from './read-trace.ts';

// Recomputes the figures in `docs/tests/voice.md` from the rows of its 30 real turns, as `run-voice-proof.ts --only turns` writes them.
const rows = JSON.parse(readFileSync(process.argv[2] ?? 'docs/tests/turn-rows.json', 'utf8')) as Record<string, unknown>[];
const names = Object.keys(rows[0] ?? {}).filter((name) => rows.some((row) => typeof row[name] === 'number'));
for (const name of names) console.log(name, JSON.stringify(summarise(rows.flatMap((row) => (typeof row[name] === 'number' ? [row[name]] : [])))));
