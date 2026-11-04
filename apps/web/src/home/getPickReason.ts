import type { components } from '@astra/contracts';
import { HOME_LABELS } from '../strings';

type PickReason = Pick<components['schemas']['PickCardResponseDto'], 'reason' | 'reasonDate'>;

const MILLISECONDS_PER_DAY = 86_400_000;
const MOST_DAYS_BACK_FOR_A_WEEKDAY = 6;
// The sentence is in English, whatever the browser's language.
const SENTENCE_LOCALE = 'en-GB';

const getStartOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// Rounds because a day with a clock change is not 24 hours long.
const getDaysBack = (date: Date, now: Date) => Math.round((getStartOfLocalDay(now) - getStartOfLocalDay(date)) / MILLISECONDS_PER_DAY);

/** Adds the day to a reason here and not on the server, because only the browser knows the student's own time zone. */
export function getPickReason({ reason, reasonDate }: PickReason, now = new Date()): string {
  if (!reasonDate) return reason;
  const date = new Date(reasonDate);
  const daysBack = getDaysBack(date, now);
  if (daysBack <= 0) return HOME_LABELS.pickReasonToday(reason);
  if (daysBack === 1) return HOME_LABELS.pickReasonYesterday(reason);
  const dayFormat: Intl.DateTimeFormatOptions = daysBack <= MOST_DAYS_BACK_FOR_A_WEEKDAY ? { weekday: 'long' } : { day: 'numeric', month: 'long' };
  return HOME_LABELS.pickReasonOnDay(reason, date.toLocaleDateString(SENTENCE_LOCALE, dayFormat));
}
