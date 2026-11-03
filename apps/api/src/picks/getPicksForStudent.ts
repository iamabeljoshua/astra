import type { PickCardResponseDto } from '../home/home-screen.dto';
import { STUDENT_LEVELS } from '../students/student-profile-options';
import type { StudentProfileResponseDto } from '../students/student-profile.dto';
import { readsAsLiking, splitIntoPhrases, toWordSearchText } from './interest-phrases';
import { getGoalReason, getInterestReason, getLevelReason, STARTER_REASON } from './pick-reasons';
import type { Library, LibraryInterest, LibraryTopic } from './library';

const PICK_COUNT = 6;
const MAX_PICKS_PER_SUBJECT = 2;
const MAX_STARTER_PICKS_PER_SUBJECT = 1;

export type StudentFit = Pick<StudentProfileResponseDto, 'interests' | 'level' | 'goal'>;

interface RankedTopic {
  topic: LibraryTopic;
  reason: string;
}

interface InterestMatch {
  name: string;
  word: string;
}

function findMatchedWord(phrase: string, { words }: LibraryInterest): string | undefined {
  const searchText = toWordSearchText(phrase);
  return words.find((word) => searchText.includes(toWordSearchText(word)) && readsAsLiking(phrase, word));
}

function getInterestMatches(studentInterests: string[], libraryInterests: LibraryInterest[]): InterestMatch[] {
  return studentInterests.flatMap(splitIntoPhrases).flatMap((phrase) =>
    libraryInterests.flatMap((interest) => {
      const word = findMatchedWord(phrase, interest);
      return word ? [{ name: interest.name, word }] : [];
    }),
  );
}

// Each interest gets a turn, so the first one a student named cannot fill the screen.
function rankByInterestTurns(topics: LibraryTopic[], matches: InterestMatch[]): RankedTopic[] {
  return matches
    .flatMap(({ name, word }) =>
      topics
        .filter((topic) => topic.interests.includes(name))
        .map((topic, turn) => ({ topic, reason: getInterestReason(word), turn })),
    )
    .sort((first, second) => first.turn - second.turn);
}

function rankForStudent(student: StudentFit, library: Library): RankedTopic[] {
  const { level, goal } = student;
  const topicsAtLevel = library.topics.filter((topic) => topic.levels.includes(level));
  return [
    ...rankByInterestTurns(topicsAtLevel, getInterestMatches(student.interests, library.interests)),
    ...topicsAtLevel
      .filter((topic) => topic.goals.includes(goal))
      .map((topic) => ({ topic, reason: getGoalReason(goal, level) })),
    ...topicsAtLevel.map((topic) => ({ topic, reason: getLevelReason(level) })),
  ];
}

function rankForNewStudent(library: Library): RankedTopic[] {
  return library.topics
    .filter((topic) => STUDENT_LEVELS.every((level) => topic.levels.includes(level)))
    .map((topic) => ({ topic, reason: STARTER_REASON }));
}

function keepFirstOfEachTopic(ranked: RankedTopic[]): RankedTopic[] {
  const seenTopicIds = new Set<string>();
  return ranked.filter(({ topic }) => {
    if (seenTopicIds.has(topic.id)) return false;
    seenTopicIds.add(topic.id);
    return true;
  });
}

// Caps each subject first, then tops up from the overflow when the capped list cannot fill the screen.
function chooseAcrossSubjects(ranked: RankedTopic[], maxPerSubject: number): RankedTopic[] {
  const picksPerSubject = new Map<string, number>();
  const withinLimit = ranked.filter(({ topic }) => {
    const picksSoFar = picksPerSubject.get(topic.subject) ?? 0;
    picksPerSubject.set(topic.subject, picksSoFar + 1);
    return picksSoFar < maxPerSubject;
  });
  const overLimit = ranked.filter((rankedTopic) => !withinLimit.includes(rankedTopic));
  return [...withinLimit, ...overLimit].slice(0, PICK_COUNT);
}

function toPickCard({ topic, reason }: RankedTopic): PickCardResponseDto {
  const { id, title, subject, lengthMinutes, openingLine, artwork } = topic;
  return { id, title, subject, lengthMinutes, openingLine, reason, artwork };
}

export function getPicksForStudent(student: StudentFit | null, library: Library): PickCardResponseDto[] {
  const picks = student
    ? chooseAcrossSubjects(keepFirstOfEachTopic(rankForStudent(student, library)), MAX_PICKS_PER_SUBJECT)
    : chooseAcrossSubjects(rankForNewStudent(library), MAX_STARTER_PICKS_PER_SUBJECT);
  return picks.map(toPickCard);
}
