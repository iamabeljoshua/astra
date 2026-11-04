import type { components } from '@astra/contracts';
import { HOME_LABELS } from '../strings';

type PickReason = Pick<components['schemas']['PickCardResponseDto'], 'reason' | 'reasonDate'>;

const MILLISECONDS_PER_DAY = 86_400_000;
const MOST_DAYS_BACK_FOR_A_WEEKDAY = 6;
const SENTENCE_LOCALE = 'en-GB';
const DAY_SLOT = '{day}';

const getStartOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// Rounds because a day with a clock change is not 24 hours long.
const getDaysBack = (date: Date, now: Date) => Math.round((getStartOfLocalDay(now) - getStartOfLocalDay(date)) / MILLISECONDS_PER_DAY);

function getDayWords(date: Date, now: Date): string {
  const daysBack = getDaysBack(date, now);
  if (daysBack <= 0) return HOME_LABELS.pickToday;
  if (daysBack === 1) return HOME_LABELS.pickYesterday;
  const dayFormat: Intl.DateTimeFormatOptions = daysBack <= MOST_DAYS_BACK_FOR_A_WEEKDAY ? { weekday: 'long' } : { day: 'numeric', month: 'long' };
  return HOME_LABELS.pickOnDay(date.toLocaleDateString(SENTENCE_LOCALE, dayFormat));
}

export function getPickReason({ reason, reasonDate }: PickReason, now = new Date()): string {
  return reasonDate ? reason.replace(DAY_SLOT, getDayWords(new Date(reasonDate), now)) : reason;
}
