import { readMarks } from './narration.ts';
import type { LessonPlan, OpeningLine, SceneWords } from './scene-types.ts';

const ADDRESS = /[\w.+-]+@[\w-]+\.\w|https?:|www\./i;
const PHONE_NUMBER = /\b\d{7,}\b|\b\d{3}[ .-]\d{3}[ .-]\d{4}\b/;
const INSULT = /\b(cheater|cheaters|liar|liars|idiot|idiots|moron|morons|loser|losers|slut|whore|bitch|bastard|retard|pervert|scum)\b/i;
// These are also plain words in a lesson, as painters "cheat" with perspective, so they count only when aimed at someone.
const ACCUSATION = /\b(is|are|was|were|am|you're|he's|she's|they're|i'm)\s+((a|an|such a|so|the|really|very|just)\s+)*(cheat|cheats|cheating|stupid|dumb|ugly|creep|thief|fraud)\b|\b(you|he|she|they)\s+(cheat|cheats|cheated)\b/i;
// Lessons are in English today. A word in another alphabet was how a title got an accusation past both reviews, so widen this when a language lands.
const FOREIGN_LETTER = /[^\p{Script=Latin}\p{Script=Greek}\p{Script=Common}\p{Script=Inherited}]/u;
// Two or more capitalised words in a row. Most are a place, an event, or a figure from a textbook, so the words go to a cheap reader and only a name it does not clear stops a plan.
const NAME_RUN = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+(?![\p{L}\p{N}])/gu;
const LINE_OPENERS = new Set('what why how when where who which that this these those the a an now then so but and or if here there watch think notice see look picture imagine take try let say pick at in on for from with by as its it each every both some most even only just because since while after before like unlike suppose consider remember many few several all other others meanwhile later today once soon during until through across among between against'.split(' '));
const PLAIN_TOPIC_WORDS = new Set('the and for are can how why who was were you our out get has had not but its one two what when where which while really means mean does about with from that this have your they them their would could should than then into over under very much many some most only just'.split(' '));
// A model writes a real name with capitals, so a name with no capitals is someone working around that check, and it is only caught as a first and a last name from these lists, because each alone is often a plain word. The review still reads for the rest.
const LISTED_FIRST_NAMES = 'aisha ada adam alex alice amara amir ana andrew anna ben carlos chen chloe chris daniel david diego dmitri elena eli emily emma ethan fatima grace hannah ivan jack jacob jade james jane jason jess jessica john jonas jordan jose juan julia kai kevin kim kofi lee leo liam lily lucas lucia maria marie marcus maya mei michael mike mohammed muhammad nadia nina noah olivia omar oscar priya rachel rahul rob robert ruth ryan sam samuel sara sarah sofia sophia tom tola tyler wei zara'.split(' ');
const LISTED_LAST_NAMES = 'adams adeyemi ali allen anderson baker bell brown campbell carter chen clark collins cook cooper davis doe dubois edwards evans garcia gupta harris hill howard ivanov jackson johnson jones khan kim king kumar lee lewis lopez martin mensah miller mitchell morgan morris moyo murphy nelson nguyen okafor okonkwo parker patel perez phillips reed richardson rivera roberts robinson rogers rossi ruiz sanchez sato scott sharma singh smith stewart stone tanaka taylor thomas torres turner walker wang ward weber white williams wilson wright young'.split(' ');
const LISTED_NAME_PAIR = new RegExp(`\\b(${LISTED_FIRST_NAMES.join('|')})\\s+(${LISTED_LAST_NAMES.join('|')})\\b`, 'gi');
const COUNT_WORD = '\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred';
const PILL = '(pills?|tablets?|capsules?)';
const BODY_OR_DRUG_AMOUNT = '(milligrams?|mg|kilograms?|kilos?|kg)';
const CUTTING = '(cut|cuts|cutting|slit|slits|slice|sliced|slash\\w*|blade|razor|knife)';
const CUT_PLACE = '(wrists?|arter(y|ies)|veins?)';
const DANGEROUS_SPECIFICS = [
  /\bbleach\b[^.]*\b(ammonia|acid|vinegar|rubbing alcohol)\b/i,
  /\b(ammonia|acid|vinegar)\b[^.]*\bbleach\b/i,
  /\b(lethal|deadly|fatal)\s+(dose|amount)\b/i,
  /\b(pills?|tablets?)\b[^.]*\b(lethal|deadly|fatal|overdose|die|kill)\b/i,
  /\b(make|making|build|building)\b[^.]*\b(bomb|explosives|explosive device|poison|nerve gas|toxic gas|meth)\b/i,
  /\b(chlorine|phosgene|mustard|toxic|poison)\s+gas\b[^.]*\b(mix|mixing|make|makes|made|release|releases|from)\b/i,
  /\b(mix|mixing)\b[^.]*\b(chlorine|phosgene|toxic|poison)\s+gas\b/i,
  new RegExp(`\\b(${COUNT_WORD})\\s+${PILL}\\b`, 'i'),
  new RegExp(`\\b${PILL}\\b[^.]*\\b${BODY_OR_DRUG_AMOUNT}\\b`, 'i'),
  new RegExp(`\\b${BODY_OR_DRUG_AMOUNT}\\b[^.]*\\b${PILL}\\b`, 'i'),
  /\b(doses?)\b[^.]*\b(milligrams?|mg)\b/i,
  /\b(milligrams?|mg)\b[^.]*\b(per|a|for each|for every)\s+(kilogram|kilo|kg)\b/i,
  new RegExp(`\\b${CUT_PLACE}\\b[^.]*\\b${CUTTING}\\b`, 'i'),
  new RegExp(`\\b${CUTTING}\\b[^.]*\\b${CUT_PLACE}\\b`, 'i'),
];
const LOOKS_LIKE_LETTERS: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', $: 's', '@': 'a' };
// "kms" is also kilometres, so it counts only standing alone or after a word that wants it.
const KMS = /^\W*kms\W*(how|now|tonight|today|pls|please|lol|fr|rn)?\W*$|\b(wanna|gonna|gotta|going to|want to|should|might|will|ima|i'?ll)\s+kms\b/;
const SELF_HARM = /\b(kill(ing)? (myself|yourself|himself|herself|themselves)|unalive|sewer[\s-]?slide|self[\s-]?harm\w*|self[\s-]?delete|hurt(ing)? myself|cut(ting)? myself|off(ing)? myself|end(ing)? my (own )?life|end it all|want(ed)? to die|wanna die|don'?t want to (live|be alive|be here)|how many pills|pills? (it would take|to die))\b/;
// "Suicide" alone is often history, as "Why did Socrates commit suicide" is, so only a person asking for themselves or asking how counts here, and the router reads the rest.
const SUICIDE_FOR_SOMEONE = /\b(i|i'm|im|i've|myself|how (to|do|can|could)|ways? to|best way|easiest|painless)\b[^.]*\bsuicid\w*|\bsuicid\w*[^.]*\b(i|i'm|im|myself|how to|painless)\b/;
// The router reads a bare "help" as chatter, and a child who types only that must not hear there is no lesson.
const ONLY_ASKS_FOR_HELP = /^\W*(please\s+)?(i\s+need\s+|can\s+(you|someone)\s+|someone\s+)?help(\s+me)?(\s+please)?\W*$|^\W*(i'?m|i\s+am)\s+(so\s+|really\s+)?(scared|afraid)\W*$/;
const DRUG_AMOUNT = /\b\d[\d,.]*\s*(mg|milligrams?|mcg|micrograms?)\b|\b(mg|milligrams?)\s*(\/|per)\s*(kg|kilo\w*)\b/i;
const BODY_OR_PILL = /\b(kg|kilos?|kilograms?|pounds?|lbs?|pills?|tablets?|capsules?|doses?)\b/i;
const CLOSE_TO_THE_SKIN = '(how deep|depth|closest|close to the skin|under the skin|near the skin)';
const VESSEL = '(arter(y|ies)|veins?)';
const CUT_ANATOMY = [new RegExp(`\\b${VESSEL}\\b.*\\b${CLOSE_TO_THE_SKIN}\\b`, 'i'), new RegExp(`\\b${CLOSE_TO_THE_SKIN}\\b.*\\b${VESSEL}\\b`, 'i'), /\b(blade|knife|razor)\b.*\b(heart|arter(y|ies)|veins?|wrists?|neck|throat)\b/i];
const SHOWS_DANGER = /\b(suicid\w*|die|dying|dead|death|kill\w*|hurt\w*|harm\w*|cut|cutting|bleed\w*|overdos\w*|pills?|tablets?|tylenol|poison\w*|hang\w*|abus\w*|rape\w*|touch(es|ed|ing)?|hit|hits|hitting|bully\w*|bullied|bomb\w*|gun\w*|weapon\w*|explosive\w*|unsafe|scared|afraid|hopeless)\b/i;
const TEX_WORDS = /\\(?:text|mathrm|textbf|mathbf|operatorname)\s*\{([^{}]*)\}/g;
const TEX_COMMAND = /\\[a-zA-Z]+|[{}^_\\]/g;
export const IS_OFF_TOPIC = 'it is off the topic';
export const IS_DANGEROUS = 'it gives specifics of something dangerous';
export const NAMES_A_PERSON = 'it names a person';
const SHORTEST_TOPIC_WORD = 3;
const WORD_STEM_LETTERS = 4;
const NO_NAMES: ClearedNames = new Set();

/** Capitalised words a model read and took for a place, an event, a thing, or a historical figure. */
export type ClearedNames = ReadonlySet<string>;

function getWordProblems(text: string): string[] {
  return [ADDRESS.test(text) && 'it holds an address or a link', (INSULT.test(text) || ACCUSATION.test(text)) && 'it holds an insult or an accusation', FOREIGN_LETTER.test(text) && 'it holds words in an alphabet this lesson does not use'].filter((problem) => problem !== false);
}

const getWords = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u);

// A lesson can name the person its own topic names, as "What Dürer hid in a magic square" names Albrecht Dürer.
function getCapitalisedNames(topic: string, text: string): string[] {
  const topicWords = new Set(getWords(topic));
  const isInTopic = (word: string) => getWords(word).some((part) => topicWords.has(part));
  return [...text.matchAll(NAME_RUN)].flatMap(([run]) => {
    const words = run.split(/\s+/);
    while (words[0] !== undefined && LINE_OPENERS.has(words[0].toLowerCase())) words.shift();
    return words.slice(1).some((word, index) => !isInTopic(word) && !isInTopic(words[index] as string)) ? [words.join(' ')] : [];
  });
}

const hasUnclearedName = (topic: string, text: string, cleared: ClearedNames) => getCapitalisedNames(topic, text).some((name) => !cleared.has(name));

function hasListedName(topic: string, text: string): boolean {
  const topicWords = new Set(getWords(topic));
  return [...text.matchAll(LISTED_NAME_PAIR)].some((found) => !topicWords.has((found[1] as string).toLowerCase()) && !topicWords.has((found[2] as string).toLowerCase()));
}

const hasDangerousSpecifics = (text: string) => DANGEROUS_SPECIFICS.some((pattern) => pattern.test(text));

function getSpokenProblems(topic: string, text: string, cleared: ClearedNames): string[] {
  return [...getWordProblems(text), ...(PHONE_NUMBER.test(text) ? ['it holds a long number that could be a phone number'] : []), ...(hasUnclearedName(topic, text, cleared) || hasListedName(topic, text) ? [NAMES_A_PERSON] : []), ...(hasDangerousSpecifics(text) ? [IS_DANGEROUS] : [])];
}

// What LaTeX sets as words is read as words, and each piece stays separate, so \\frac{\\text{Area}}{\\text{Base}} is not read as a person called Area Base.
const getTexWords = (tex: string) => [...tex.matchAll(TEX_WORDS)].map((found) => found[1] as string);
const getTexPlainText = (tex: string) => tex.replace(TEX_COMMAND, ' ').replace(/\s+/g, ' ').trim();

function getTexProblems(topic: string, tex: string, cleared: ClearedNames): string[] {
  const asWords = getTexWords(tex).flatMap((words) => getSpokenProblems(topic, words, cleared));
  const plain = getTexPlainText(tex);
  return [...asWords, ...getWordProblems(tex), ...(hasListedName(topic, plain) ? [NAMES_A_PERSON] : []), ...(hasDangerousSpecifics(plain) ? [IS_DANGEROUS] : [])];
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

export const getLineProblems = (topic: string, line: OpeningLine, cleared: ClearedNames = NO_NAMES): string[] => [...getLineTexts(line).flatMap((text) => getSpokenProblems(topic, text, cleared)), ...(line.tex ? getTexProblems(topic, line.tex, cleared) : [])];

/** The words a writer starts from, checked before a dollar goes on them. The whole plan gets every check once it is whole. */
export const getSceneWordProblems = (topic: string, { narration, plan }: SceneWords, cleared: ClearedNames = NO_NAMES): string[] => [...getSpokenProblems(topic, readMarks(narration).text, cleared), ...getWordProblems(plan), ...(hasDangerousSpecifics(plan) ? [IS_DANGEROUS] : [])];

const asPlainLetters = (request: string) => request.toLowerCase().replace(/[013457$@]/g, (character) => LOOKS_LIKE_LETTERS[character] ?? character);

/** Runs before any model hears the request, so a child in danger gets the help line and nobody spends on it. It knows only the wordings it lists, and the router's safety kind covers the rest. */
export function isAboutBeingUnsafe(request: string): boolean {
  const lowered = asPlainLetters(request);
  return KMS.test(lowered) || SELF_HARM.test(lowered) || SUICIDE_FOR_SOMEONE.test(lowered) || (DRUG_AMOUNT.test(request) && BODY_OR_PILL.test(request)) || CUT_ANATOMY.some((pattern) => pattern.test(request));
}

/** "help" or "im scared" with nothing else says nothing yet, and most often opens a homework question, so it gets its own line that asks what they need. */
export const isOnlyAskingForHelp = (request: string): boolean => ONLY_ASKS_FOR_HELP.test(asPlainLetters(request));

/** For a request no router could read. It is broad on purpose, because the cost of a wrong yes here is a help line and the cost of a wrong no is a child told there is no lesson. */
export const showsDanger = (request: string): boolean => isAboutBeingUnsafe(request) || SHOWS_DANGER.test(asPlainLetters(request));

/** A pair of listed names stops a plan whatever a reader says, so nobody pays to read one. */
export const isListedName = (name: string): boolean => hasListedName('', name);

export const getLineNames = (topic: string, line: OpeningLine): string[] => [...getLineTexts(line), ...(line.tex ? getTexWords(line.tex) : [])].flatMap((text) => getCapitalisedNames(topic, text));

export const getSceneWordNames = (topic: string, { narration }: SceneWords): string[] => getCapitalisedNames(topic, readMarks(narration).text);

const getAllLines = (plan: LessonPlan) => [...plan.opening, ...(plan.more ?? [])];

export const getPlanNames = (topic: string, plan: LessonPlan): string[] => [...new Set([...getAllLines(plan).flatMap((line) => getLineNames(topic, line)), ...[plan.setup, readMarks(plan.narration).text, plan.close].flatMap((text) => getCapitalisedNames(topic, text))])];

/** The words to name in a retry, because a note that says only "it names a person" got the same pair back. */
export function getRefusedNames(topic: string, plan: LessonPlan, cleared: ClearedNames): string[] {
  const topicWords = new Set(getWords(topic));
  const listed = getSpokenTexts(plan).flatMap((text) => [...text.matchAll(LISTED_NAME_PAIR)].filter((found) => !topicWords.has((found[1] as string).toLowerCase()) && !topicWords.has((found[2] as string).toLowerCase())).map(([name]) => name));
  return [...new Set([...getPlanNames(topic, plan).filter((name) => !cleared.has(name)), ...listed])];
}

// A first screen only: the review asks the same questions with judgment. This one runs before a word is spoken, costs nothing, and cannot be talked out of it.
export function getPlanProblems(topic: string, plan: LessonPlan, cleared: ClearedNames = NO_NAMES): string[] {
  const spoken = getSpokenTexts(plan);
  const texProblems = getAllLines(plan).flatMap(({ tex }) => (tex ? getTexProblems(topic, tex, cleared) : []));
  const problems = [...spoken.flatMap((text) => getSpokenProblems(topic, text, cleared)), ...texProblems, ...getWordProblems(plan.plan), ...(hasDangerousSpecifics(plan.plan) ? [IS_DANGEROUS] : [])];
  return [...new Set([...problems, ...(isOffTopic(topic, [...spoken, plan.plan].join(' ')) ? [IS_OFF_TOPIC] : [])])];
}

// A label in title case is ordinary in a drawing, so only a listed name counts here, and the review reads the rest.
export const getCodeProblems = (code: string): string[] => [...getWordProblems(code), ...(hasListedName('', code) ? [NAMES_A_PERSON] : [])];
