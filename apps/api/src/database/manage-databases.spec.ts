import { createTestDatabase, withDatabaseUrl } from '../../test/test-database';
import { dropDatabase } from './manage-databases';

const CLOSED_PORT_URL = 'postgresql://postgres:postgres@127.0.0.1:1/astra';

describe('the commands that can damage a database', () => {
  it('refuses to create test databases anywhere but the local stack', async () => {
    await expect(withDatabaseUrl(CLOSED_PORT_URL, createTestDatabase)).rejects.toThrow(
      /Refusing to create test databases/,
    );
  });

  it('refuses to drop a database anywhere but the local stack', async () => {
    await expect(dropDatabase(CLOSED_PORT_URL)).rejects.toThrow(/Refusing to drop/);
  });

  // Postgres also refuses to drop a template, so a broken guard fails this test without losing data.
  it('refuses to drop a system database on the local stack', async () => {
    await expect(dropDatabase('postgresql://postgres:postgres@127.0.0.1:54422/template1')).rejects.toThrow(
      /Refusing to drop .*system database/,
    );
  });
});
