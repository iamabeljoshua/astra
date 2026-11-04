import { type Beat, getSpokenWords, parseBeat, type SessionRecap } from '@astra/contracts';
import { SAFETY_REPLY } from '../tutor/beat-text-reader.ts';
import type { RecapFacts } from './recap-facts.ts';

export const GENTLE_LINE = "Thanks for talking with me today. You don't have to carry this alone. Please tell an adult you trust, or call your local emergency number. I'm here whenever you want to come back.";

/** Below this, the tutor said little more than hello, so there is nothing to look back on. */
const FEWEST_TUTOR_WORDS_TO_RECAP = 30;
const MOST_WORDS_IN_A_LINE = 22;
const MOST_WORDS_IN_A_RECAP = 60;
const SHORTEST_ANCHOR_LETTERS = 5;

/** A student's own words that mean this ending must be gentle, whatever else the session held. A wrong match costs one gentle ending, and a miss costs praise after a disclosure. */
const NEEDS_CARE = /\b(?:suicid\w*|sewerslide|kms|kill(?:ing)? myself|end(?:ing)? (?:my life|it all)|wan(?:t|na) to die|wanna die|don'?t want to (?:be here|live|be alive)|hurt(?:ing)? myself|cut(?:ting)? myself|harm(?:ing)? myself|self[- ]harm|overdose|(?:hits?|hurts?|beats?|touche[sd]|touch|rapes?|raped|abuses?|abused) me|i'?m not safe|not safe at home|have a plan for how to do it)\b/i;

const PRAISE = /\b(?:great|amazing|awesome|excellent|fantastic|wonderful|perfect(?:ly)?|brilliant|superb|incredible|impressive|outstanding|proud|genius|smart|well done|good job|nice (?:job|work)|nailed|crushed|keep it up|way to go)\b/i;

/** Saying the student did something is what `gotRight` is for, and only code's own verdicts back it. */
const CLAIMS_SUCCESS = /\b(?:you (?:got|solved|figured|mastered|understood|learned|learnt|answered|worked out|managed|finished|completed|found|can now)|correct(?:ly)?)\b/i;

const NUMBER_WORDS = new Map(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'].map((word, value) => [word, value]));
const TENS_WORDS = new Map(['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].map((word, index) => [word, (index + 2) * 10]));
const IN_NUMBERS = /\d+(?:\.\d+)?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?\b/gi;
/** "one thing" is a way of talking, and not a claim about the student's work. */
const ONE_AS_WORD = /(?<!(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ])\bone\b/gi;

function getNumbers(text: string): string[] {
  return [...text.replace(ONE_AS_WORD, ' ').matchAll(IN_NUMBERS)].map(([found]) => {
    if (/^\d/.test(found)) return found;
    const [first = '', second = ''] = found.toLowerCase().split(/[- ]/);
    return String((NUMBER_WORDS.get(first) ?? TENS_WORDS.get(first) ?? 0) + (NUMBER_WORDS.get(second) ?? 0));
  });
}

function getAllNumbers(lines: readonly string[]): Set<string> {
  // Here "one" counts, because a student's "x = one" is a number.
  return new Set(lines.flatMap((line) => [...getNumbers(line), ...(/\bone\b/i.test(line) ? ['1'] : [])]));
}

const getRightLines = ({ work }: RecapFacts) => work.filter(({ status }) => status === 'right').map(({ line }) => line);

const getEverySaidLine = ({ opening, tutorWords, studentLines, work }: RecapFacts) => [...(opening ? [opening] : []), tutorWords.join(' '), ...studentLines, ...work.map(({ line }) => line)];

const getStudentsOwnWords = ({ opening, studentLines, work }: RecapFacts) => [...(opening ? [opening] : []), ...studentLines, ...work.map(({ line }) => line)];

export function getEndingKind(facts: RecapFacts): 'gentle' | 'nothing' | 'lesson' {
  if (SAFETY_REPLY.test(facts.tutorWords.join(' ')) || getStudentsOwnWords(facts).some((line) => NEEDS_CARE.test(line))) return 'gentle';
  return facts.tutorWords.length >= FEWEST_TUTOR_WORDS_TO_RECAP || facts.work.length > 0 ? 'lesson' : 'nothing';
}

export const GENTLE_RECAP: SessionRecap = { kind: 'gentle', line: GENTLE_LINE };

export interface RecapDraft {
  covered?: unknown;
  gotRight?: unknown;
  tryNext?: unknown;
}

const cleanLine = (text: string) => text.replace(/\s*[–—]\s*/g, ', ').replace(/!/g, '.').replace(/\s+/g, ' ').trim();

const toSpokenMath = (line: string) => line.replace(/\s*=\s*/g, ' equals ');

function getLineProblem(line: unknown, name: string): string | null {
  if (typeof line !== 'string' || line.trim() === '') return `${name} is missing`;
  if (getSpokenWords(line).length > MOST_WORDS_IN_A_LINE) return `${name} runs past ${MOST_WORDS_IN_A_LINE} words`;
  if (PRAISE.test(line)) return `${name} praises`;
  return null;
}

function getCoveredProblem(covered: string, facts: RecapFacts): string | null {
  if (CLAIMS_SUCCESS.test(covered)) return 'covered says what the student did';
  const known = getAllNumbers(getEverySaidLine(facts));
  const madeUp = getNumbers(covered).filter((number) => !known.has(number));
  if (madeUp.length > 0) return `covered names numbers nobody said: ${madeUp.join(', ')}`;
  const everySaid = getEverySaidLine(facts).join(' ').toLowerCase();
  const hasAnchor = getSpokenWords(covered.toLowerCase().replace(/[^\p{L}\s]/gu, ' ')).some((word) => word.length >= SHORTEST_ANCHOR_LETTERS && everySaid.includes(word));
  return hasAnchor ? null : 'covered names nothing that was said';
}

function getTryNextProblem(tryNext: string): string | null {
  if (CLAIMS_SUCCESS.test(tryNext)) return 'tryNext says what the student did';
  return tryNext.includes('?') ? 'tryNext asks a question' : null;
}

// A draft line about right work must name a number only from that work, or it is replaced by a line code can stand behind.
function getGotRight(draft: unknown, rightLines: readonly string[]): string | null {
  const lastRight = rightLines.at(-1);
  if (lastRight === undefined) return null;
  const onlyFromCode = `You got ${toSpokenMath(lastRight)} right.`;
  if (typeof draft !== 'string' || getLineProblem(draft, 'gotRight')) return onlyFromCode;
  const known = getAllNumbers(rightLines);
  const line = cleanLine(draft);
  return getNumbers(line).every((number) => known.has(number)) ? line : onlyFromCode;
}

export type RecapCheck = { recap: SessionRecap & { kind: 'lesson' } } | { problem: string };

// A model wrote this, so nothing in it is taken on trust. Each rule answers to the log or to a plain limit.
export function checkRecapDraft({ covered, gotRight, tryNext }: RecapDraft, facts: RecapFacts): RecapCheck {
  const shapeProblem = getLineProblem(covered, 'covered') ?? getLineProblem(tryNext, 'tryNext');
  if (shapeProblem) return { problem: shapeProblem };
  const cleanCovered = cleanLine(covered as string);
  const cleanTryNext = cleanLine(tryNext as string);
  const problem = getCoveredProblem(cleanCovered, facts) ?? getTryNextProblem(cleanTryNext);
  if (problem) return { problem };
  const checkedRight = getGotRight(gotRight, getRightLines(facts));
  const words = [cleanCovered, checkedRight ?? '', cleanTryNext].flatMap(getSpokenWords).length;
  if (words > MOST_WORDS_IN_A_RECAP) return { problem: `the recap runs past ${MOST_WORDS_IN_A_RECAP} words` };
  return { recap: { kind: 'lesson', covered: cleanCovered, gotRight: checkedRight, tryNext: cleanTryNext } };
}

export function getRecapLines(recap: SessionRecap): string[] {
  return recap.kind === 'gentle' ? [recap.line] : [recap.covered, ...(recap.gotRight ? [recap.gotRight] : []), recap.tryNext];
}

export function getRecapBeats(recap: SessionRecap): Beat[] {
  return getRecapLines(recap).flatMap((line, index) => {
    const parsed = parseBeat({ id: `recap-${index}`, script: [line], expectsReply: false });
    return parsed.ok ? [parsed.value] : [];
  });
}
