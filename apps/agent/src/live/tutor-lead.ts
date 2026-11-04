/** Why the tutor is speaking with nobody having asked. A short turn holds one thought, so depth has to come from many turns in a row. */
export type LeadKind = 'next' | 'noAnswer' | 'taskLeft' | 'taskTried' | 'checkIn';

export const LEAD_TIMINGS = {
  /** The model starts as the last reply ends, because its own first beat takes about 1.8 s to reach the voice, so a student hears about 2 s of quiet and this only holds a quick model back. */
  firstWordAfterMs: 1200,
  /** Longer than the 8 s the watcher gives a student still answering, and short enough that a quiet student is not left alone with it. */
  afterQuestionMs: 15_000,
  /** A student working on paper needs a while, and the watcher has already leaned in at 30 s. */
  afterTaskMs: 60_000,
  /** They had a go and the tutor has answered it, so this only leaves a moment to look at the board or to try again. */
  afterTaskTriedMs: 5000,
};

export type LeadTimings = typeof LEAD_TIMINGS;

/** Two asks in a row with no sign of anyone, and the third thing they hear is a gentle check, after which the tutor holds until they come back. A forgotten tab must not pay for a lesson nobody hears. */
export const MOST_UNANSWERED_IN_A_ROW = 2;
/** A backstop for a reply that never asks anything, so even then a run with no sign of anyone stops. */
export const MOST_QUIET_LEADS = 30;

/** Code's own words in the student's place. They stay in brackets, so the planner and the prompt can never read them as the student's. */
export const LEAD_WORDS: Readonly<Record<LeadKind, string>> = { next: '(carry on)', noAnswer: '(no answer)', taskLeft: '(did not try it)', taskTried: '(carry on after the exercise)', checkIn: '(still quiet)' };

export interface LeadFacts {
  isQuestionOpen: boolean;
  hasOpenTask: boolean;
  /** They had a go at the open task, code does not say it was wrong, and the tutor has answered it. */
  hasTriedTask: boolean;
  /** Asks that went unanswered with no sign of the student since. */
  unansweredInARow: number;
  quietLeads: number;
  mostQuietLeads: number;
}

export interface Lead {
  kind: LeadKind;
  afterMs: number;
  firstWordAfterMs: number;
}

export function getLead({ isQuestionOpen, hasOpenTask, hasTriedTask, unansweredInARow, quietLeads, mostQuietLeads }: LeadFacts, timings: LeadTimings = LEAD_TIMINGS): Lead | null {
  if (quietLeads >= mostQuietLeads) return null;
  if (hasOpenTask && hasTriedTask && !isQuestionOpen) return { kind: 'taskTried', afterMs: timings.afterTaskTriedMs, firstWordAfterMs: 0 };
  const isAsked = hasOpenTask || isQuestionOpen;
  if (!isAsked) return { kind: 'next', afterMs: 0, firstWordAfterMs: timings.firstWordAfterMs };
  const afterMs = hasOpenTask ? timings.afterTaskMs : timings.afterQuestionMs;
  if (unansweredInARow + 1 >= MOST_UNANSWERED_IN_A_ROW) return { kind: 'checkIn', afterMs, firstWordAfterMs: 0 };
  return { kind: hasOpenTask ? 'taskLeft' : 'noAnswer', afterMs, firstWordAfterMs: 0 };
}
