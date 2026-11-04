import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { UsageListener } from './scene-types.ts';

const DAY_MS = 24 * 60 * 60_000;
const MS_PER_SECOND = 1000;

export interface SpendLimits {
  limitUsd: number;
  studentLimitUsd: number;
  voiceCharacterLimit: number;
  studentVoiceCharacterLimit: number;
}

interface Spending {
  anthropicUsd: number;
  voiceCharacters: number;
}

interface SpendLine extends Partial<Spending> {
  studentId: string;
  atMs: number;
  role?: string;
  model?: string;
}

export type SpendLedger = ReturnType<typeof createSpendLedger>;

export type ModelLimit = 'student' | 'everyone';

// Each charge is one appended line, the shape of M3.7's tutor ledger, because a rewrite would lose what another process spent. Every limit counts one UTC day, as M3.7's does, so a spent day ends for everyone at the same moment.
export function createSpendLedger(path: string, limits: SpendLimits, { getNowMs = () => Date.now() }: { getNowMs?(): number } = {}) {
  const getDay = (atMs: number) => Math.floor(atMs / DAY_MS);
  const readToday = (): SpendLine[] => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as SpendLine) : []).filter((line) => getDay(line.atMs) === getDay(getNowMs()));
  const add = (lines: readonly SpendLine[]): Spending => lines.reduce<Spending>((sum, line) => ({ anthropicUsd: sum.anthropicUsd + (line.anthropicUsd ?? 0), voiceCharacters: sum.voiceCharacters + (line.voiceCharacters ?? 0) }), { anthropicUsd: 0, voiceCharacters: 0 });
  const read = (studentId?: string) => add(studentId === undefined ? readToday() : readToday().filter((line) => line.studentId === studentId));
  const charge = (line: Omit<SpendLine, 'atMs'>) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ ...line, atMs: getNowMs() })}\n`);
  };
  const getModelLimitReached = (studentId: string): ModelLimit | null => {
    if (read().anthropicUsd >= limits.limitUsd) return 'everyone';
    return read(studentId).anthropicUsd >= limits.studentLimitUsd ? 'student' : null;
  };
  const isOverModelLimit = (studentId: string) => getModelLimitReached(studentId) !== null;
  return {
    read,
    charge,
    getModelLimitReached,
    isOverModelLimit,
    getSecondsToNextDay: () => Math.ceil(((getDay(getNowMs()) + 1) * DAY_MS - getNowMs()) / MS_PER_SECOND),
    /** A shared line is kept for every later student, so its first play answers only to the project's ceiling. */
    isOverSharedVoiceLimit: (moreCharacters = 0) => read().voiceCharacters + moreCharacters > limits.voiceCharacterLimit,
    isOverVoiceLimit: (studentId: string, moreCharacters = 0) => read().voiceCharacters + moreCharacters > limits.voiceCharacterLimit || read(studentId).voiceCharacters + moreCharacters > limits.studentVoiceCharacterLimit,
    assertRoom(studentId: string) {
      if (isOverModelLimit(studentId)) throw new Error(`Stopped at the dollar limit for ${studentId}`);
    },
    getUsageListener: (getStudentId: () => string): UsageListener => ({ role, model, costUsd }) => charge({ studentId: getStudentId(), role, model, anthropicUsd: costUsd }),
  };
}
