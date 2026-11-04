import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { UsageListener } from '../scene-types.ts';

interface Ledger {
  anthropicUsd: number;
  calls: { role: string; model: string; ms: number; costUsd: number; at: string; note: string }[];
}

const readLedger = (path: string): Ledger => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Ledger) : { anthropicUsd: 0, calls: [] });

/** A proof's own hard limit on real money, measured from usage and kept across runs. */
export function createSpendLedger({ path, limitUsd, note }: { path: string; limitUsd: number; note: string }) {
  const assertRoom = () => {
    const { anthropicUsd } = readLedger(path);
    if (anthropicUsd >= limitUsd) throw new Error(`Stopped at the limit, $${anthropicUsd.toFixed(3)} of $${limitUsd}`);
  };
  const onUsage: UsageListener = ({ role, model, ms, costUsd }) => {
    const ledger = readLedger(path);
    ledger.anthropicUsd += costUsd;
    ledger.calls.push({ role, model, ms: Math.round(ms), costUsd, at: new Date().toISOString(), note });
    writeFileSync(path, JSON.stringify(ledger, null, 1));
    assertRoom();
  };
  return { assertRoom, onUsage, getSpentUsd: () => readLedger(path).anthropicUsd };
}
