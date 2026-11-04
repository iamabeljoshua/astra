export type LeadKind = 'next' | 'noAnswer' | 'taskLeft' | 'taskTried' | 'checkIn';

export const LEAD_TIMINGS = {
  firstWordAfterMs: 1200,
  afterQuestionMs: 15_000,
  afterTaskMs: 60_000,
  afterTaskTriedMs: 5000,
};

export type LeadTimings = typeof LEAD_TIMINGS;

export const MOST_UNANSWERED_IN_A_ROW = 2;
export const MOST_QUIET_LEADS = 30;

export const LEAD_WORDS: Readonly<Record<LeadKind, string>> = { next: '(carry on)', noAnswer: '(no answer)', taskLeft: '(did not try it)', taskTried: '(carry on after the exercise)', checkIn: '(still quiet)' };

export interface LeadFacts {
  isQuestionOpen: boolean;
  hasOpenTask: boolean;
  hasTriedTask: boolean;
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
