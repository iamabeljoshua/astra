import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
