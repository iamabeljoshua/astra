import { getTopicKey } from '../learner-record/learner-note-options';
import type { LibraryTopic } from './library';

const SHORTEST_WORD_THAT_NAMES_A_SUBJECT = 3;
const SHORTEST_WORD_TO_STEM = 4;

const WORDS_THAT_NAME_NO_SUBJECT = `the and but for with when while how why what which that this these those its their they them are was were not than then from into out more less one two first second third same each both about between using use used whether because had has have did does would could across over under through within after before around again also just only very some any all
  struggled struggle found hard stuck confused mixed mix forgot forget dropped drop missed miss kept keep keeps repeat repeated repeatedly wrong right mistake mistakes error errors step steps line lines answer answers problem problems question questions work working worked got get gets asked ask said says wants want loves love likes like interested curious trouble difficult moving moved move changed change solved solve solving instead still wrote written write board making make made learn learning find finding undo undoing took take taking getting went going part parts`;

const WORDS_TOO_PLAIN_FOR_A_LESSON = `word exam test homework revision method rule example value unknown understand explain remember study subject topic concept idea theory theories law principle model fact lesson`;

const WORDS_THAT_TELL_TOPICS_APART = new Set(['one', 'two', 'first', 'second', 'third']);

const toWords = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const toStem = (word: string) => (word.length < SHORTEST_WORD_TO_STEM ? word : word.replace(/(?:ing|ed|es|e|s)$/, ''));
const toStems = (text: string) => new Set(toWords(text).map(toStem));

const STEMS_THAT_NAME_NO_SUBJECT = toStems(WORDS_THAT_NAME_NO_SUBJECT);
const STEMS_TOO_PLAIN_FOR_A_LESSON = toStems(WORDS_TOO_PLAIN_FOR_A_LESSON);

function getSubjectStems(text: string): string[] {
  return toWords(text)
    .filter((word) => word.length >= SHORTEST_WORD_THAT_NAMES_A_SUBJECT && /^\p{L}+$/u.test(word))
    .map(toStem)
    .filter((stem) => !STEMS_THAT_NAME_NO_SUBJECT.has(stem));
}

// "solving quadratic equations" and "quadratic equations" are one topic, because only their subject words count, but a first law and a second law are not.
export function getSubjectKey(noteTopic: string): string {
  const subjectStems = getSubjectStems(noteTopic);
  if (subjectStems.length === 0) return getTopicKey(noteTopic);
  const countingWords = toWords(noteTopic).filter((word) => WORDS_THAT_TELL_TOPICS_APART.has(word));
  return [...new Set([...countingWords, ...subjectStems])].sort().join(' ');
}

export const namesSomethingToTeach = (noteTopic: string) => getSubjectStems(noteTopic).some((stem) => !STEMS_TOO_PLAIN_FOR_A_LESSON.has(stem));

interface TopicWords {
  topic: LibraryTopic;
  namingStems: Set<string>;
  allStems: Set<string>;
  otherNames: string[][];
}

function getTopicWords(topic: LibraryTopic): TopicWords {
  const namingStems = toStems(`${topic.title} ${topic.interests.join(' ')}`);
  const allStems = new Set([...namingStems, ...toStems(topic.openingLine)]);
  return { topic, namingStems, allStems, otherNames: (topic.alsoCalled ?? []).map(getSubjectStems) };
}

// A lone word must match the title or interests, because one word in an opening line is often an aside.
function isNamedBy(subjectStems: string[], { namingStems, allStems, otherNames }: TopicWords): boolean {
  const stemsToSearch = subjectStems.length > 1 ? allStems : namingStems;
  return subjectStems.every((stem) => stemsToSearch.has(stem)) || otherNames.some((name) => name.every((stem) => subjectStems.includes(stem)));
}

export type TopicFinder = (noteTopic: string) => LibraryTopic[];

export function createTopicFinder(topics: LibraryTopic[]): TopicFinder {
  const topicWords = topics.map(getTopicWords);
  return (noteTopic) => {
    const subjectStems = getSubjectStems(noteTopic);
    return subjectStems.length === 0 ? [] : topicWords.filter((words) => isNamedBy(subjectStems, words)).map(({ topic }) => topic);
  };
}
