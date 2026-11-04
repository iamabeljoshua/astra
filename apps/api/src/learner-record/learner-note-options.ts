/**
 * What a note says about a student. Each kind has its own bar for evidence, in `isBackedByEvidence`.
 * `showed` and not "knows", because one right line on one day is what code really saw.
 */
export const LEARNER_NOTE_KINDS = ['showed', 'struggled', 'cares_about', 'explored'] as const;
export type LearnerNoteKind = (typeof LEARNER_NOTE_KINDS)[number];

/** `board` is a line of math or a task that code checked. `words` says a note stands on what the student said, and holds none of it. */
export const LEARNER_EVIDENCE_SOURCES = ['board', 'words'] as const;
export type LearnerEvidenceSource = (typeof LEARNER_EVIDENCE_SOURCES)[number];

export const LEARNER_EVIDENCE_CHECKS = ['right', 'wrong'] as const;
export type LearnerEvidenceCheck = (typeof LEARNER_EVIDENCE_CHECKS)[number];

export interface LearnerEvidence {
  source: LearnerEvidenceSource;
  text: string;
  check: LearnerEvidenceCheck | null;
}

export const MAX_TOPIC_LENGTH = 60;
export const MAX_DETAIL_LENGTH = 120;
export const MAX_EVIDENCE_TEXT_LENGTH = 160;
export const MAX_EVIDENCE_PER_NOTE = 4;
export const MAX_NOTES_PER_UPDATE = 8;
export const MAX_UPDATE_KEY_LENGTH = 120;

const NOT_TOPIC_KEY_CHARACTERS = /[^\p{L}\p{N}]+/gu;

export function getTopicKey(topic: string): string {
  return topic.toLowerCase().replace(NOT_TOPIC_KEY_CHARACTERS, ' ').trim();
}

const isBoardLine = (check: LearnerEvidenceCheck) => (evidence: LearnerEvidence) => evidence.source === 'board' && evidence.check === check;
const isTheirWords = (evidence: LearnerEvidence) => evidence.source === 'words';
const keepsNoFreeWords = ({ source, text }: LearnerEvidence) => (source === 'words' ? text === '' : text !== '');

// The bar each kind must clear. Only a line code marked right can say a student showed something, and a wrong line stops it.
export function isBackedByEvidence(kind: LearnerNoteKind, evidence: LearnerEvidence[]): boolean {
  if (!evidence.every(keepsNoFreeWords)) return false;
  if (kind === 'showed') return evidence.some(isBoardLine('right')) && !evidence.some(isBoardLine('wrong'));
  if (kind === 'struggled') return evidence.some(isBoardLine('wrong')) || evidence.some(isTheirWords);
  if (kind === 'cares_about') return evidence.some(isTheirWords);
  return evidence.length > 0;
}
