import type { DateParts } from '../ui/BirthDateField';
import { toLatinDigits } from '../ui/toLatinDigits';

const DAY_OR_MONTH = /^\d{1,2}$/;
const YEAR = /^\d{4}$/;

function isRealCalendarDate(birthDate: string): boolean {
  const date = new Date(`${birthDate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(birthDate);
}

export function toBirthDate(dateParts: DateParts): string | null {
  const [day, month, year] = [dateParts.day, dateParts.month, dateParts.year].map((part) => toLatinDigits(part.trim())) as [string, string, string];
  if (!DAY_OR_MONTH.test(day) || !DAY_OR_MONTH.test(month) || !YEAR.test(year)) return null;
  const birthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isRealCalendarDate(birthDate) ? birthDate : null;
}

export function formatBirthDate(birthDate: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${birthDate}T00:00:00Z`));
}
