import { parseArgs } from 'node:util';
import { TURN_TIMINGS } from '../../../live/turn-rule.ts';
import { listTraces, readTrace, summarise, type TraceRow } from './read-trace.ts';

const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { room: { type: 'string' } } });

interface Mark {
  line: string;
  cleanup: boolean;
}

function getLineRows(rows: readonly TraceRow[]): { mark: Mark; rows: TraceRow[] }[] {
  const lines: { mark: Mark; rows: TraceRow[] }[] = [];
  for (const row of rows) {
    if (row.name === 'mark') lines.push({ mark: row.mark as Mark, rows: [] });
    else lines.at(-1)?.rows.push(row);
  }
  return lines;
}

function readLine({ mark, rows }: { mark: Mark; rows: TraceRow[] }) {
  const voiceEnded = rows.find((row) => row.name === 'voiceEnded');
  const final = rows.find((row) => row.name === 'words' && row.isFinal);
  const partial = rows.find((row) => row.name === 'words');
  const reply = rows.find((row) => row.name === 'replyDecided');
  const from = (row: TraceRow | undefined) => (row && voiceEnded ? Math.round(row.atMs - voiceEnded.atMs) : null);
  return { line: mark.line, cleanup: mark.cleanup, heard: final?.text ?? partial?.text ?? null, finalAfterVoiceEndedMs: from(final), replyAfterVoiceEndedMs: from(reply), via: reply?.via ?? null, hung: voiceEnded !== undefined && partial !== undefined && reply === undefined };
}

// Reads one microphone test from the agent's trace, so Abel only has to read lines aloud.
const folder = positionals[0] ?? process.env.ASTRA_VOICE_TRACE ?? '';
const rooms = args.room ? [args.room] : listTraces(folder);
const lines = rooms.flatMap((room) => getLineRows(readTrace(folder, room))).map(readLine);
console.table(lines);
for (const cleanup of [true, false]) {
  const pass = lines.filter((line) => line.cleanup === cleanup);
  if (pass.length === 0) continue;
  const finals = pass.flatMap((line) => (line.finalAfterVoiceEndedMs === null ? [] : [line.finalAfterVoiceEndedMs]));
  const replies = pass.flatMap((line) => (line.replyAfterVoiceEndedMs === null ? [] : [line.replyAfterVoiceEndedMs]));
  console.log(`cleanup ${cleanup ? 'on' : 'off'}: lines ${pass.length}, final after voice ended ${JSON.stringify(summarise(finals))}, reply after voice ended ${JSON.stringify(summarise(replies))}, from the partial ${pass.filter((line) => line.via === 'partial').length}, hung ${pass.filter((line) => line.hung).length}`);
}
console.log(`The bound now is ${TURN_TIMINGS.heldFinalMs} ms after the voice detector hears silence.`);
