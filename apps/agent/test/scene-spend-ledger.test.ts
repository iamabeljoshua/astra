import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSpendLedger } from '../src/scenes/spend-ledger.ts';

const NOON = Date.UTC(2026, 10, 4, 12);
const NEXT_DAY = Date.UTC(2026, 10, 5, 0, 0, 1);

function setUp() {
  let nowMs = NOON;
  const ledger = createSpendLedger(join(mkdtempSync(join(tmpdir(), 'spend-')), 'spend.jsonl'), { limitUsd: 20, studentLimitUsd: 2, voiceCharacterLimit: 100, studentVoiceCharacterLimit: 50 }, { getNowMs: () => nowMs });
  return { ledger, setNow: (ms: number) => (nowMs = ms) };
}

describe('the daily limits', () => {
  it('resets the all-student dollar limit on a new UTC day, as M3.7 does', () => {
    const { ledger, setNow } = setUp();
    ledger.charge({ studentId: 'maya', anthropicUsd: 25 });
    expect(ledger.isOverModelLimit('tola')).toBe(true);
    setNow(NEXT_DAY);
    expect(ledger.isOverModelLimit('tola')).toBe(false);
  });

  it('resets the all-student voice limit on a new UTC day', () => {
    const { ledger, setNow } = setUp();
    ledger.charge({ studentId: 'maya', voiceCharacters: 100 });
    expect(ledger.isOverVoiceLimit('tola', 1)).toBe(true);
    setNow(NEXT_DAY);
    expect(ledger.isOverVoiceLimit('tola', 1)).toBe(false);
  });

  it('counts a student by the UTC day too, not the last 24 hours', () => {
    const { ledger, setNow } = setUp();
    ledger.charge({ studentId: 'maya', anthropicUsd: 2 });
    setNow(NEXT_DAY);
    expect(ledger.isOverModelLimit('maya')).toBe(false);
  });

  it('says which limit a student hit, and how long until the next UTC day', () => {
    const { ledger } = setUp();
    expect(ledger.getModelLimitReached('maya')).toBeNull();
    ledger.charge({ studentId: 'maya', anthropicUsd: 2 });
    expect(ledger.getModelLimitReached('maya')).toBe('student');
    expect(ledger.getModelLimitReached('tola')).toBeNull();
    ledger.charge({ studentId: 'tola', anthropicUsd: 20 });
    expect(ledger.getModelLimitReached('ada')).toBe('everyone');
    expect(ledger.getSecondsToNextDay()).toBe(12 * 60 * 60);
  });
});
