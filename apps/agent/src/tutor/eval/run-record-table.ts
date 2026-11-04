import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadRecordSessions, playSession, RECORDED_REPLIES_PATH, type RecordSession } from '../../learner-record/eval-sessions.ts';
import { extractNotes } from '../../learner-record/extract-notes.ts';
import { getTrustedNotes, type TrustedNote } from '../../learner-record/trust-notes.ts';
import { readKey } from '../../keys.ts';
import { makeAnthropicTutorModel } from '../../providers/anthropic.ts';

const { values: args } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, save: { type: 'boolean', default: false }, runs: { type: 'string', default: '1' } } });

function getProblems({ expect }: RecordSession, notes: readonly TrustedNote[]): string[] {
  const kinds = new Set(notes.map(({ kind }) => kind as string));
  const words = JSON.stringify(notes).toLowerCase();
  const cited = notes.flatMap(({ evidence }) => evidence.map(({ text }) => text));
  return [
    ...(expect.kinds ?? []).filter((kind) => !kinds.has(kind)).map((kind) => `missing ${kind}`),
    ...(expect.mustNotKinds ?? []).filter((kind) => kinds.has(kind)).map((kind) => `has ${kind}`),
    ...(expect.mustCite ?? []).filter((line) => !cited.some((text) => text.includes(line))).map((line) => `does not cite ${line}`),
    ...(expect.mustNotSay ?? []).filter((word) => words.includes(word.toLowerCase())).map((word) => `says ${word}`),
  ];
}

const sessions = loadRecordSessions();
if (args['dry-run']) {
  for (const session of sessions) {
    const reading = playSession(session.steps).read();
    console.log(`${session.name}: ${reading.canRemember ? `${reading.events.length} lines` : `skipped by ${reading.why}`}`);
  }
  process.exit(0);
}

const model = makeAnthropicTutorModel({ name: 'haiku-5-5', apiKey: readKey('ANTHROPIC_API_KEY') });
const saved: Record<string, unknown[]> = {};
let totalUsd = 0;
let failures = 0;
for (let run = 0; run < Number(args.runs); run += 1) {
  for (const session of sessions) {
    const reading = playSession(session.steps).read();
    if (!reading.canRemember) {
      const isExpected = session.expect.skippedBy === reading.why;
      failures += isExpected ? 0 : 1;
      console.log(`${isExpected ? 'pass' : 'FAIL'} ${session.name}: skipped by ${reading.why}, no model call`);
      continue;
    }
    const { skip, candidates, costUsd } = await extractNotes(model, reading.events);
    totalUsd += costUsd;
    saved[session.name] = candidates;
    const { notes, refused } = skip ? { notes: [], refused: { modelSkipped: 1 } } : getTrustedNotes(candidates, reading.events);
    const problems = session.expect.skippedBy ? [`expected a skip by ${session.expect.skippedBy}`] : getProblems(session, notes);
    failures += problems.length > 0 ? 1 : 0;
    console.log(`${problems.length === 0 ? 'pass' : 'FAIL'} ${session.name}: $${costUsd.toFixed(5)} kept ${JSON.stringify(notes.map(({ kind, topic, detail }) => [kind, topic, detail]))} refused ${JSON.stringify(refused)} ${problems.join('; ')}`);
    if (problems.length > 0) console.log(`  proposed ${JSON.stringify(candidates)}\n  lines ${JSON.stringify(reading.events.map(({ id, text }) => [id, text]))}`);
  }
}
console.log(`${failures} failed. Spent $${totalUsd.toFixed(4)}.`);
if (args.save) {
  mkdirSync(dirname(RECORDED_REPLIES_PATH), { recursive: true });
  writeFileSync(RECORDED_REPLIES_PATH, `${JSON.stringify(saved, null, 1)}\n`);
}
process.exitCode = failures > 0 ? 1 : 0;
