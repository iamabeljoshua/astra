export type LeadKind = 'next' | 'noAnswer' | 'taskLeft' | 'taskTried';

export const LEAD_TIMINGS = {
  // A breath between teaching replies, so the student can still jump in. The voice's first audio adds about 300 ms to it.
  firstWordAfterMs: 250,
  slowFirstWordAfterMs: 4000,
  /** A student who just made a sound or a key gets this long before a reply follows it. */
  afterStudentSignMs: 1200,
  afterQuestionMs: 8000,
  afterTaskMs: 30_000,
  // Once an ask has gone by untried, a student who is only listening should not sit through the same wait on every one.
  afterQuestionAgainMs: 5000,
  afterTaskAgainMs: 15_000,
  afterTaskTriedMs: 3000,
  afterKeyMs: 8000,
  mostQuietMs: 10 * 60_000,
  // A listener and a student who walked away look the same from here, so a running lesson goes to its own end, and this is only for a plan that somehow never ends.
  mostQuietInALessonMs: 35 * 60_000,
};

export type LeadTimings = typeof LEAD_TIMINGS;

export const LEAD_WORDS: Readonly<Record<LeadKind, string>> = { next: '(carry on)', noAnswer: '(no answer)', taskLeft: '(did not try it)', taskTried: '(carry on after the exercise)' };

export type LeadStop =
  | 'none'
  | 'held'
  | 'paused'
  | 'crisis'
  | 'replyFailed';

export type LeadStopEvent =
  | 'crisis'
  | 'hold'
  | 'pause'
  | 'replyWaits'
  | 'replyAsks'
  | 'nod'
  | 'askedToBeTaught'
  | 'saidSomething'
  | 'workedOnBoard'
  | 'cleanRead'
  | 'replyFailed'
  | 'replyWorked';

export function getLeadStopAfter(stop: LeadStop, event: LeadStopEvent): LeadStop {
  if (event === 'crisis') return 'crisis';
  if (stop === 'crisis') return event === 'askedToBeTaught' || event === 'cleanRead' ? 'none' : 'crisis';
  if (event === 'cleanRead') return stop;
  if (event === 'hold') return 'held';
  if (event === 'pause') return 'paused';
  if (event === 'replyWaits') return stop === 'paused' ? 'paused' : 'held';
  if (event === 'replyAsks') return stop === 'held' ? 'held' : 'paused';
  if (event === 'nod') return stop === 'paused' ? 'none' : stop;
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
