import type { LineReading, StudentWork, WorkVerdict } from '@astra/contracts';
import type { CheckedWork } from '@astra/board/shared';

/** Everything the rule sees. All of it is timing and code's own facts. */
export interface WatchSituation {
  secondsPaused: number;
  isTutorTalking: boolean;
  /** Since the tutor last asked a question, or null. */
  secondsSinceQuestion: number | null;
  /** Since this rule last made the tutor speak up, or null. */
  secondsSinceSpokeUp: number | null;
  /** What the student has typed and not sent. */
  draft: { text: string; reading: LineReading; verdict: WorkVerdict } | null;
  /** The student's latest sent work that the tutor has not yet replied to. */
  unanswered: { verdict: WorkVerdict; isSameWrongLineTwice: boolean } | null;
}

export type WatchDecision = { act: 'stay'; why: string } | { act: 'speak'; why: string } | { act: 'readWords' };

/** How long the rule waits, in seconds. A question gets 8 (PRD T5), and being talked over while thinking is worse than a late hint. */
export const WATCH_SECONDS = { afterQuestion: 8, afterSpeakingUp: 20, askingForHelp: 3, wordsToRead: 3, builtOnWrongLine: 5, sameWrongLineTwice: 5, wrongLineSat: 10, unjudgedWorkSat: 10, nothingChanged: 30 } as const;

const ASKING_FOR_HELP = /\b(help|stuck|don'?t (know|get)|no idea|confused|lost|is (this|that|it) (right|ok|correct))\b|\?\s*$/i;
const HOLDS_WORDS = /[a-z]{3,}/i;

const stay = (why: string): WatchDecision => ({ act: 'stay', why });
const speak = (why: string): WatchDecision => ({ act: 'speak', why });

function getGate({ isTutorTalking, secondsSinceQuestion, secondsSinceSpokeUp }: WatchSituation): WatchDecision | null {
  if (isTutorTalking) return stay('the tutor is talking');
  if (secondsSinceQuestion !== null && secondsSinceQuestion < WATCH_SECONDS.afterQuestion) return stay('the student is still answering a question');
  if (secondsSinceSpokeUp !== null && secondsSinceSpokeUp < WATCH_SECONDS.afterSpeakingUp) return stay('the tutor spoke up a moment ago');
  return null;
}

function decideOnDraft({ draft, secondsPaused }: WatchSituation & { draft: NonNullable<WatchSituation['draft']> }): WatchDecision {
  if (ASKING_FOR_HELP.test(draft.text) && secondsPaused >= WATCH_SECONDS.askingForHelp) return speak('asking for help in words');
  if (draft.verdict.status === 'wrong' && draft.verdict.isBuiltOnWrongLine && secondsPaused >= WATCH_SECONDS.builtOnWrongLine) return speak('building on a wrong line');
  if (draft.verdict.status === 'wrong' && secondsPaused >= WATCH_SECONDS.wrongLineSat) return speak('a complete wrong line has sat untouched');
  const isWords = draft.reading.kind === 'words' || draft.reading.kind === 'mixed';
  return isWords && HOLDS_WORDS.test(draft.text) && secondsPaused >= WATCH_SECONDS.wordsToRead ? { act: 'readWords' } : stay('the student is working');
}

function decideOnQuiet({ unanswered, secondsPaused }: WatchSituation): WatchDecision {
  if (unanswered?.isSameWrongLineTwice && secondsPaused >= WATCH_SECONDS.sameWrongLineTwice) return speak('the same wrong line twice');
  if (unanswered?.verdict.status === 'wrong' && secondsPaused >= WATCH_SECONDS.wrongLineSat) return speak('sent wrong work nobody answered');
  if (unanswered?.verdict.status === 'unknown' && secondsPaused >= WATCH_SECONDS.unjudgedWorkSat) return speak('work code cannot judge has sat');
  return secondsPaused >= WATCH_SECONDS.nothingChanged ? speak('nothing has changed for a long time') : stay('the student is thinking');
}

/** When to lean in is timing and facts, so code decides it. A model is asked only what typed words mean, and only when this says so. */
export function decideWatch(situation: WatchSituation): WatchDecision {
  const gate = getGate(situation);
  if (gate) return gate;
  return situation.draft ? decideOnDraft({ ...situation, draft: situation.draft }) : decideOnQuiet(situation);
}

export const WORD_MEANINGS = ['asksForHelp', 'needsAPerson', 'isThinking', 'unclear'] as const;
export type WordMeaning = (typeof WORD_MEANINGS)[number];

/** What a cheap model's reading can do. It can only ever answer the rule's own `readWords`, so a reading alone cannot interrupt. */
export function decideOnReading(decision: WatchDecision, meaning: WordMeaning | null): WatchDecision {
  if (decision.act !== 'readWords') return decision;
  if (meaning === 'asksForHelp' || meaning === 'needsAPerson') return speak(`their unsent words read as ${meaning}`);
  return stay('their unsent words ask nothing');
}

export type WorkDecision = { act: 'reply'; why: string } | { act: 'wait'; why: string };

const THINKING_ALOUD = /^(h+m+|u+m+|u+h+|e+r+|m+|mhm|o+k+|okay|alright|right|yeah|yep|wait|hold on|one sec(ond)?|sec|thinking|let me think|let me see|ah+|oh+|hm+ ok(ay)?)[\s.!,…]*$/i;
const PLAIN_SENTENCE = /^[\p{L}'’,.!? -]+$/u;
const FEWEST_WORDS_IN_A_SENTENCE = 3;

const reply = (why: string): WorkDecision => ({ act: 'reply', why });
const wait = (why: string): WorkDecision => ({ act: 'wait', why });

const isPlainSentence = (text: string) => PLAIN_SENTENCE.test(text) && text.trim().split(/\s+/).length >= FEWEST_WORDS_IN_A_SENTENCE;

function decideOnLine(text: string, reading: LineReading | undefined, checked: CheckedWork, hasTask: boolean): WorkDecision {
  if (THINKING_ALOUD.test(text.trim())) return wait('thinking aloud');
  // Words always reach the tutor, because a line of words can hold anything, and code cannot tell a thought from a student in danger.
  if (reading?.kind === 'words' || reading?.kind === 'mixed' || reading?.isAsking) return reply('the student said something');
  if (reading?.kind === 'code') return isPlainSentence(text) ? reply('the student said something') : wait('the student is writing code');
  if (!hasTask) return reply('there is no task, so this is meant for the tutor');
  const { status } = checked.verdict;
  if (status === 'wrong') return reply('code is certain the line is wrong');
  if (status === 'right') return checked.closesTask ? reply('the student finished') : wait('a right line, and the student is working');
  return wait('code cannot judge this line, so the tutor looks at a pause');
}

/** Whether the tutor answers this work now. Code decides, with no model. */
export function decideOnWork(work: StudentWork, checked: CheckedWork, hasTask: boolean): WorkDecision {
  switch (work.way) {
    case 'write':
      return decideOnLine(work.text, checked.reading, checked, hasTask);
    case 'pick':
      return reply('the student picked');
    case 'place':
      return work.placed.includes(null) ? wait('some slots are still empty') : reply('every slot is filled');
    case 'drag':
      return checked.verdict.status === 'right' ? reply('the point is there') : wait('the student may be trying places');
  }
}

/** The words the tutor's history holds for work that has no typed words. */
export function getWorkWords(work: StudentWork): string {
  switch (work.way) {
    case 'write':
      return work.text;
    case 'pick':
      return `(picked ${work.part})`;
    case 'place':
      return `(placed ${work.placed.map((item) => item ?? 'nothing').join(', ')})`;
    case 'drag':
      return `(moved the point to x = ${work.x})`;
  }
}
