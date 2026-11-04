import type { components } from '@astra/contracts';
import { isSafeNoteText } from './screens.ts';
import { isDetailOnTheList, isTopicOnTheList } from './topic-words.ts';

type LearnerRecord = components['schemas']['LearnerRecordDto'];
type LearnerNote = LearnerRecord['notes'][number];

/** One thing the tutor may know from an earlier session, in words from a closed list. */
export interface MemoryLine {
  kind: LearnerNote['kind'];
  about: string;
  detail?: string;
  days_ago: number;
  known_from: 'checked_on_board' | 'their_words';
}

/** `count` is there because the model denied holding a one-note list in 5 of 6 replies without it, and in 0 of 12 with it. */
export interface MemoryNote {
  memory: { count: number; notes: MemoryLine[] };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Past this, a note is more likely to mislead than to help, so it stays on the student's page but the tutor stops reading it. */
const STALE_AFTER_DAYS = 120;
/** How many of each kind fit in a short block, with what the student finds hard first. */
const MOST_OF_EACH_KIND: readonly (readonly [LearnerNote['kind'], number])[] = [
  ['struggled', 3],
  ['cares_about', 2],
  ['showed', 2],
  ['explored', 1],
];

const toTopicKey = (topic: string) => topic.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const getDaysAgo = (notedAt: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(notedAt).getTime()) / MS_PER_DAY));

function toMemoryLine({ kind, topic, detail, notedAt, evidence }: LearnerNote, now: Date): MemoryLine {
  return {
    kind,
    about: topic,
    ...(detail ? { detail } : {}),
    days_ago: getDaysAgo(notedAt, now),
    known_from: evidence.some(({ source }) => source === 'board') ? 'checked_on_board' : 'their_words',
  };
}

function isUsable({ kind, topic, detail, notedAt }: LearnerNote, now: Date): boolean {
  return getDaysAgo(notedAt, now) <= STALE_AFTER_DAYS && isSafeNoteText(topic) && isTopicOnTheList(kind, topic) && (detail === null || (isSafeNoteText(detail) && isDetailOnTheList(detail)));
}

// The newest note on a topic wins, so a student who struggled and later got it right is not reminded of the struggle. The screens and the list run again here, so a note that got into the table some other way is still never read.
export function getMemoryNote({ notes }: LearnerRecord, now: Date): MemoryNote {
  const newestPerTopic = new Map<string, LearnerNote>();
  for (const note of notes) {
    if (!isUsable(note, now)) continue;
    const key = toTopicKey(note.topic);
    if (!newestPerTopic.has(key)) newestPerTopic.set(key, note);
  }
  const kept = [...newestPerTopic.values()];
  const lines = MOST_OF_EACH_KIND.flatMap(([kind, most]) => kept.filter((note) => note.kind === kind).slice(0, most));
  return { memory: { count: lines.length, notes: lines.map((note) => toMemoryLine(note, now)) } };
}
