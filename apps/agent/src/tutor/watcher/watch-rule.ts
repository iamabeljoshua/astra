import type { LineReading, StudentWork, WorkVerdict } from '@astra/contracts';
import { type CheckedWork, getLineTex, isFinishedAnswer, isThinkingAloud } from '@astra/board/shared';

export interface WatchSituation {
  secondsPaused: number;
  isTutorTalking: boolean;
  secondsSinceQuestion: number | null;
  secondsSinceSpokeUp: number | null;
  draft: { text: string; reading: LineReading; verdict: WorkVerdict } | null;
  unanswered: { verdict: WorkVerdict; isSameWrongLineTwice: boolean } | null;
  hasOpenTask: boolean;
  hasLeanedInOnThisSilence: boolean;
  isLeadStopped?: boolean;
}

export type WatchDecision = { act: 'stay'; why: string } | { act: 'speak'; why: string } | { act: 'readWords' };

export const WATCH_SECONDS = { afterQuestion: 8, afterSpeakingUp: 20, askingForHelp: 3, wordsToRead: 3, builtOnWrongLine: 5, sameWrongLineTwice: 5, wrongLineSat: 10, unjudgedWorkSat: 10, nothingChanged: 30 } as const;

const ASKING_FOR_HELP = /\b(help|stuck|don'?t (know|get)|no idea|confused|lost|is (this|that|it) (right|ok|correct))\b|\?\s*$/i;
const HOLDS_WORDS = /[a-z]{3,}/i;

const stay = (why: string): WatchDecision => ({ act: 'stay', why });
const speak = (why: string): WatchDecision => ({ act: 'speak', why });

export function getGate({ isTutorTalking, secondsSinceQuestion, secondsSinceSpokeUp, isLeadStopped = false }: WatchSituation): WatchDecision | null {
  if (isTutorTalking) return stay('the tutor is talking');
  if (isLeadStopped) return stay('nothing goes on by itself now');
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

function decideOnQuiet({ unanswered, secondsPaused, hasOpenTask, hasLeanedInOnThisSilence }: WatchSituation): WatchDecision {
  if (unanswered?.isSameWrongLineTwice && secondsPaused >= WATCH_SECONDS.sameWrongLineTwice) return speak('the same wrong line twice');
  if (unanswered?.verdict.status === 'wrong' && secondsPaused >= WATCH_SECONDS.wrongLineSat) return speak('sent wrong work nobody answered');
  if (unanswered?.verdict.status === 'unknown' && secondsPaused >= WATCH_SECONDS.unjudgedWorkSat) return speak('work code cannot judge has sat');
  return hasOpenTask && !hasLeanedInOnThisSilence && secondsPaused >= WATCH_SECONDS.nothingChanged ? speak('nothing has changed for a long time') : stay('the student is thinking');
}

export function decideWatch(situation: WatchSituation): WatchDecision {
  const gate = getGate(situation);
  if (gate) return gate;
  return situation.draft ? decideOnDraft({ ...situation, draft: situation.draft }) : decideOnQuiet(situation);
}

export const WORD_MEANINGS = ['asksForHelp', 'needsAPerson', 'isThinking', 'unclear'] as const;
export type WordMeaning = (typeof WORD_MEANINGS)[number];

export function decideOnReading(decision: WatchDecision, meaning: WordMeaning | null): WatchDecision {
  if (decision.act !== 'readWords') return decision;
  if (meaning === 'asksForHelp' || meaning === 'needsAPerson') return speak(`their unsent words read as ${meaning}`);
  return stay('their unsent words ask nothing');
}

export type WorkDecision = { act: 'reply'; why: string } | { act: 'wait'; why: string };

const PLAIN_SENTENCE = /^[\p{L}'’,.!? -]+$/u;
const FEWEST_WORDS_IN_A_SENTENCE = 3;

const reply = (why: string): WorkDecision => ({ act: 'reply', why });
const wait = (why: string): WorkDecision => ({ act: 'wait', why });

const isPlainSentence = (text: string) => PLAIN_SENTENCE.test(text) && text.trim().split(/\s+/).length >= FEWEST_WORDS_IN_A_SENTENCE;

function decideOnLine(text: string, reading: LineReading | undefined, checked: CheckedWork, hasTask: boolean): WorkDecision {
  if (isThinkingAloud(text)) return wait('thinking aloud');
  if (reading?.kind === 'words' || reading?.kind === 'mixed' || reading?.isAsking) return reply('the student said something');
  if (reading?.kind === 'code') return isPlainSentence(text) ? reply('the student said something') : wait('the student is writing code');
  if (!hasTask) return reply('there is no task, so this is meant for the tutor');
  const { status } = checked.verdict;
  if (status === 'wrong') return reply('code is certain the line is wrong');
  const tex = reading ? getLineTex(reading) : null;
  if (status === 'right') return checked.closesTask || (tex !== null && isFinishedAnswer(tex)) ? reply('the student finished') : wait('a right line, and the student is working');
  if (status === 'unknown' && checked.verdict.offProblem !== undefined) return reply('the line does not follow from the problem on the board');
  return tex !== null && isFinishedAnswer(tex) ? reply('the student gave an answer code cannot judge') : wait('code cannot judge this line, so the tutor looks at a pause');
}

export function decideOnWork(work: StudentWork, checked: CheckedWork, hasTask: boolean): WorkDecision {
  switch (work.way) {
    case 'write':
      return decideOnLine(work.text, checked.reading, checked, hasTask);
    case 'leave':
      return reply('the student wants something else');
    case 'pick':
      return reply('the student picked');
    case 'place':
      return work.placed.includes(null) ? wait('some slots are still empty') : reply('every slot is filled');
    case 'drag':
      return reply('the student let go of the point');
  }
}

export function decideOnSpokenWork(work: StudentWork, checked: CheckedWork, hasTask: boolean): WorkDecision {
  return checked.verdict.status === 'unknown' ? reply('the student spoke and code cannot judge it') : decideOnWork(work, checked, hasTask);
}

export function getWorkWords(work: StudentWork): string {
  switch (work.way) {
    case 'write':
      return work.text;
    case 'leave':
      return '(wants something else)';
    case 'pick':
      return `(picked ${work.part})`;
    case 'place':
      return `(placed ${work.placed.map((item) => item ?? 'nothing').join(', ')})`;
    case 'drag':
      return `(moved the point to x = ${work.x})`;
  }
}
