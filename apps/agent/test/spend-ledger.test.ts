import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSpendLedger } from '../src/tutor/spend-ledger.ts';

describe('the spend ledger', () => {
  const folder = mkdtempSync(join(tmpdir(), 'astra-ledger-'));
  afterEach(() => rmSync(join(folder, 'spend.jsonl'), { force: true }));

  it('adds up every charge, and two writers lose none', () => {
    const limits = { limitUsd: 1, limitCredits: 100 };
    const first = createSpendLedger(join(folder, 'spend.jsonl'), limits);
    const second = createSpendLedger(join(folder, 'spend.jsonl'), limits);
    for (let charge = 0; charge < 50; charge += 1) {
      first.charge({ anthropicUsd: 0.01 });
      second.charge({ voiceCharacters: 9 });
    }
    expect(first.read().anthropicUsd).toBeCloseTo(0.5);
    expect(second.read().voiceCharacters).toBe(450);
    expect(first.isOverModelLimit()).toBe(false);
    second.charge({ anthropicUsd: 0.5 });
    expect(first.isOverModelLimit()).toBe(true);
  });
});
