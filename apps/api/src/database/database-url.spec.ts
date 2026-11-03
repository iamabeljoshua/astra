import { describeDatabaseWithoutPassword, getDatabaseUrl, isLocalDatabase, isSystemDatabase } from './database-url';

describe('the database URL', () => {
  it('falls back to the local stack when DATABASE_URL is unset or empty', () => {
    const localUrl = 'postgresql://postgres:postgres@127.0.0.1:54422/astra';

    expect(getDatabaseUrl({})).toBe(localUrl);
    expect(getDatabaseUrl({ DATABASE_URL: '' })).toBe(localUrl);
  });

  it('rejects a value that is not a URL, without repeating the value', () => {
    expect(() => getDatabaseUrl({ DATABASE_URL: 'secret-password' })).toThrow(
      /^DATABASE_URL is not a valid URL\.$/,
    );
  });

  it('leaves the password out of its description', () => {
    expect(describeDatabaseWithoutPassword('postgresql://postgres:secret-password@db.example.com:5432/astra')).toBe(
      'db.example.com:5432/astra',
    );
  });

  it.each([
    ['postgresql://postgres:postgres@127.0.0.1:54422/astra', true],
    ['postgresql://postgres:postgres@localhost:54422/astra', true],
    ['postgresql://postgres:postgres@db.example.supabase.co:5432/postgres', false],
    ['postgresql://postgres:postgres@127.0.0.1.example.com:5432/astra', false],
  ])('judges whether %s is local, the check that guards reset and seed', (databaseUrl, isLocal) => {
    expect(isLocalDatabase(databaseUrl)).toBe(isLocal);
  });

  it.each([
    ['postgres', true],
    ['_supabase', true],
    ['template1', true],
    ['astra', false],
    ['astra_lane1', false],
  ])('judges whether %s is a system database, which reset must never drop', (name, isSystem) => {
    expect(isSystemDatabase(`postgresql://postgres:postgres@127.0.0.1:54422/${name}`)).toBe(isSystem);
  });
});
