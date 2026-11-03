import { Test } from '@nestjs/testing';
import { DatabaseModule } from './database.module';
import { openDataSource } from './open-data-source';

const CLOSED_PORT_URL = 'postgresql://postgres:secret-password@127.0.0.1:1/astra';

describe('connecting with no database to reach', () => {
  it('names the database and the fix, and never the password', async () => {
    const failure: Error = await openDataSource(CLOSED_PORT_URL).catch((error) => error);

    expect(failure.message).toContain('127.0.0.1:1/astra');
    expect(failure.message).toContain('pnpm db:up');
    expect(failure.message).not.toContain('secret-password');
  });

  it('stops the API on the first attempt with the same message', async () => {
    process.env.DATABASE_URL = CLOSED_PORT_URL;

    await expect(
      Test.createTestingModule({ imports: [DatabaseModule] }).compile(),
    ).rejects.toThrow(/pnpm db:up/);
  });
});
