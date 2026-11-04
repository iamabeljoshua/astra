import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SceneUsage, UsageListener } from '../scene-types.ts';

/** Where a try stopped. Only a refusal or a plan problem needs new words, because a failed drawing can be redrawn from the same plan. */
export type TryStage = 'plan' | 'draw' | 'review' | 'error' | 'saved';

interface ChargeLine extends SceneUsage {
  kind: 'charge';
  entryId: string;
  role: Parameters<UsageListener>[0]['role'];
  atMs: number;
}

interface TryLine {
  kind: 'try';
  entryId: string;
  stage: TryStage;
  reasons: readonly string[];
  atMs: number;
}

type LedgerLine = ChargeLine | TryLine;

export type LibraryLedger = ReturnType<typeof createLibraryLedger>;

// A crash can tear the last line, and that costs at most one cent of counting. The next line starts fresh, so the tear costs only itself.
function readLines(path: string): LedgerLine[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  if (text !== '' && !text.endsWith('\n')) appendFileSync(path, '\n');
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line) as LedgerLine];
    } catch {
      return [];
    }
  });
}

// Unlike a lesson's ledger this one never rolls over at midnight, because the ceiling is for the whole library, however many days the run takes.
export function createLibraryLedger(path: string, { getNowMs = () => Date.now() }: { getNowMs?(): number } = {}) {
  const lines = readLines(path);
  const append = (line: LedgerLine) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(line)}\n`);
    lines.push(line);
  };
  const getCharges = () => lines.filter((line): line is ChargeLine => line.kind === 'charge');
  const getTryLines = (entryId: string) => lines.filter((line): line is TryLine => line.kind === 'try' && line.entryId === entryId);
  const sum = (charges: readonly ChargeLine[]) => charges.reduce((total, { costUsd }) => total + costUsd, 0);
  return {
    getUsageListener: (entryId: string): UsageListener => ({ role, model, ms, costUsd }) => append({ kind: 'charge', entryId, role, model, ms, costUsd, atMs: getNowMs() }),
    noteTry: (entryId: string, stage: TryStage, reasons: readonly string[] = []) => append({ kind: 'try', entryId, stage, reasons, atMs: getNowMs() }),
    getTotalUsd: () => sum(getCharges()),
    getEntryUsd: (entryId: string) => sum(getCharges().filter((line) => line.entryId === entryId)),
    getEntryTries: (entryId: string) => getTryLines(entryId).length,
    getLastTry: (entryId: string): TryLine | null => getTryLines(entryId).at(-1) ?? null,
    getLines: (): readonly LedgerLine[] => lines,
  };
}
