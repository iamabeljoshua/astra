import { REVIEW_LABELS } from '../strings';

const PROMISED_HOURS = 24;
const MILLISECONDS_PER_HOUR = 3_600_000;

export function getWaitText(createdAt: string, now: Date): string {
  const waitedHours = Math.floor((now.getTime() - new Date(createdAt).getTime()) / MILLISECONDS_PER_HOUR);
  return waitedHours < PROMISED_HOURS
    ? REVIEW_LABELS.waitingInTime(waitedHours, PROMISED_HOURS - waitedHours)
    : REVIEW_LABELS.waitingTooLong(waitedHours, waitedHours - PROMISED_HOURS);
}
