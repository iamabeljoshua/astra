/** Why the tutor is speaking with nobody having asked. A short turn holds one thought, so depth has to come from many turns in a row. */
export type LeadKind = 'next' | 'mustAsk' | 'noAnswer' | 'taskLeft';

export const LEAD_TIMINGS = {
  /** The model starts as the last reply ends, because its own first beat takes about 1.8 s to reach the voice, so a student hears about 2 s of quiet and this only holds a quick model back. */
  firstWordAfterMs: 1200,
  /** Longer than the 8 s the watcher gives a student still answering, and short enough that a quiet student is not left alone with it. */
  afterQuestionMs: 15_000,
  /** A student working on paper needs a while, and the watcher has already leaned in at 30 s. */
  afterTaskMs: 60_000,
};

export type LeadTimings = typeof LEAD_TIMINGS;

/** A tutor and not a lecture. Past this a reply must ask something or set something. */
export const MOST_REPLIES_IN_A_RUN = 3;
/** About 8 minutes with no sign of anyone. A forgotten tab would otherwise keep paying for words nobody hears, up to the session's cap. */
export const MOST_QUIET_LEADS = 24;

/** Code's own words in the student's place. They stay in brackets, so the planner and the prompt can never read them as the student's. */
export const LEAD_WORDS: Readonly<Record<LeadKind, string>> = { next: '(carry on)', mustAsk: '(carry on, then ask)', noAnswer: '(no answer)', taskLeft: '(did not try it)' };

export interface LeadFacts {
  isQuestionOpen: boolean;
  hasOpenTask: boolean;
  /** Replies in a row since the student last did something or the tutor last asked something. */
  repliesInARun: number;
  quietLeads: number;
  mostQuietLeads: number;
}

export interface Lead {
  kind: LeadKind;
  afterMs: number;
  firstWordAfterMs: number;
}

export function getLead({ isQuestionOpen, hasOpenTask, repliesInARun, quietLeads, mostQuietLeads }: LeadFacts, timings: LeadTimings = LEAD_TIMINGS): Lead | null {
  if (quietLeads >= mostQuietLeads) return null;
  if (hasOpenTask) return { kind: 'taskLeft', afterMs: timings.afterTaskMs, firstWordAfterMs: 0 };
  if (isQuestionOpen) return { kind: 'noAnswer', afterMs: timings.afterQuestionMs, firstWordAfterMs: 0 };
  const isLastOfARun = repliesInARun + 1 >= MOST_REPLIES_IN_A_RUN || quietLeads + 1 >= mostQuietLeads;
  return { kind: isLastOfARun ? 'mustAsk' : 'next', afterMs: 0, firstWordAfterMs: timings.firstWordAfterMs };
}
