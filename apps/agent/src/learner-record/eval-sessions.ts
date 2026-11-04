import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CheckedWork } from '@astra/board/shared';
import { parseBeat, type ElementId, type StudentWork } from '@astra/contracts';
import { createSessionDigest, type SessionDigest } from './session-digest.ts';

export interface RecordStep {
  student?: string;
  tutor?: string;
  tutorWrites?: string;
  work?: { text: string; status: 'right' | 'wrong' | 'unknown'; why?: string; task?: string; ink?: boolean };
}

export interface RecordSession {
  name: string;
  why: string;
  steps: RecordStep[];
  expect: { skippedBy?: 'safety' | 'nothingHappened'; kinds?: string[]; mustCite?: string[]; mustNotKinds?: string[]; mustNotSay?: string[] };
}

const EVALS = join(dirname(fileURLToPath(import.meta.url)), '../../../../evals/tutor-turns');
const EMPTY_TURN = { endedAs: 'ended' as const, beats: [] };

export const loadRecordSessions = () => JSON.parse(readFileSync(join(EVALS, 'record-sessions.json'), 'utf8')) as RecordSession[];
export const RECORDED_REPLIES_PATH = join(EVALS, 'results/record-replies.json');

function getTutorBeats({ tutorWrites }: RecordStep) {
  if (!tutorWrites) return [];
  const parsed = parseBeat({ id: 't1-b0', script: [{ kind: 'writeMath', id: 'steps', tex: tutorWrites, claim: 'new' }, 'Here.'], expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  return [parsed.value];
}

function toCheckedWork({ status, why }: NonNullable<RecordStep['work']>): CheckedWork {
  if (status === 'wrong') return { verdict: { status, why: why ?? 'wrong' } };
  return { verdict: { status } };
}

function toStudentWork({ text, task, ink }: NonNullable<RecordStep['work']>, index: number): StudentWork {
  return { way: 'write', id: `s${index + 1}` as ElementId, text, ...(task ? { task: task as ElementId } : {}), ...(ink ? { ink: { isUnsure: false } } : {}) };
}

// Feeds what a room would see, in the order it would see it, so a recorded session goes through the same code as a real one.
export function playSession(steps: readonly RecordStep[], digest: SessionDigest = createSessionDigest()): SessionDigest {
  steps.forEach((step, index) => {
    if (step.work) {
      digest.addWork(toStudentWork(step.work, index), toCheckedWork(step.work));
      digest.addTurn({ ...EMPTY_TURN, studentText: step.work.text, spokenText: step.tutor ?? '' });
    } else {
      digest.addTurn({ ...EMPTY_TURN, beats: getTutorBeats(step), studentText: step.student ?? '', spokenText: step.tutor ?? '' });
    }
  });
  return digest;
}
