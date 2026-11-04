import { readMarks } from './narration.ts';
import type { LessonPlan, OpeningLine, SceneWords } from './scene-types.ts';

const ADDRESS = /[\w.+-]+@[\w-]+\.\w|https?:|www\./i;
const PHONE_NUMBER = /\b\d{7,}\b|\b\d{3}[ .-]\d{3}[ .-]\d{4}\b/;
const INSULT = /\b(cheater|cheaters|liar|liars|idiot|idiots|moron|morons|loser|losers|slut|whore|bitch|bastard|retard|pervert|scum)\b/i;
// These are also plain words in a lesson, as painters "cheat" with perspective, so they count only when aimed at someone.
const ACCUSATION = /\b(is|are|was|were|am|you're|he's|she's|they're|i'm)\s+((a|an|such a|so|the|really|very|just)\s+)*(cheat|cheats|cheating|stupid|dumb|ugly|creep|thief|fraud)\b|\b(you|he|she|they)\s+(cheat|cheats|cheated)\b/i;
// Lessons are in English today. A word in another alphabet was how a title got an accusation past both reviews, so widen this when a language lands.
const FOREIGN_LETTER = /[^\p{Script=Latin}\p{Script=Greek}\p{Script=Common}\p{Script=Inherited}]/u;
// The second word is only looked at, so "Suppose Jane Doe" is read as two pairs and "Jane Doe" is not hidden by the word before it.
const NAME_PAIR = /\b(\p{Lu}\p{Ll}+)\s+(?=(\p{Lu}\p{Ll}+)\b)/gu;
const LINE_OPENERS = new Set('what why how when where who which that this these those the a an now then so but and or if here there watch think notice see look picture imagine take try let say pick at in on for from with by as its it each every both some most even only just because since while after before like unlike suppose consider remember'.split(' '));
const PLAIN_TOPIC_WORDS = new Set('the and for are can how why who was were you our out get has had not but its one two what when where which while really means mean does about with from that this have your they them their would could should than then into over under very much many some most only just'.split(' '));
// A model writes a real name with capitals, so a name with no capitals is someone working around that check, and it is only caught as a first and a last name from these lists, because each alone is often a plain word. The review still reads for the rest.
const LISTED_FIRST_NAMES = 'aisha ada adam alex alice amara amir ana andrew anna ben carlos chen chloe chris daniel david diego dmitri elena eli emily emma ethan fatima grace hannah ivan jack jacob jade james jane jason jess jessica john jonas jordan jose juan julia kai kevin kim kofi lee leo liam lily lucas lucia maria marie marcus maya mei michael mike mohammed muhammad nadia nina noah olivia omar oscar priya rachel rahul rob robert ruth ryan sam samuel sara sarah sofia sophia tom tola tyler wei zara'.split(' ');
const LISTED_LAST_NAMES = 'adams adeyemi ali allen anderson baker bell brown campbell carter chen clark collins cook cooper davis doe dubois edwards evans garcia gupta harris hill howard ivanov jackson johnson jones khan kim king kumar lee lewis lopez martin mensah miller mitchell morgan morris moyo murphy nelson nguyen okafor okonkwo parker patel perez phillips reed richardson rivera roberts robinson rogers rossi ruiz sanchez sato scott sharma singh smith stewart stone tanaka taylor thomas torres turner walker wang ward weber white williams wilson wright young'.split(' ');
const LISTED_NAME_PAIR = new RegExp(`\\b(${LISTED_FIRST_NAMES.join('|')})\\s+(${LISTED_LAST_NAMES.join('|')})\\b`, 'gi');
const DANGEROUS_SPECIFICS = [/\bbleach\b[^.]*\b(ammonia|acid|vinegar|rubbing alcohol)\b/i, /\b(ammonia|acid|vinegar)\b[^.]*\bbleach\b/i, /\b(lethal|deadly|fatal)\s+(dose|amount)\b/i, /\b(pills?|tablets?)\b[^.]*\b(lethal|deadly|fatal|overdose|die|kill)\b/i, /\b(make|making|build|building)\b[^.]*\b(bomb|explosives|explosive device|poison|nerve gas|toxic gas|meth)\b/i, /\b(chlorine|phosgene|mustard|toxic|poison)\s+gas\b[^.]*\b(mix|mixing|make|makes|made|release|releases|from)\b/i, /\b(mix|mixing)\b[^.]*\b(chlorine|phosgene|toxic|poison)\s+gas\b/i];
const ABOUT_BEING_UNSAFE = /\b(kill (myself|yourself|himself|herself|themselves)|suicid\w*|self[- ]?harm|overdos\w*|hurt(ing)? myself|end(ing)? my life|want to die|how many pills|pills? (it would take|to die))\b/i;
const TEX_WORDS = /\\(?:text|mathrm|textbf|mathbf|operatorname)\s*\{([^{}]*)\}/g;
const TEX_COMMAND = /\\[a-zA-Z]+|[{}^_\\]/g;
export const IS_OFF_TOPIC = 'it is off the topic';
export const IS_DANGEROUS = 'it gives specifics of something dangerous';
export const NAMES_A_PERSON = 'it names a person';
const SHORTEST_TOPIC_WORD = 3;
const WORD_STEM_LETTERS = 4;

function getWordProblems(text: string): string[] {
  return [ADDRESS.test(text) && 'it holds an address or a link', (INSULT.test(text) || ACCUSATION.test(text)) && 'it holds an insult or an accusation', FOREIGN_LETTER.test(text) && 'it holds words in an alphabet this lesson does not use'].filter((problem) => problem !== false);
}

const getWords = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u);

// A lesson can name the person its own topic names, as "What Dürer hid in a magic square" names Albrecht Dürer.
function hasNamePair(topic: string, text: string): boolean {
  const topicWords = new Set(getWords(topic));
  return [...text.matchAll(NAME_PAIR)].some((found) => !LINE_OPENERS.has((found[1] as string).toLowerCase()) && ![found[1] as string, found[2] as string].some((word) => getWords(word).some((part) => topicWords.has(part))));
}

function hasListedName(topic: string, text: string): boolean {
  const topicWords = new Set(getWords(topic));
  return [...text.matchAll(LISTED_NAME_PAIR)].some((found) => !topicWords.has((found[1] as string).toLowerCase()) && !topicWords.has((found[2] as string).toLowerCase()));
}

const hasDangerousSpecifics = (text: string) => DANGEROUS_SPECIFICS.some((pattern) => pattern.test(text));

function getSpokenProblems(topic: string, text: string): string[] {
  return [...getWordProblems(text), ...(PHONE_NUMBER.test(text) ? ['it holds a long number that could be a phone number'] : []), ...(hasNamePair(topic, text) || hasListedName(topic, text) ? [NAMES_A_PERSON] : []), ...(hasDangerousSpecifics(text) ? [IS_DANGEROUS] : [])];
}

// What LaTeX sets as words is read as words, and each piece stays separate, so \\frac{\\text{Area}}{\\text{Base}} is not read as a person called Area Base.
const getTexWords = (tex: string) => [...tex.matchAll(TEX_WORDS)].map((found) => found[1] as string);
const getTexPlainText = (tex: string) => tex.replace(TEX_COMMAND, ' ').replace(/\s+/g, ' ').trim();

function getTexProblems(topic: string, tex: string): string[] {
  const asWords = getTexWords(tex).flatMap((words) => getSpokenProblems(topic, words));
  return [...asWords, ...getWordProblems(tex), ...(hasListedName(topic, getTexPlainText(tex)) ? [NAMES_A_PERSON] : [])];
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

export const getLineProblems = (topic: string, line: OpeningLine): string[] => [...getLineTexts(line).flatMap((text) => getSpokenProblems(topic, text)), ...(line.tex ? getTexProblems(topic, line.tex) : [])];

/** The words a writer starts from, checked before a dollar goes on them. The whole plan gets every check once it is whole. */
export const getSceneWordProblems = (topic: string, { narration, plan }: SceneWords): string[] => [...getSpokenProblems(topic, readMarks(narration).text), ...getWordProblems(plan), ...(hasDangerousSpecifics(plan) ? [IS_DANGEROUS] : [])];

/** Runs before any model hears the request, so a child in danger gets the help line and nobody spends on it. */
export const isAboutBeingUnsafe = (request: string): boolean => ABOUT_BEING_UNSAFE.test(request);

// A first screen only: the review asks the same questions with judgment. This one runs before a word is spoken, costs nothing, and cannot be talked out of it.
export function getPlanProblems(topic: string, plan: LessonPlan): string[] {
  const spoken = getSpokenTexts(plan);
  const texProblems = [...plan.opening, ...(plan.more ?? [])].flatMap(({ tex }) => (tex ? getTexProblems(topic, tex) : []));
  const problems = [...spoken.flatMap((text) => getSpokenProblems(topic, text)), ...texProblems, ...getWordProblems(plan.plan), ...(hasDangerousSpecifics(plan.plan) ? [IS_DANGEROUS] : [])];
  return [...new Set([...problems, ...(isOffTopic(topic, [...spoken, plan.plan].join(' ')) ? [IS_OFF_TOPIC] : [])])];
}

// A label in title case is ordinary in a drawing, so only a listed name counts here, and the review reads the rest.
export const getCodeProblems = (code: string): string[] => [...getWordProblems(code), ...(hasListedName('', code) ? [NAMES_A_PERSON] : [])];
