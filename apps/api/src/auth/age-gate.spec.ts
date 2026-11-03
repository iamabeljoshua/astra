import { isOldEnough, isValidBirthDate } from './age-gate';

const NOON_UTC = new Date('2026-11-03T12:00:00Z');

const HOURS_BEFORE_BIRTHDAY_AT_MOST = 26;
const MILLISECONDS_PER_HOUR = 3_600_000;
const BIRTH_DATE = '2013-11-03';
const BIRTHDAY_BEGINS_AT_UTC = Date.UTC(2026, 10, 3);

function birthdayBeginsIn(offsetHours: number) {
  return BIRTHDAY_BEGINS_AT_UTC - offsetHours * MILLISECONDS_PER_HOUR;
}

describe('isOldEnough', () => {
  it.each([
    ['the moment the 13th birthday begins in UTC+14', '2013-11-03', '2026-11-02T10:00:00Z', true],
    ['the last moment before it begins in UTC+14', '2013-11-03', '2026-11-02T09:59:59Z', false],
    ['a birthday more than a day away everywhere', '2013-11-05', '2026-11-03T12:00:00Z', false],
    ['a birthday that has begun only in UTC+14', '2013-11-04', '2026-11-03T12:00:00Z', true],
    ['a birthday yesterday', '2013-11-02', '2026-11-03T12:00:00Z', true],
    ['one year older', '2012-11-03', '2026-11-03T12:00:00Z', true],
    ['one year younger', '2014-11-03', '2026-11-03T12:00:00Z', false],
    ['a new baby', '2026-11-03', '2026-11-03T12:00:00Z', false],
    ['an adult', '2004-03-14', '2026-11-03T12:00:00Z', true],
    ['the turn of a year, not yet', '2013-01-01', '2025-12-31T09:59:59Z', false],
    ['the turn of a year, reached', '2013-01-01', '2025-12-31T10:00:00Z', true],
  ])('decides %s', (_caseName, birthDate, now, expected) => {
    expect(isOldEnough(birthDate, new Date(now))).toBe(expected);
  });

  it.each([
    ['the last moment before 1 March begins in UTC+14', '2012-02-29', '2025-02-28T09:59:59Z', false],
    ['the moment 1 March begins in UTC+14', '2012-02-29', '2025-02-28T10:00:00Z', true],
    ['another common year, before 1 March begins in UTC+14', '2016-02-29', '2029-02-28T09:59:59Z', false],
    ['another common year, once 1 March begins in UTC+14', '2016-02-29', '2029-02-28T10:00:00Z', true],
  ])('moves a 29 February birthday to 1 March, at %s', (_caseName, birthDate, now, expected) => {
    expect(isOldEnough(birthDate, new Date(now))).toBe(expected);
  });

  it.each(['America/Los_Angeles', 'Africa/Lagos', 'Pacific/Kiritimati', 'Etc/GMT+12'])(
    'gives the same answer when the server runs in %s',
    (timeZone) => {
      const originalTimeZone = process.env.TZ;
      process.env.TZ = timeZone;
      try {
        expect(isOldEnough(BIRTH_DATE, new Date('2026-11-02T09:59:59Z'))).toBe(false);
        expect(isOldEnough(BIRTH_DATE, new Date('2026-11-02T10:00:00Z'))).toBe(true);
      } finally {
        if (originalTimeZone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimeZone;
      }
    },
  );

  it.each([
    ['Kiritimati, UTC+14', 14],
    ['Auckland, UTC+13', 13],
    ['Lagos, UTC+1', 1],
    ['London, UTC', 0],
    ['Los Angeles, UTC-8', -8],
    ['Baker Island, UTC-12', -12],
  ])('never closes a student out on their 13th birthday in %s', (_zone, offsetHours) => {
    expect(isOldEnough(BIRTH_DATE, new Date(birthdayBeginsIn(offsetHours)))).toBe(true);
  });

  it('lets a student in at most 26 hours before the birthday begins where they live', () => {
    const firstMomentAllowed = birthdayBeginsIn(14);

    expect(isOldEnough(BIRTH_DATE, new Date(firstMomentAllowed - 1))).toBe(false);
    expect(isOldEnough(BIRTH_DATE, new Date(firstMomentAllowed))).toBe(true);
    expect(birthdayBeginsIn(-12) - firstMomentAllowed).toBe(HOURS_BEFORE_BIRTHDAY_AT_MOST * MILLISECONDS_PER_HOUR);
  });
});

describe('isValidBirthDate', () => {
  it.each(['2004-03-14', '1900-01-01', '2012-02-29', '2026-11-03', '2026-11-04'])('accepts %s', (text) => {
    expect(isValidBirthDate(text, NOON_UTC)).toBe(true);
  });

  it.each([
    ['a date that does not exist', '2013-02-30'],
    ['29 February in a common year', '2013-02-29'],
    ['month 13', '2004-13-01'],
    ['day 0', '2004-03-00'],
    ['a date after today in every time zone', '2026-11-05'],
    ['a date long ago', '1899-12-31'],
    ['the wrong order', '14-03-2004'],
    ['no leading zero', '2004-3-14'],
    ['a time as well', '2004-03-14T00:00:00Z'],
    ['spaces', ' 2004-03-14 '],
    ['a number', 20040314],
    ['null', null],
    ['an object', { year: 2004 }],
    ['a list', ['2004-03-14']],
  ])('rejects %s', (_caseName, text) => {
    expect(isValidBirthDate(text, NOON_UTC)).toBe(false);
  });
});
