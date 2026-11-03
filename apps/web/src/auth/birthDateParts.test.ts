import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBirthDate, toBirthDate } from './birthDateParts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formatBirthDate', () => {
  it.each(['America/Los_Angeles', 'UTC', 'Pacific/Kiritimati'])('shows the day the student typed on a device in %s', (timeZone) => {
    vi.stubEnv('TZ', timeZone);

    expect(formatBirthDate('2004-03-14')).toContain('14');
    expect(new Date('2004-03-14T00:00:00Z').getTimezoneOffset()).toBe(timeZone === 'America/Los_Angeles' ? 480 : timeZone === 'UTC' ? 0 : -840);
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
