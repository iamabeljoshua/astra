import type { ArtworkName } from '../artwork';
import type { SessionStatus } from '../sessions/session-options';
import type { LibraryTopic } from './library';

const SECONDS_PER_MINUTE = 60;
const SHARE_OF_LENGTH_THAT_FINISHES = 0.5;

export interface TopicSession {
  id: string;
  topicId: string | null;
  title: string;
  subject: string;
  artwork: ArtworkName | null;
  status: SessionStatus;
  durationSeconds: number;
  startedAt: Date;
}

export type TopicProgress = { kind: 'in_progress'; sessionId: string } | { kind: 'finished' };

function getSessionProgress(session: TopicSession, topic: LibraryTopic): TopicProgress | null {
  if (session.status === 'in_progress') return { kind: 'in_progress', sessionId: session.id };
  const secondsToFinish = topic.lengthMinutes * SECONDS_PER_MINUTE * SHARE_OF_LENGTH_THAT_FINISHES;
  return session.durationSeconds >= secondsToFinish ? { kind: 'finished' } : null;
}

// Open sessions go first and the first entry for a topic wins, because a student can still return to an open session.
export function getTopicProgress(newestFirst: TopicSession[], topics: LibraryTopic[]): Map<LibraryTopic, TopicProgress> {
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
  const openSessions = newestFirst.filter((session) => session.status === 'in_progress');
  const endedSessions = newestFirst.filter((session) => session.status !== 'in_progress');
  const progressByTopic = new Map<LibraryTopic, TopicProgress>();
  for (const session of [...openSessions, ...endedSessions]) {
    const topic = session.topicId ? topicsById.get(session.topicId) : undefined;
    const progress = topic && getSessionProgress(session, topic);
    if (topic && progress && !progressByTopic.has(topic)) progressByTopic.set(topic, progress);
  }
  return progressByTopic;
}
