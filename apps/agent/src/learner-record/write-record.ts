import type { TutorModelAdapter } from '../providers/types.ts';
import type { TraceNote } from '../tutor/brain.ts';
import { extractNotes } from './extract-notes.ts';
import type { SessionDigest } from './session-digest.ts';
import { getTrustedNotes, type TrustedNote } from './trust-notes.ts';

export interface RecordPass {
  digest: Pick<SessionDigest, 'read'>;
  model: Pick<TutorModelAdapter, 'stream' | 'getCostUsd'>;
  writeNotes(update: { updateKey: string; notes: TrustedNote[] }): Promise<unknown>;
  updateKey: string;
  isOverSpendLimit(): boolean;
  addCost(usd: number): void;
  trace: TraceNote;
}

const WRITE_ATTEMPTS = 2;

async function sendNotes({ writeNotes, updateKey, trace }: RecordPass, notes: TrustedNote[]): Promise<void> {
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    try {
      await writeNotes({ updateKey, notes });
      return;
    } catch (error) {
      trace('recordWriteFailed', { attempt, problem: String(error) });
    }
  }
}

async function runPass(pass: RecordPass): Promise<void> {
  const { digest, model, isOverSpendLimit, addCost, trace } = pass;
  const reading = digest.read();
  if (!reading.canRemember) return trace('recordPassSkipped', { why: reading.why });
  if (isOverSpendLimit()) return trace('recordPassSkipped', { why: 'spendLimit' });
  const { skip, candidates, costUsd } = await extractNotes(model, reading.events);
  addCost(costUsd);
  if (skip) return trace('recordPassSkipped', { why: 'modelSawSafety', costUsd });
  const { notes, refused } = getTrustedNotes(candidates, reading.events);
  trace('recordPassDone', { kept: notes.length, refused, costUsd });
  if (notes.length > 0) await sendNotes(pass, notes);
}

// Runs as a room closes, after the student has gone. It cannot throw, so a failed pass costs the notes and nothing else, and a repeat of the same key adds nothing.
export async function writeRecordOfRoom(pass: RecordPass): Promise<void> {
  try {
    await runPass(pass);
  } catch (error) {
    pass.trace('recordPassFailed', { problem: String(error) });
  }
}
