import type { ArtworkName } from '../artwork';
import { getTopicKey } from '../learner-record/learner-note-options';
import type { LearnerNoteDto } from '../learner-record/learner-record.dto';
import type { LibraryTopic } from './library';
import { findTopicsNamedBy, namesSomethingToTeach } from './note-words';
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
  history: TopicSession[];
  continueCardSessionId: string | null;
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

const findNoteSession = (note: LearnerNoteDto, { history }: RecordContext) => history.find((session) => session.id === note.sessionId);

function findLessonTopic(note: LearnerNoteDto, context: RecordContext): LibraryTopic | undefined {
  const topicId = findNoteSession(note, context)?.topicId;
  return context.sources.library.topics.find((topic) => topic.id === topicId);
}

function hasGoneBackTo(note: LearnerNoteDto, topic: LibraryTopic | undefined, { history }: RecordContext): boolean {
  const noteKey = getTopicKey(note.topic);
  return history.some((session) => session.startedAt > note.notedAt && (getTopicKey(session.title) === noteKey || (topic !== undefined && session.topicId === topic.id)));
}

function canReturnTo(topic: LibraryTopic, note: LearnerNoteDto, context: RecordContext): boolean {
  const progress = context.sources.progressByTopic.get(topic);
  const isOnContinueCard = progress?.kind === 'in_progress' && progress.sessionId === context.continueCardSessionId;
  return progress?.kind !== 'finished' && !isOnContinueCard && !hasGoneBackTo(note, topic, context);
}

// The library comes first because its lessons open fast. A topic the note names beats the lesson it came from, and only a topic the library lacks gets its own lesson.
function getTopicForStruggle(note: LearnerNoteDto, context: RecordContext): RankedTopic['topic'] | null {
  const [namedTopic] = findTopicsNamedBy(note.topic, context.sources.suitableTopics);
  if (namedTopic) return canReturnTo(namedTopic, note, context) ? namedTopic : null;
  const lessonTopic = findLessonTopic(note, context);
  if (lessonTopic && canReturnTo(lessonTopic, note, context)) return lessonTopic;
  return namesSomethingToTeach(note.topic) && !hasGoneBackTo(note, lessonTopic, context) ? toNoteLesson(note, findNoteSession(note, context)) : null;
}

function getTopicForShown(note: LearnerNoteDto, context: RecordContext): LibraryTopic | null {
  const { sources } = context;
  const namedTopics = findTopicsNamedBy(note.topic, sources.suitableTopics);
  const unstartedNamedTopic = namedTopics.find((topic) => !sources.progressByTopic.has(topic));
  if (unstartedNamedTopic) return unstartedNamedTopic;
  const doneTopic = namedTopics[0] ?? findLessonTopic(note, context);
  const nextTopic = doneTopic && findTopicAfter(doneTopic, sources);
  return nextTopic && !sources.progressByTopic.has(nextTopic) ? nextTopic : null;
}

function getTopicForCaredAbout(note: LearnerNoteDto, { sources }: RecordContext): LibraryTopic | null {
  return findTopicsNamedBy(note.topic, sources.suitableTopics).find((topic) => !sources.progressByTopic.has(topic)) ?? null;
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

function toRankedTopic(note: LearnerNoteDto, rule: NoteRule, context: RecordContext): RankedTopic[] {
  const topic = rule.getTopic(note, context);
  if (!topic) return [];
  const progress = 'isNoteLesson' in topic ? undefined : context.sources.progressByTopic.get(topic);
  const continueSessionId = progress?.kind === 'in_progress' ? progress.sessionId : undefined;
  return [{ topic, reason: rule.getReason(note.topic), reasonDate: note.notedAt, continueSessionId, isPersonal: true }];
}

function keepFirstOfEachTopic(ranked: RankedTopic[]): RankedTopic[] {
  const seenTopicIds = new Set<string>();
  return ranked.filter(({ topic }) => {
    if (seenTopicIds.has(topic.id)) return false;
    seenTopicIds.add(topic.id);
    return true;
  });
}

/** What the record says to offer, in the order it matters: a struggle to revisit, then something to build on, then something they like. */
export function rankFromRecord({ notes, history, continueCardSessionId, now }: RecordToRank, sources: RankingSources): RankedTopic[] {
  const context: RecordContext = { sources, history, continueCardSessionId };
  const usableNotes = getUsableNotes(notes, now).filter((note) => note.sessionId !== continueCardSessionId);
  return NOTE_RULES.flatMap((rule) =>
    keepFirstOfEachTopic(usableNotes.filter(({ kind }) => kind === rule.kind).flatMap((note) => toRankedTopic(note, rule, context))).slice(0, rule.maxPicks),
  );
}
