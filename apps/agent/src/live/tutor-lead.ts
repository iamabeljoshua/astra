export type LeadKind = 'next' | 'noAnswer' | 'taskLeft' | 'taskTried';

export const LEAD_TIMINGS = {
  firstWordAfterMs: 1200,
  // Asked to slow down, the tutor leaves room to think between its turns. The voice's own pace cannot change on this path.
  slowFirstWordAfterMs: 4000,
  afterQuestionMs: 12_000,
  afterTaskMs: 40_000,
  // Once an ask has gone by untried, a student who is only listening should not sit through the same wait on every one.
  afterQuestionAgainMs: 7000,
  afterTaskAgainMs: 20_000,
  afterTaskTriedMs: 5000,
  // One key every 2.5 s once got 7 replies, and past this the page's next look says whether a draft is still there.
  afterKeyMs: 8000,
  mostQuietMs: 10 * 60_000,
  // A listener and a student who walked away look the same from here, so a running lesson goes to its own end. Its 16 ideas take about 25 minutes, and this is only for a plan that somehow never ends.
  mostQuietInALessonMs: 35 * 60_000,
};

export type LeadTimings = typeof LEAD_TIMINGS;

export const LEAD_WORDS: Readonly<Record<LeadKind, string>> = { next: '(carry on)', noAnswer: '(no answer)', taskLeft: '(did not try it)', taskTried: '(carry on after the exercise)' };

/** Why nothing goes on by itself. A lead's own turn can never move this, because only what a student does is an event. */
export type LeadStop =
  | 'none'
  /** They said stop or wait, or pressed stop. Ends when they say something real or work on the board. */
  | 'asked'
  /** A crisis, read at any moment. Ends only when they ask in their own words to be taught. */
  | 'crisis'
  /** The last reply failed, so another would likely fail too and spend for nothing. Any line from them ends it. */
  | 'replyFailed';

export type LeadStopEvent =
  | 'crisis'
  | 'askedToStop'
  | 'askedToBeTaught'
  | 'saidSomething'
  | 'workedOnBoard'
  | 'replyFailed'
  | 'replyWorked';

export function getLeadStopAfter(stop: LeadStop, event: LeadStopEvent): LeadStop {
  if (event === 'crisis') return 'crisis';
  if (stop === 'crisis') return event === 'askedToBeTaught' ? 'none' : 'crisis';
  if (event === 'askedToStop') return 'asked';
  if (event === 'replyFailed') return stop === 'none' ? 'replyFailed' : stop;
  if (event === 'replyWorked') return stop === 'replyFailed' ? 'none' : stop;
  return 'none';
}

export interface LeadFacts {
  isQuestionOpen: boolean;
  hasOpenTask: boolean;
  hasTriedTask: boolean;
  unansweredInARow: number;
  isPageHidden: boolean;
  quietForMs: number;
  hasLessonLeft: boolean;
  isPaceSlow?: boolean;
}

export interface Lead {
  kind: LeadKind;
  afterMs: number;
  firstWordAfterMs: number;
}

export function getLead({ isQuestionOpen, hasOpenTask, hasTriedTask, unansweredInARow, isPageHidden, quietForMs, hasLessonLeft, isPaceSlow = false }: LeadFacts, timings: LeadTimings = LEAD_TIMINGS): Lead | null {
  if (isPageHidden || quietForMs >= (hasLessonLeft ? timings.mostQuietInALessonMs : timings.mostQuietMs)) return null;
  if (hasOpenTask && hasTriedTask && !isQuestionOpen) return { kind: 'taskTried', afterMs: timings.afterTaskTriedMs, firstWordAfterMs: 0 };
  if (hasOpenTask) return { kind: 'taskLeft', afterMs: unansweredInARow > 0 ? timings.afterTaskAgainMs : timings.afterTaskMs, firstWordAfterMs: 0 };
  if (isQuestionOpen) return { kind: 'noAnswer', afterMs: unansweredInARow > 0 ? timings.afterQuestionAgainMs : timings.afterQuestionMs, firstWordAfterMs: 0 };
  return { kind: 'next', afterMs: 0, firstWordAfterMs: isPaceSlow ? timings.slowFirstWordAfterMs : timings.firstWordAfterMs };
}
