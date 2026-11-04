import type { SessionStatus } from '../sessions/session-options';
import type { LibraryTopic } from './library';

const SECONDS_PER_MINUTE = 60;
// A session ended sooner than this did not finish its topic, whether that was five seconds or five minutes in.
const SHARE_OF_LENGTH_THAT_FINISHES = 0.5;

export interface TopicSession {
  id: string;
  topicId: string;
  status: SessionStatus;
  durationSeconds: number;
}

export type TopicProgress = { kind: 'in_progress'; sessionId: string } | { kind: 'finished' };

function getSessionProgress(session: TopicSession, topic: LibraryTopic): TopicProgress | null {
  if (session.status === 'in_progress') return { kind: 'in_progress', sessionId: session.id };
  const secondsToFinish = topic.lengthMinutes * SECONDS_PER_MINUTE * SHARE_OF_LENGTH_THAT_FINISHES;
  return session.durationSeconds >= secondsToFinish ? { kind: 'finished' } : null;
}

// Takes sessions newest first and keeps that order. A topic with no entry counts as untouched.
export function getTopicProgress(newestFirst: TopicSession[], topics: LibraryTopic[]): Map<LibraryTopic, TopicProgress> {
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
  const progressByTopic = new Map<LibraryTopic, TopicProgress>();
  for (const session of newestFirst) {
    const topic = topicsById.get(session.topicId);
    const progress = topic && getSessionProgress(session, topic);
    if (!topic || !progress) continue;
    const newestProgress = progressByTopic.get(topic);
    // An open session outranks a finished one whenever it started, because the student can still return to it.
    if (!newestProgress || (newestProgress.kind === 'finished' && progress.kind === 'in_progress')) {
      progressByTopic.set(topic, progress);
    }
  }
  return progressByTopic;
}
