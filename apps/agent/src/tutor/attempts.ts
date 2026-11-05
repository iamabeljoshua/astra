export type AttemptReport = 'missed' | 'got';

export interface AttemptTracker {
  /** Counts a student who says they are stuck, whatever the model reports, and returns the note this turn's request carries. */
  startTurn(studentText: string): Record<string, string> | null;
  /** The note a turn with no sign of being stuck would carry, read without starting one. */
  getNote(): Record<string, string> | null;
  noteReport(report: AttemptReport): void;
  isAtDeadEnd(): boolean;
  endTurn(summary: { askedAQuestion: boolean; wasCut: boolean }): void;
}

/** Two misses on one point is a dead end, so the next thing the student hears shows the step, and no third question comes first. */
const MISSES_FOR_A_DEAD_END = 2;

const SOUNDS_STUCK = /\b(?:i\s*(?:do\s*n[o'’]?t|dont)\s*(?:know|get\s+it|understand)|idk|dunno|no\s*(?:idea|clue)|not\s+sure|i['’]?m\s+(?:lost|stuck)|i\s+give\s+up|i\s+can['’]?t\s+do\s+(?:it|this))\b/i;

export function parseAttemptReport(value: unknown): AttemptReport | null {
  if (typeof value !== 'object' || value === null || !('attempt' in value)) return null;
  const { attempt } = value as { attempt: unknown };
  return attempt === 'missed' || attempt === 'got' ? attempt : null;
}

function getAttemptsNote(misses: number): Record<string, string> | null {
  if (misses >= MISSES_FOR_A_DEAD_END) return { dead_end: 'They have missed this point twice. Do not ask about it again. Show the next step on the board now and say why it works, then give them a near identical small one to do.' };
  if (misses === 1) return { missed_once: 'They missed this point last time. If their message misses it too, that is two, so do not ask again: show the next step on the board and say why it works.' };
  return null;
}

// Code keeps this count, because the plan's dead-end rule must not rest on the model's memory. A turn with no miss in it ends the run, because the rule is about misses in a row.
export function createAttemptTracker(): AttemptTracker {
  let missesInARow = 0;
  let wasStudentAsked = false;
  let didStudentSayStuck = false;
  let report: AttemptReport | null = null;

  const getMissesNow = () => (report === 'missed' && !didStudentSayStuck ? missesInARow + 1 : missesInARow);
  const isAtDeadEnd = () => report !== 'got' && getMissesNow() >= MISSES_FOR_A_DEAD_END;

  return {
    startTurn(studentText) {
      didStudentSayStuck = wasStudentAsked && SOUNDS_STUCK.test(studentText);
      if (didStudentSayStuck) missesInARow += 1;
      report = null;
      return getAttemptsNote(missesInARow);
    },
    getNote: () => getAttemptsNote(missesInARow),
    noteReport(value) {
      report = value;
    },
    isAtDeadEnd,
    endTurn({ askedAQuestion, wasCut }) {
      if (wasCut) return;
      const hadMiss = report === 'missed' || didStudentSayStuck;
      missesInARow = isAtDeadEnd() || !hadMiss ? 0 : getMissesNow();
      wasStudentAsked = askedAQuestion;
    },
  };
}
