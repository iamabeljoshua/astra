import type { components } from '@astra/contracts';
import { isSafeNoteText } from './screens.ts';
import { isDetailOnTheList, isTopicOnTheList, WORKING_WORDS } from '@astra/contracts/topic-words';
import type { BoardEvent, DigestEvent, WordsEvent } from './session-digest.ts';

type LearnerNote = components['schemas']['LearnerNoteDto'];
type NoteKind = LearnerNote['kind'];

export type TrustedNote = Pick<LearnerNote, 'kind' | 'topic' | 'detail' | 'evidence'>;

interface Candidate {
  kind: NoteKind;
  topic: string;
  detail: string | null;
  evidence: string[];
}

interface Cited {
  candidate: Candidate;
  boards: BoardEvent[];
  words: WordsEvent[];
  events: readonly DigestEvent[];
}

const NOTE_KINDS: readonly string[] = ['showed', 'struggled', 'cares_about', 'explored'];
const MOST_TOPIC_CHARACTERS = 60;
const MOST_DETAIL_CHARACTERS = 120;
const MOST_TOPIC_WORDS = 8;
const MOST_DETAIL_WORDS = 16;
const MOST_EVIDENCE = 4;
const MOST_NOTES_A_ROOM = 5;
const FEWEST_LINES_FOR_A_PATTERN = 2;

const SAYS_IT_IS_HARD = /\b(?:don'?t|do not|didn'?t|did not|can'?t|cannot|never) (?:really |quite |fully |actually )?(?:get|understand|see|follow|know how|remember how)\b|\b(?:confus\w+|stuck|lost|no idea|struggl\w+|hard|difficult|tricky|makes no sense|doesn'?t make sense)\b/i;
/** A liking counts only as a plain thing a student says of themselves, so sarcasm, the past, and other people cost the note. */
const PLAIN_LIKING = /^(?:(?:ok|okay|so|well|and|also|actually|honestly|yes)\s+)*(?:i(?:'m| am)?\s+(?:(?:really|also|actually|truly|kind of|kinda)\s+)*(?:love|like|enjoy|into|a fan of|obsessed with)|i\s+(?:really\s+)?(?:play|watch|want to (?:be|become|build|make|learn|study|work)|wanna (?:be|become|build|make))|my fav(?:ou?rite)?)\b/i;
const NOT_A_PLAIN_LIKING = /\b(?:used to|until|anymore|any more|no longer|nobody|no one|none|never|not|\w+n['\u2019]t|dont|cant|wont|isnt|arent|doesnt|didnt|wasnt|werent|aint|hate[sd]?|worst|bored|boring|awful|terrible|sucks?|waste|lol|lmao|haha\w*|jk|kidding|sarcas\w*|yeah|sure|guess\w*|maybe|would (?:love|like)|wish|just love|best thing|ever)\b|\?|\/s\b/i;
const SHOUTED = /\b[A-Z]{2,}\b/;
const SPLITS_A_CLAUSE = /[.!;,]|\bbut\b/i;
const SAYS_A_GUESS = /\b(?:guess\w*|lucky|luck|random\w*|no idea how|don'?t know how|dunno how)\b/i;

function getPlainLikings(text: string): string[] {
  if (NOT_A_PLAIN_LIKING.test(text) || SHOUTED.test(text)) return [];
  return text.split(SPLITS_A_CLAUSE).map((clause) => clause.trim()).filter((clause) => PLAIN_LIKING.test(clause));
}

const CLAIMS_A_PATTERN = /\b(?:keeps?|kept|again|repeat\w*|always|every time|often|usually|still)\b/i;

/** Words that join and describe, so a note may use them though no line said them. */
const COMMON_WORDS = `a an the of to in on at for with and or but when while how why what which that this these those it its their they them be is are was were not no as by from into up down out than then so if more less one two first second same each both about between using use used whether because had has have did do does would could across over under through within after before around again also just only very some any all
  struggled struggle found hard stuck confused mixed mix forgot forget dropped drop missed miss kept keep keeps again repeat repeated repeatedly wrong right mistake error errors step steps line lines answer problem question work working worked got get gets asked ask said says wants want loves love likes like interested curious trouble difficult moving moved move changed change solved solve solving instead still wrote written write board making make made learn learning find finding undo undoing took take taking getting went go going`;

const toWords = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const SHORTEST_WORD_TO_STEM = 4;
const toStem = (word: string) => (word.length < SHORTEST_WORD_TO_STEM ? word : word.replace(/(?:ing|ed|es|e|s)$/, ''));
const toStems = (text: string) => new Set(toWords(text).map(toStem));
const WORDS_ANY_NOTE_MAY_USE = toStems(`${COMMON_WORDS} ${WORKING_WORDS}`);
const JOINING_WORDS = toStems(COMMON_WORDS);
const areNotIn = (words: ReadonlySet<string>) => (word: string) => !words.has(toStem(word));
const areAllIn = (words: readonly string[], text: string) => {
  const stems = toStems(text);
  return words.every((word) => stems.has(toStem(word)));
};

function isOvertakenByWrong(line: BoardEvent, events: readonly DigestEvent[]): boolean {
  const later = events.slice(events.indexOf(line) + 1);
  return later.some((event) => event.kind === 'board' && event.check === 'wrong' && event.task === line.task);
}

// A student's own next or last words decide this, because "i just guessed" is said around the line and not on it.
function isStatedGuess(line: BoardEvent, events: readonly DigestEvent[]): boolean {
  const theirs = events.filter((event) => event.kind !== 'tutor');
  const at = theirs.indexOf(line);
  return [theirs[at - 1], theirs[at + 1]].some((event) => event?.kind === 'words' && SAYS_A_GUESS.test(event.text));
}

// What each kind must stand on. Code checks this against what really happened, whatever the model said.
const EVIDENCE_RULES: Record<NoteKind, (cited: Cited) => boolean> = {
  showed: ({ boards, words, events }) => boards.length > 0 && words.length === 0 && boards.every((line) => line.check === 'right' && !line.wasShownFirst && !isOvertakenByWrong(line, events) && !isStatedGuess(line, events)),
  struggled: ({ boards, words }) => boards.some(({ check }) => check === 'wrong') || (boards.length === 0 && words.some(({ text, isOpening }) => !isOpening && SAYS_IT_IS_HARD.test(text))),
  cares_about: ({ boards, words }) => boards.length === 0 && words.some(({ text, isOpening }) => !isOpening && getPlainLikings(text).length > 0),
  explored: ({ boards, words }) => boards.length + words.length > 0,
};

// A liking must be in the plain liking the student said, because a tutor's suggestion is not their interest, and "i like music but chemistry is ok" is no liking of chemistry. Everything else must come from the session, or be a plain word for a part or a move of the work, so a subject the session never touched cannot appear.
function isGrounded(text: string, { candidate, words, events }: Cited): boolean {
  if (candidate.kind === 'cares_about') return areAllIn(toWords(text).filter(areNotIn(JOINING_WORDS)), words.filter(({ isOpening }) => !isOpening).flatMap((line) => getPlainLikings(line.text)).join(' '));
  const said = events.map((event) => (event.kind === 'board' ? `${event.text} ${event.why ?? ''}` : event.text)).join(' ');
  return areAllIn(toWords(text).filter(areNotIn(WORDS_ANY_NOTE_MAY_USE)), said);
}

function hasThePatternItClaims(text: string, { candidate, boards }: Cited): boolean {
  if (!CLAIMS_A_PATTERN.test(text)) return true;
  return candidate.kind === 'struggled' && boards.filter(({ check }) => check === 'wrong').length >= FEWEST_LINES_FOR_A_PATTERN;
}

const RULES: readonly { name: string; passes(cited: Cited): boolean }[] = [
  { name: 'evidence', passes: (cited) => EVIDENCE_RULES[cited.candidate.kind](cited) },
  { name: 'unsafeWords', passes: ({ candidate: { topic, detail } }) => isSafeNoteText(topic) && (detail === null || isSafeNoteText(detail)) },
  { name: 'notOnTheList', passes: ({ candidate: { kind, topic } }) => isTopicOnTheList(kind, topic) },
  { name: 'notFromTheSession', passes: (cited) => isGrounded(cited.candidate.topic, cited) },
  { name: 'pattern', passes: (cited) => hasThePatternItClaims(cited.candidate.topic, cited) },
];

// Only a struggle has anything to add to its evidence. A detail that goes past the lines or the list costs only the detail, because the note under it still stands on its evidence.
function getTrustedDetail(cited: Cited): string | null {
  const { kind, detail } = cited.candidate;
  if (kind !== 'struggled' || detail === null) return null;
  return isDetailOnTheList(detail) && isGrounded(detail, cited) && hasThePatternItClaims(detail, cited) ? detail : null;
}

function isWithinLimit(text: string, mostCharacters: number, mostWords: number): boolean {
  return text.trim() !== '' && text.length <= mostCharacters && toWords(text).length <= mostWords;
}

function readCandidate(raw: unknown): Candidate | null {
  const { kind, topic, detail, evidence } = (raw ?? {}) as Record<string, unknown>;
  if (typeof kind !== 'string' || !NOTE_KINDS.includes(kind)) return null;
  if (typeof topic !== 'string' || !isWithinLimit(topic, MOST_TOPIC_CHARACTERS, MOST_TOPIC_WORDS)) return null;
  const hasDetail = detail !== null && detail !== undefined;
  if (hasDetail && (typeof detail !== 'string' || !isWithinLimit(detail, MOST_DETAIL_CHARACTERS, MOST_DETAIL_WORDS))) return null;
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.length > MOST_EVIDENCE) return null;
  if (!evidence.every((id) => typeof id === 'string')) return null;
  return { kind: kind as NoteKind, topic: topic.trim(), detail: hasDetail ? (detail as string).trim() : null, evidence: [...new Set(evidence as string[])] };
}

// What a student said is never kept. A note says only that it stands on their words, one mark however many lines it cites.
function toEvidence({ boards, words }: Pick<Cited, 'boards' | 'words'>): TrustedNote['evidence'] {
  return [...boards.map(({ text, check }) => ({ source: 'board' as const, text, check })), ...(words.length > 0 ? [{ source: 'words' as const, text: '', check: null }] : [])];
}

function getCited(candidate: Candidate, events: readonly DigestEvent[]): Cited | null {
  const lines = candidate.evidence.map((id) => events.find((event) => event.id === id));
  if (lines.some((line) => !line || line.kind === 'tutor')) return null;
  const cited = lines as (BoardEvent | WordsEvent)[];
  return { candidate, events, boards: cited.filter((line): line is BoardEvent => line.kind === 'board'), words: cited.filter((line): line is WordsEvent => line.kind === 'words') };
}

function judge(raw: unknown, events: readonly DigestEvent[]): { note: TrustedNote; claim: string } | { refusedBecause: string } {
  const candidate = readCandidate(raw);
  if (!candidate) return { refusedBecause: 'badShape' };
  const cited = getCited(candidate, events);
  if (!cited) return { refusedBecause: 'citesNoRealLine' };
  const failed = RULES.find((rule) => !rule.passes(cited));
  if (failed) return { refusedBecause: failed.name };
  const { kind, topic, evidence } = candidate;
  return {
    claim: `${kind}:${evidence.toSorted().join()}`,
    note: { kind, topic, detail: getTrustedDetail(cited), evidence: toEvidence(cited) },
  };
}

export interface TrustReading {
  notes: TrustedNote[];
  /** How many candidates each rule stopped, with no words of the student's in it, so it can go in a trace. */
  refused: Record<string, number>;
}

// Code decides. The model only proposes a label and points at lines, and the evidence kept is code's own copy of checked board lines.
export function getTrustedNotes(rawCandidates: readonly unknown[], events: readonly DigestEvent[]): TrustReading {
  const kept = new Map<string, TrustedNote>();
  const refused: Record<string, number> = {};
  const refuse = (reason: string) => {
    refused[reason] = (refused[reason] ?? 0) + 1;
  };
  for (const raw of rawCandidates) {
    const judged = judge(raw, events);
    if ('refusedBecause' in judged) refuse(judged.refusedBecause);
    else if (kept.has(judged.claim)) refuse('sameLinesTwice');
    else kept.set(judged.claim, judged.note);
  }
  return { notes: [...kept.values()].slice(0, MOST_NOTES_A_ROOM), refused };
}
