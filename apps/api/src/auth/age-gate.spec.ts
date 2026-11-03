import { isOldEnough, isValidBirthDate } from './age-gate';

const NOON_UTC = new Date('2026-11-03T12:00:00Z');

describe('isOldEnough', () => {
  it.each([
    ['the 13th birthday has begun everywhere', '2013-11-03', '2026-11-03T12:00:00Z', true],
    ['the last moment before it has begun everywhere', '2013-11-03', '2026-11-03T11:59:59Z', false],
    ['a birthday tomorrow', '2013-11-04', '2026-11-03T12:00:00Z', false],
    ['a birthday yesterday', '2013-11-02', '2026-11-03T12:00:00Z', true],
    ['one year older', '2012-11-03', '2026-11-03T12:00:00Z', true],
    ['one year younger', '2014-11-03', '2026-11-03T12:00:00Z', false],
    ['a new baby', '2026-11-03', '2026-11-03T12:00:00Z', false],
    ['an adult', '2004-03-14', '2026-11-03T12:00:00Z', true],
    ['the turn of a year, not yet', '2013-01-01', '2026-01-01T11:59:59Z', false],
    ['the turn of a year, reached', '2013-01-01', '2026-01-01T12:00:00Z', true],
  ])('decides %s', (_caseName, birthDate, now, expected) => {
    expect(isOldEnough(birthDate, new Date(now))).toBe(expected);
  });

  it.each([
    ['28 February in a common year', '2012-02-29', '2025-02-28T23:59:59Z', false],
    ['1 March in a common year, before it begins everywhere', '2012-02-29', '2025-03-01T11:59:59Z', false],
    ['1 March in a common year', '2012-02-29', '2025-03-01T12:00:00Z', true],
    ['29 February in a leap year', '2016-02-29', '2029-03-01T12:00:00Z', true],
  ])('treats a birthday on 29 February on %s', (_caseName, birthDate, now, expected) => {
    expect(isOldEnough(birthDate, new Date(now))).toBe(expected);
  });

  it.each(['America/Los_Angeles', 'Africa/Lagos', 'Pacific/Kiritimati', 'Etc/GMT+12'])(
    'gives the same answer when the server runs in %s',
    (timeZone) => {
      const originalTimeZone = process.env.TZ;
      process.env.TZ = timeZone;
      try {
        expect(isOldEnough('2013-11-03', new Date('2026-11-03T11:59:59Z'))).toBe(false);
        expect(isOldEnough('2013-11-03', new Date('2026-11-03T12:00:00Z'))).toBe(true);
      } finally {
        process.env.TZ = originalTimeZone;
      }
    },
  );

  it.each([
    ['Lagos, UTC+1', 1],
    ['Kiritimati, UTC+14', 14],
    ['Los Angeles, UTC-8', -8],
    ['Baker Island, UTC-12', -12],
  ])('never lets a student through in %s before the birthday starts there', (_zone, offsetHours) => {
    const birthdayStartsThere = Date.UTC(2026, 10, 3) - offsetHours * 3_600_000;

    expect(isOldEnough('2013-11-03', new Date(birthdayStartsThere - 1))).toBe(false);
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
    ['a date after today everywhere', '2026-11-05'],
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
