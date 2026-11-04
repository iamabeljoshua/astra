import { createSpendLedger } from '../spend-ledger.ts';

const PROOF = 'proof';

export function createProofLedger(path: string, limitUsd: number) {
  const ledger = createSpendLedger(path, { limitUsd, studentLimitUsd: Number.POSITIVE_INFINITY, voiceCharacterLimit: Number.POSITIVE_INFINITY, studentVoiceCharacterLimit: Number.POSITIVE_INFINITY });
  return { assertRoom: () => ledger.assertRoom(PROOF), onUsage: ledger.getUsageListener(() => PROOF), getSpentUsd: () => ledger.read().anthropicUsd };
}
