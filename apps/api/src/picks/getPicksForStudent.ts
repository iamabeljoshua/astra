import type { PickCardResponseDto } from '../home/home-screen.dto';
import { STUDENT_LEVELS } from '../students/student-profile-options';
import type { StudentProfileResponseDto } from '../students/student-profile.dto';
import {
  CARRY_ON_REASON,
  getGoalReason,
  getInterestReason,
  getLevelReason,
  getNextTopicReason,
  STARTER_REASON,
} from './pick-reasons';
import type { Library, LibraryInterest, LibraryTopic } from './library';
import { getTopicProgress } from './topic-progress';
import type { TopicProgress, TopicSession } from './topic-progress';

const PICK_COUNT = 6;
const MAX_PICKS_PER_SUBJECT = 2;
const MAX_STARTER_PICKS_PER_SUBJECT = 1;
const MAX_PICKS_PER_HISTORY_KIND = 2;

export type StudentFit = Pick<StudentProfileResponseDto, 'interests' | 'level' | 'goal'>;

export interface StudentRecord {
  fit: StudentFit | null;
  history: TopicSession[];
  continueCardSessionId: string | null;
}

interface RankedTopic {
  topic: LibraryTopic;
  reason: string;
  continueSessionId?: string;
  isFromHistory?: boolean;
}

interface RankingSources {
  library: Library;
  suitableTopics: LibraryTopic[];
  progressByTopic: Map<LibraryTopic, TopicProgress>;
}

interface InterestMatch {
  name: string;
  word: string;
}

function toWordSearchText(text: string): string {
  return ` ${text.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

function findMatchedWord(studentInterest: string, { words }: LibraryInterest): string | undefined {
  const searchText = toWordSearchText(studentInterest);
  return words.find((word) => searchText.includes(toWordSearchText(word)));
}

function getInterestMatches(studentInterests: string[], libraryInterests: LibraryInterest[]): InterestMatch[] {
  return studentInterests.flatMap((studentInterest) =>
    libraryInterests.flatMap((interest) => {
      const word = findMatchedWord(studentInterest, interest);
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

function rankByFit(fit: StudentFit | null, { library, suitableTopics }: RankingSources): RankedTopic[] {
  if (!fit) return suitableTopics.map((topic) => ({ topic, reason: STARTER_REASON }));
  const { level, goal } = fit;
  return [
    ...rankByInterestTurns(suitableTopics, getInterestMatches(fit.interests, library.interests)),
    ...suitableTopics
      .filter((topic) => topic.goals.includes(goal))
      .map((topic) => ({ topic, reason: getGoalReason(goal, level) })),
    ...suitableTopics.map((topic) => ({ topic, reason: getLevelReason(level) })),
  ];
}

function rankTopicsInProgress({ progressByTopic }: RankingSources, continueCardSessionId: string | null): RankedTopic[] {
  return [...progressByTopic].flatMap(([topic, progress]) =>
    progress.kind === 'in_progress' && progress.sessionId !== continueCardSessionId
      ? [{ topic, reason: CARRY_ON_REASON, continueSessionId: progress.sessionId, isFromHistory: true }]
      : [],
  );
}

function findTopicAfter(finishedTopic: LibraryTopic, { library, suitableTopics, progressByTopic }: RankingSources): LibraryTopic | undefined {
  const order = library.topicOrder[finishedTopic.subject] ?? [];
  return order
    .slice(order.indexOf(finishedTopic.id) + 1)
    .flatMap((topicId) => suitableTopics.filter((topic) => topic.id === topicId))
    .find((topic) => progressByTopic.get(topic)?.kind !== 'finished');
}

function rankNextTopics(sources: RankingSources): RankedTopic[] {
  return [...sources.progressByTopic].flatMap(([topic, progress]) => {
    const nextTopic = progress.kind === 'finished' && findTopicAfter(topic, sources);
    return nextTopic && !sources.progressByTopic.has(nextTopic)
      ? [{ topic: nextTopic, reason: getNextTopicReason(topic.title), isFromHistory: true }]
      : [];
  });
}

function keepFirstOfEachTopic(ranked: RankedTopic[]): RankedTopic[] {
  const seenTopicIds = new Set<string>();
  return ranked.filter(({ topic }) => {
    if (seenTopicIds.has(topic.id)) return false;
    seenTopicIds.add(topic.id);
    return true;
  });
}

function rankForStudent({ fit, history, continueCardSessionId }: StudentRecord, library: Library): RankedTopic[] {
  const levelsToSuit = fit ? [fit.level] : STUDENT_LEVELS;
  const sources: RankingSources = {
    library,
    suitableTopics: library.topics.filter((topic) => levelsToSuit.every((level) => topic.levels.includes(level))),
    progressByTopic: getTopicProgress(history, library.topics),
  };
  return keepFirstOfEachTopic([
    ...rankTopicsInProgress(sources, continueCardSessionId).slice(0, MAX_PICKS_PER_HISTORY_KIND),
    ...keepFirstOfEachTopic(rankNextTopics(sources)).slice(0, MAX_PICKS_PER_HISTORY_KIND),
    ...rankByFit(fit, sources).filter(({ topic }) => !sources.progressByTopic.has(topic)),
  ]);
}

// Caps each subject, then tops up from the overflow to fill the screen. History cards pass the cap but still count toward it.
function chooseAcrossSubjects(ranked: RankedTopic[], maxPerSubject: number): RankedTopic[] {
  const picksPerSubject = new Map<string, number>();
  const withinLimit = ranked.filter(({ topic, isFromHistory }) => {
    const picksSoFar = picksPerSubject.get(topic.subject) ?? 0;
    picksPerSubject.set(topic.subject, picksSoFar + 1);
    return isFromHistory || picksSoFar < maxPerSubject;
  });
  const overLimit = ranked.filter((rankedTopic) => !withinLimit.includes(rankedTopic));
  return [...withinLimit, ...overLimit].slice(0, PICK_COUNT);
}

function toPickCard({ topic, reason, continueSessionId }: RankedTopic): PickCardResponseDto {
  const { id, title, subject, lengthMinutes, openingLine, artwork } = topic;
  return { id, title, subject, lengthMinutes, openingLine, reason, artwork, continueSessionId: continueSessionId ?? null };
}

export function getPicksForStudent(record: StudentRecord, library: Library): PickCardResponseDto[] {
  const maxPerSubject = record.fit ? MAX_PICKS_PER_SUBJECT : MAX_STARTER_PICKS_PER_SUBJECT;
  return chooseAcrossSubjects(rankForStudent(record, library), maxPerSubject).map(toPickCard);
}
