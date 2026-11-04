import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidBirthDate } from '../../../api/src/auth/age-gate';
import { formatBirthDate, toBirthDate } from './birthDateParts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formatBirthDate', () => {
  it.each([
    ['America/Los_Angeles', 480],
    ['UTC', 0],
    ['Pacific/Kiritimati', -840],
  ])('shows the day the student typed on a device in %s', (timeZone, minutesBehindUtc) => {
    vi.stubEnv('TZ', timeZone);

    expect(new Date('2004-03-14T00:00:00Z').getTimezoneOffset()).toBe(minutesBehindUtc);
    expect(formatBirthDate('2004-03-14')).toContain('14');
  });
});

describe('toBirthDate', () => {
  it('pads the day and month', () => {
    expect(toBirthDate({ day: '4', month: '3', year: '2004' })).toBe('2004-03-04');
  });

  it('refuses a date that is not on the calendar', () => {
    expect(toBirthDate({ day: '31', month: '2', year: '2004' })).toBeNull();
  });

  it.each([
    ['0000', '1', '1', false],
    ['0001', '14', '3', false],
    ['1899', '31', '12', false],
    ['1900', '1', '1', true],
    ['2004', '14', '3', true],
  ])('decides year %s the same way as the API, day %s of month %s', (year, day, month, isAccepted) => {
    const birthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    expect(toBirthDate({ day, month, year })).toBe(isAccepted ? birthDate : null);
    expect(isValidBirthDate(birthDate, new Date())).toBe(isAccepted);
  });
});
