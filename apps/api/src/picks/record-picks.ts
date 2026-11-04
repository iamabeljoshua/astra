import type { ArtworkName } from '../artwork';
import { getTopicKey } from '../learner-record/learner-note-options';
import type { LearnerNoteDto } from '../learner-record/learner-record.dto';
import type { LibraryTopic } from './library';
import { createTopicFinder, namesSomethingToTeach } from './note-words';
import type { TopicFinder } from './note-words';
import { getCaresAboutReason, getShowedReason, getStruggleReason, NOTE_LESSON_SUBJECT } from './pick-reasons';
import { findTopicAfter } from './ranking';
import type { NoteLesson, RankedTopic, RankingSources } from './ranking';
import type { TopicSession } from './topic-progress';
import { getUsableNotes } from './usable-notes';

const MAX_STRUGGLE_PICKS = 2;
const MAX_SHOWN_PICKS = 1;
const MAX_CARED_ABOUT_PICKS = 1;
const NOTE_LESSON_MINUTES = 10;
const NOTE_LESSON_ARTWORK: ArtworkName = 'grid';

export interface RecordToRank {
  notes: LearnerNoteDto[];
  history: TopicSession[];
  continueCardSessionId: string | null;
  now: Date;
}

interface RecordContext {
  sources: RankingSources;
  continueCardSessionId: string | null;
  findTopicsNamedBy: TopicFinder;
  sessionsById: Map<string, TopicSession>;
  newestStartByTitleKey: Map<string, number>;
  newestStartByTopicId: Map<string, number>;
}

function getNewestStarts(sessions: TopicSession[], getKey: (session: TopicSession) => string | null): Map<string, number> {
  const newestStarts = new Map<string, number>();
  for (const session of sessions) {
    const key = getKey(session);
    if (key !== null) newestStarts.set(key, Math.max(newestStarts.get(key) ?? 0, session.startedAt.getTime()));
  }
  return newestStarts;
}

const capitalizeFirstLetter = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function toNoteLesson(note: LearnerNoteDto, session: TopicSession | undefined): NoteLesson {
  return {
    isNoteLesson: true,
    id: `note-${note.id}`,
    title: capitalizeFirstLetter(note.topic),
    subject: session?.subject ?? NOTE_LESSON_SUBJECT,
    lengthMinutes: NOTE_LESSON_MINUTES,
    openingLine: null,
    artwork: session?.artwork ?? NOTE_LESSON_ARTWORK,
  };
}

function findLessonTopic(note: LearnerNoteDto, context: RecordContext): LibraryTopic | undefined {
  const topicId = context.sessionsById.get(note.sessionId)?.topicId;
  return context.sources.library.topics.find((topic) => topic.id === topicId);
}

function hasGoneBackTo(note: LearnerNoteDto, topic: LibraryTopic | undefined, { newestStartByTitleKey, newestStartByTopicId }: RecordContext): boolean {
  const notedAt = note.notedAt.getTime();
  const isStartedSince = (startedAt: number | undefined) => startedAt !== undefined && startedAt > notedAt;
  return isStartedSince(newestStartByTitleKey.get(getTopicKey(note.topic))) || (topic !== undefined && isStartedSince(newestStartByTopicId.get(topic.id)));
}

function canReturnTo(topic: LibraryTopic, note: LearnerNoteDto, context: RecordContext): boolean {
  const progress = context.sources.progressByTopic.get(topic);
  const isOnContinueCard = progress?.kind === 'in_progress' && progress.sessionId === context.continueCardSessionId;
  return progress?.kind !== 'finished' && !isOnContinueCard && !hasGoneBackTo(note, topic, context);
}

// The library comes first because its lessons open fast. A topic the note names beats the lesson it came from, and only a topic the library lacks gets its own lesson.
function getTopicForStruggle(note: LearnerNoteDto, context: RecordContext): RankedTopic['topic'] | null {
  const [namedTopic] = context.findTopicsNamedBy(note.topic);
  if (namedTopic) return canReturnTo(namedTopic, note, context) ? namedTopic : null;
  const lessonTopic = findLessonTopic(note, context);
  if (lessonTopic && canReturnTo(lessonTopic, note, context)) return lessonTopic;
  return namesSomethingToTeach(note.topic) && !hasGoneBackTo(note, lessonTopic, context) ? toNoteLesson(note, context.sessionsById.get(note.sessionId)) : null;
}

function getTopicForShown(note: LearnerNoteDto, context: RecordContext): LibraryTopic | null {
  const { sources } = context;
  const namedTopics = context.findTopicsNamedBy(note.topic);
  const unstartedNamedTopic = namedTopics.find((topic) => !sources.progressByTopic.has(topic));
  if (unstartedNamedTopic) return unstartedNamedTopic;
  const doneTopic = namedTopics[0] ?? findLessonTopic(note, context);
  const nextTopic = doneTopic && findTopicAfter(doneTopic, sources);
  return nextTopic && !sources.progressByTopic.has(nextTopic) ? nextTopic : null;
}

function getTopicForCaredAbout(note: LearnerNoteDto, { sources, findTopicsNamedBy }: RecordContext): LibraryTopic | null {
  return findTopicsNamedBy(note.topic).find((topic) => !sources.progressByTopic.has(topic)) ?? null;
}

interface NoteRule {
  kind: LearnerNoteDto['kind'];
  maxPicks: number;
  getTopic: (note: LearnerNoteDto, context: RecordContext) => RankedTopic['topic'] | null;
  getReason: (noteTopic: string) => string;
}

const NOTE_RULES: NoteRule[] = [
  { kind: 'struggled', maxPicks: MAX_STRUGGLE_PICKS, getTopic: getTopicForStruggle, getReason: getStruggleReason },
  { kind: 'showed', maxPicks: MAX_SHOWN_PICKS, getTopic: getTopicForShown, getReason: getShowedReason },
  { kind: 'cares_about', maxPicks: MAX_CARED_ABOUT_PICKS, getTopic: getTopicForCaredAbout, getReason: getCaresAboutReason },
];

function toRankedTopic(note: LearnerNoteDto, rule: NoteRule, context: RecordContext): RankedTopic | null {
  const topic = rule.getTopic(note, context);
  if (!topic) return null;
  const progress = 'isNoteLesson' in topic ? undefined : context.sources.progressByTopic.get(topic);
  const continueSessionId = progress?.kind === 'in_progress' ? progress.sessionId : undefined;
  return { topic, reason: rule.getReason(note.topic), reasonDate: note.notedAt, continueSessionId, isPersonal: true };
}

// Stops once this kind has its cards, so an older note costs nothing. Library lessons go first because they open fast.
function rankNotesByRule(notes: LearnerNoteDto[], rule: NoteRule, context: RecordContext): RankedTopic[] {
  const rankedByTopicId = new Map<string, RankedTopic>();
  for (const note of notes) {
    if (rankedByTopicId.size === rule.maxPicks) break;
    if (note.kind !== rule.kind) continue;
    const ranked = toRankedTopic(note, rule, context);
    if (ranked && !rankedByTopicId.has(ranked.topic.id)) rankedByTopicId.set(ranked.topic.id, ranked);
  }
  return [...rankedByTopicId.values()].sort((first, second) => Number('isNoteLesson' in first.topic) - Number('isNoteLesson' in second.topic));
}

/** What the record says to offer, in the order it matters: a struggle to revisit, then something to build on, then something they like. */
export function rankFromRecord({ notes, history, continueCardSessionId, now }: RecordToRank, sources: RankingSources): RankedTopic[] {
  const usableNotes = getUsableNotes(notes, now).filter((note) => note.sessionId !== continueCardSessionId);
  if (usableNotes.length === 0) return [];
  const context: RecordContext = {
    sources,
    continueCardSessionId,
    findTopicsNamedBy: createTopicFinder(sources.suitableTopics),
    sessionsById: new Map(history.map((session) => [session.id, session])),
    newestStartByTitleKey: getNewestStarts(history, ({ title }) => getTopicKey(title)),
    newestStartByTopicId: getNewestStarts(history, ({ topicId }) => topicId),
  };
  return NOTE_RULES.flatMap((rule) => rankNotesByRule(usableNotes, rule, context));
}
