import type { ArtworkName } from '../artwork';
import type { Library, LibraryTopic } from './library';
import type { TopicProgress } from './topic-progress';

/** A lesson on something a note names that the library does not hold. It starts like a typed question, so the tutor opens it in its own words. */
export interface NoteLesson {
  isNoteLesson: true;
  id: string;
  title: string;
  subject: string;
  lengthMinutes: number;
  openingLine: null;
  artwork: ArtworkName;
}

export interface RankedTopic {
  topic: LibraryTopic | NoteLesson;
  reason: string;
  reasonDate?: Date;
  continueSessionId?: string;
  isPersonal?: boolean;
}

export interface RankingSources {
  library: Library;
  suitableTopics: LibraryTopic[];
  progressByTopic: Map<LibraryTopic, TopicProgress>;
}

export function findTopicAfter(finishedTopic: LibraryTopic, { library, suitableTopics, progressByTopic }: RankingSources): LibraryTopic | undefined {
  const order = library.topicOrder[finishedTopic.subject] ?? [];
  return order
    .slice(order.indexOf(finishedTopic.id) + 1)
    .flatMap((topicId) => suitableTopics.filter((topic) => topic.id === topicId))
    .find((topic) => progressByTopic.get(topic)?.kind !== 'finished');
}
