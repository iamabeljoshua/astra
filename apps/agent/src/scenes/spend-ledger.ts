import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { UsageListener } from './scene-types.ts';

const STUDENT_WINDOW_MS = 24 * 60 * 60_000;

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

// Each charge is one appended line, the shape of M3.7's tutor ledger, because a rewrite would lose what another process spent.
export function createSpendLedger(path: string, limits: SpendLimits, { getNowMs = () => Date.now() }: { getNowMs?(): number } = {}) {
  const readLines = (): SpendLine[] => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as SpendLine) : []);
  const add = (lines: readonly SpendLine[]): Spending => lines.reduce<Spending>((sum, line) => ({ anthropicUsd: sum.anthropicUsd + (line.anthropicUsd ?? 0), voiceCharacters: sum.voiceCharacters + (line.voiceCharacters ?? 0) }), { anthropicUsd: 0, voiceCharacters: 0 });
  const readStudent = (studentId: string) => add(readLines().filter((line) => line.studentId === studentId && getNowMs() - line.atMs < STUDENT_WINDOW_MS));
  const read = (studentId?: string) => (studentId === undefined ? add(readLines()) : readStudent(studentId));
  const charge = (line: Omit<SpendLine, 'atMs'>) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ ...line, atMs: getNowMs() })}\n`);
  };
  const isOverModelLimit = (studentId: string) => read().anthropicUsd >= limits.limitUsd || read(studentId).anthropicUsd >= limits.studentLimitUsd;
  return {
    read,
    charge,
    isOverModelLimit,
    isOverVoiceLimit: (studentId: string, moreCharacters = 0) => read().voiceCharacters + moreCharacters > limits.voiceCharacterLimit || read(studentId).voiceCharacters + moreCharacters > limits.studentVoiceCharacterLimit,
    assertRoom(studentId: string) {
      if (isOverModelLimit(studentId)) throw new Error(`Stopped at the dollar limit for ${studentId}`);
    },
    getUsageListener: (getStudentId: () => string): UsageListener => ({ role, model, costUsd }) => charge({ studentId: getStudentId(), role, model, anthropicUsd: costUsd }),
  };
}
