import { readMarks } from './narration.ts';
import type { LessonPlan, OpeningLine } from './scene-types.ts';

const ADDRESS = /[\w.+-]+@[\w-]+\.\w|https?:|www\./i;
const PHONE_NUMBER = /\b\d{7,}\b|\b\d{3}[ .-]\d{3}[ .-]\d{4}\b/;
const INSULT = /\b(cheat|cheats|cheater|cheaters|cheating|liar|liars|idiot|idiots|moron|morons|stupid|dumb|loser|losers|ugly|slut|whore|bitch|bastard|retard|pervert|creep|scum|thief|fraud)\b/i;
// Lessons are in English today. A word in another alphabet was how a title got an accusation past both reviews, so widen this when a language lands.
const FOREIGN_LETTER = /[^\p{Script=Latin}\p{Script=Greek}\p{Script=Common}\p{Script=Inherited}]/u;
const NAME_PAIR = /\b(\p{Lu}\p{Ll}+)\s+\p{Lu}\p{Ll}+\b/gu;
const LINE_OPENERS = new Set('what why how when where who which that this these those the a an now then so but and or if here there watch think notice see look picture imagine take try let say pick at in on for from with by as its it each every both some most even only just because since while after before like unlike suppose consider remember'.split(' '));
const PLAIN_TOPIC_WORDS = new Set('the and for are can how why who was were you our out get has had not but its one two what when where which while really means mean does about with from that this have your they them their would could should than then into over under very much many some most only just'.split(' '));
const SHORTEST_TOPIC_WORD = 3;
const WORD_STEM_LETTERS = 4;

function getWordProblems(text: string): string[] {
  return [ADDRESS.test(text) && 'it holds an address or a link', INSULT.test(text) && 'it holds an insult or an accusation', FOREIGN_LETTER.test(text) && 'it holds words in an alphabet this lesson does not use'].filter((problem) => problem !== false);
}

const getWords = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u);

// A lesson can name the person its own topic names, as "What Dürer hid in a magic square" names Albrecht Dürer.
function hasNamePair(topic: string, text: string): boolean {
  const topicWords = new Set(getWords(topic));
  return [...text.matchAll(NAME_PAIR)].some((found) => !LINE_OPENERS.has((found[1] as string).toLowerCase()) && !getWords(found[0]).some((word) => topicWords.has(word)));
}

function getSpokenProblems(topic: string, text: string): string[] {
  return [...getWordProblems(text), ...(PHONE_NUMBER.test(text) ? ['it holds a long number that could be a phone number'] : []), ...(hasNamePair(topic, text) ? ['it names a person'] : [])];
}

const getLineTexts = ({ say, note }: OpeningLine) => [say, ...(note ? [note] : [])];

function getSpokenTexts(plan: LessonPlan): string[] {
  return [...plan.opening.flatMap(getLineTexts), ...(plan.more ?? []).flatMap(getLineTexts), plan.setup, readMarks(plan.narration).text, plan.close];
}

function isOffTopic(topic: string, text: string): boolean {
  const stems = getWords(topic).filter((word) => word.length >= SHORTEST_TOPIC_WORD && !PLAIN_TOPIC_WORDS.has(word)).map((word) => word.slice(0, WORD_STEM_LETTERS));
  const lowered = text.toLowerCase();
  return stems.length > 0 && !stems.some((stem) => lowered.includes(stem));
}

export const getLineProblems = (topic: string, line: OpeningLine): string[] => getLineTexts(line).flatMap((text) => getSpokenProblems(topic, text));

// A first screen only: the review asks the same questions with judgment. This one runs before a word is spoken, costs nothing, and cannot be talked out of it.
export function getPlanProblems(topic: string, plan: LessonPlan): string[] {
  const spoken = getSpokenTexts(plan);
  const problems = [...spoken.flatMap((text) => getSpokenProblems(topic, text)), ...getWordProblems(plan.plan)];
  return [...new Set([...problems, ...(isOffTopic(topic, [...spoken, plan.plan].join(' ')) ? ['it is off the topic'] : [])])];
}

export const getCodeProblems = (code: string): string[] => getWordProblems(code);
