const MINIMUM_AGE_YEARS = 13;
const OLDEST_BIRTH_DATE = '1900-01-01';
const BIRTH_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_HOUR = 3_600_000;

const FIRST_DATE_OFFSET_HOURS = 14;

function getLatestDateOnEarth(now: Date): string {
  return new Date(now.getTime() + FIRST_DATE_OFFSET_HOURS * MILLISECONDS_PER_HOUR).toISOString().slice(0, 10);
}

function isRealCalendarDate(text: string): boolean {
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

export function isValidBirthDate(text: unknown, now: Date): boolean {
  return (
    typeof text === 'string' &&
    BIRTH_DATE_FORMAT.test(text) &&
    isRealCalendarDate(text) &&
    text >= OLDEST_BIRTH_DATE &&
    text <= getLatestDateOnEarth(now)
  );
}

// Too young only when the student is under the age in every time zone, so a real 13-year-old is never closed out.
export function isOldEnough(validBirthDate: string, now: Date): boolean {
  const birthYear = Number(validBirthDate.slice(0, 4));
  const birthdayAtMinimumAge = `${birthYear + MINIMUM_AGE_YEARS}${validBirthDate.slice(4)}`;
  return birthdayAtMinimumAge <= getLatestDateOnEarth(now);
}
