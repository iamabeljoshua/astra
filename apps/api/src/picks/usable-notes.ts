import { getTopicKey } from '../learner-record/learner-note-options';
import type { LearnerNoteDto } from '../learner-record/learner-record.dto';

const MILLISECONDS_PER_DAY = 86_400_000;
const MOST_DAYS_A_NOTE_COUNTS = 120;

// "showed" and "struggled" on one topic replace each other and leave "cares_about" alone.
const getStandingKey = ({ kind, topic }: LearnerNoteDto) => `${kind === 'cares_about' ? 'liking' : 'work'} ${getTopicKey(topic)}`;

function keepNewestStanding(newestFirst: LearnerNoteDto[]): LearnerNoteDto[] {
  const seenKeys = new Set<string>();
  return newestFirst.filter((note) => {
    const key = getStandingKey(note);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

export function getUsableNotes(newestFirst: LearnerNoteDto[], now: Date): LearnerNoteDto[] {
  const oldestCounted = now.getTime() - MOST_DAYS_A_NOTE_COUNTS * MILLISECONDS_PER_DAY;
  return keepNewestStanding(newestFirst.filter(({ kind }) => kind !== 'explored'))
    .filter(({ notedAt }) => notedAt.getTime() >= oldestCounted);
}
