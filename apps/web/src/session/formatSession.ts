import { SESSIONS_LABELS } from '../strings';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatSessionLength(durationSeconds: number): string {
  const hours = Math.floor(durationSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((durationSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = durationSeconds % SECONDS_PER_MINUTE;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function isSameDay(first: Date, second: Date) {
  return first.toDateString() === second.toDateString();
}

export function formatSessionDate(startedAt: string, now = new Date()): string {
  const date = new Date(startedAt);
  if (isSameDay(date, now)) return SESSIONS_LABELS.today;
  const isThisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: isThisYear ? undefined : 'numeric',
  });
}
