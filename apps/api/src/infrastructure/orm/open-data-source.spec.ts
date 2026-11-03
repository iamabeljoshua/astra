import { Test } from '@nestjs/testing';
import { withEnvironment } from '../../../test/test-database';
import { DatabaseModule } from './database.module';
import { openDataSource } from './open-data-source';

const CLOSED_PORT_URL = 'postgresql://postgres:secret-password@127.0.0.1:1/astra';
const UNREACHABLE_HOST_URL =
  'postgresql://postgres:secret-password@db.example.invalid:5432/astra?sslmode=verify-full';

function compileDatabaseModule() {
  return Test.createTestingModule({ imports: [DatabaseModule] }).compile();
}

describe('connecting with no database to reach', () => {
  it('names the database and the fix, and never the password', async () => {
    const failure: Error = await openDataSource(CLOSED_PORT_URL).catch((error) => error);

    expect(failure.message).toContain('127.0.0.1:1/astra');
    expect(failure.message).toContain('pnpm db:up');
    expect(failure.message).not.toContain('secret-password');
  });

  it('points a non-local host at the README, not at the local stack', async () => {
    const failure: Error = await openDataSource(UNREACHABLE_HOST_URL).catch((error) => error);

    expect(failure.message).toContain('db.example.invalid:5432/astra');
    expect(failure.message).toContain('Connect a hosted project');
    expect(failure.message).not.toContain('pnpm db:up');
    expect(failure.message).not.toContain('secret-password');
  });

  it('stops the API on the first attempt with the same message', async () => {
    await expect(withEnvironment({ DATABASE_URL: CLOSED_PORT_URL }, compileDatabaseModule)).rejects.toThrow(/pnpm db:up/);
  });

  it('stops the API on a non-local URL that would connect in plaintext', async () => {
    const plaintextUrl = 'postgresql://postgres:secret-password@db.example.invalid:5432/astra';

    await expect(withEnvironment({ DATABASE_URL: plaintextUrl }, compileDatabaseModule)).rejects.toThrow(/plaintext/);
  });

  it('puts DATABASE_URL back after the attempt', async () => {
    const urlBefore = process.env.DATABASE_URL;

    await withEnvironment({ DATABASE_URL: CLOSED_PORT_URL }, compileDatabaseModule).catch(() => undefined);

    expect(process.env.DATABASE_URL).toBe(urlBefore);
  });
});
