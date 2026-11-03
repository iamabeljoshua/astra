import {
  describeDatabaseWithoutPassword,
  getDatabaseUrl,
  isLocalDatabase,
  isSystemDatabase,
  requireLocalStack,
} from './database-url';

const HOSTED_URL = 'postgresql://postgres:secret-password@db.example.supabase.co:5432/postgres';

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
    'postgresql://postgres:secret-password@127.0.0.1:54422/astra?host=db.example.com',
    'postgresql://postgres:secret-password@127.0.0.1:54422/astra?port=5432',
    'postgresql://postgres:secret-password@127.0.0.1:1/astra?host=127.0.0.1&port=54422',
    'postgresql://postgres:secret-password@127.0.0.1:54422/astra?h%6Fst=db.example.com',
    'postgresql://postgres:secret-password@localhost/astra?host=/var/run/postgresql',
  ])('refuses a host or a port in the query string of %s', (databaseUrl) => {
    const readUrl = () => getDatabaseUrl({ DATABASE_URL: databaseUrl });

    expect(readUrl).toThrow(/host or port/);
    expect(readUrl).not.toThrow(/secret-password/);
  });

  it.each([
    ['no sslmode', HOSTED_URL],
    ['an empty sslmode', `${HOSTED_URL}?sslmode=`],
    ['sslmode=disable', `${HOSTED_URL}?sslmode=disable`],
    ['ssl=0', `${HOSTED_URL}?ssl=0`],
  ])('refuses a non-local URL with %s, which would connect in plaintext', (_caseName, databaseUrl) => {
    const readUrl = () => getDatabaseUrl({ DATABASE_URL: databaseUrl });

    expect(readUrl).toThrow(/plaintext.*sslmode=verify-full.*Connect a hosted project/);
    expect(readUrl).not.toThrow(/secret-password/);
  });

  it.each(['sslmode=verify-full', 'sslmode=no-verify', 'sslmode=verify-full&uselibpqcompat=true'])(
    'accepts a non-local URL with %s',
    (query) => {
      const databaseUrl = `${HOSTED_URL}?${query}`;

      expect(getDatabaseUrl({ DATABASE_URL: databaseUrl })).toBe(databaseUrl);
    },
  );

  it('accepts a local URL with no sslmode', () => {
    const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54422/astra_lane1';

    expect(getDatabaseUrl({ DATABASE_URL: databaseUrl })).toBe(databaseUrl);
  });

  it.each([
    ['postgresql://postgres:postgres@127.0.0.1:54422/astra', true],
    ['postgresql://postgres:postgres@localhost:54422/astra', true],
    ['postgresql://postgres:postgres@[::1]:54422/astra', true],
    ['postgresql://postgres:postgres@db.example.supabase.co:5432/postgres', false],
    ['postgresql://postgres:postgres@127.0.0.1.example.com:5432/astra', false],
  ])('judges whether %s is local', (databaseUrl, isLocal) => {
    expect(isLocalDatabase(databaseUrl)).toBe(isLocal);
  });

  it.each([
    ['postgres', true],
    ['post%67res', true],
    ['_supabase', true],
    ['template1', true],
    ['astra', false],
    ['astra_lane1', false],
  ])('judges whether %s is a system database, which reset must never drop', (name, isSystem) => {
    expect(isSystemDatabase(`postgresql://postgres:postgres@127.0.0.1:54422/${name}`)).toBe(isSystem);
  });
});

describe('the local stack check, which reads a URL and never connects', () => {
  it.each([
    'postgresql://postgres:postgres@127.0.0.1:54422/astra',
    'postgresql://postgres:postgres@localhost:54422/astra',
    'postgresql://postgres:postgres@[::1]:54422/astra',
  ])('accepts %s', (databaseUrl) => {
    expect(() => requireLocalStack(databaseUrl, 'seed')).not.toThrow();
  });

  it.each([
    ['native Postgres', 'postgresql://postgres:secret-password@127.0.0.1:5432/astra'],
    ['the other Supabase stack', 'postgresql://postgres:secret-password@127.0.0.1:54322/astra'],
    ['the other Supabase stack by name', 'postgresql://postgres:secret-password@localhost:54322/astra'],
    ['a URL with no port', 'postgresql://postgres:secret-password@127.0.0.1/astra'],
    ['a remote host on the stack port', 'postgresql://postgres:secret-password@db.example.com:54422/astra'],
    ['a host that starts like a local one', 'postgresql://postgres:secret-password@127.0.0.1.example.com:54422/astra'],
    ['a host override', 'postgresql://postgres:secret-password@127.0.0.1:54422/astra?host=db.example.com'],
    ['a port override', 'postgresql://postgres:secret-password@127.0.0.1:54422/astra?port=5432'],
  ])('refuses %s', (_caseName, databaseUrl) => {
    const check = () => requireLocalStack(databaseUrl, 'seed');

    expect(check).toThrow(/Refusing to seed .*port 54422/);
    expect(check).not.toThrow(/secret-password/);
  });
});
