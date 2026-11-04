import type { PickCardResponseDto } from '../home/home-screen.dto';
import { STUDENT_LEVELS } from '../students/student-profile-options';
import type { StudentInterest } from '../students/student-profile-options';
import type { StudentProfileResponseDto } from '../students/student-profile.dto';
import {
  CARRY_ON_REASON,
  getGoalReason,
  getInterestReason,
  getLevelReason,
  getNextTopicReason,
  STARTER_REASON,
} from './pick-reasons';
import type { Library, LibraryTopic } from './library';
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

// Each interest gets a turn, so the first one a student chose cannot fill the screen.
function rankByInterestTurns(topics: LibraryTopic[], interests: StudentInterest[]): RankedTopic[] {
  return interests
    .flatMap((interest) =>
      topics
        .filter((topic) => topic.interests.includes(interest))
        .map((topic, turn) => ({ topic, reason: getInterestReason(interest), turn })),
    )
    .sort((first, second) => first.turn - second.turn);
}

function rankByFit(fit: StudentFit | null, { suitableTopics }: RankingSources): RankedTopic[] {
  if (!fit) return suitableTopics.map((topic) => ({ topic, reason: STARTER_REASON }));
  const { level, goal } = fit;
  return [
    ...rankByInterestTurns(suitableTopics, fit.interests),
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
