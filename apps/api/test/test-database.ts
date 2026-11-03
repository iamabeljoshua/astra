import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { getDatabaseUrl, requireLocalStack, withDatabaseName } from '../src/database/database-url';
import { createDatabaseIfMissing, dropDatabase } from '../src/database/manage-databases';
import { openDataSourceWithAppSchema } from '../src/database/open-data-source';

export interface TestDatabase {
  databaseUrl: string;
  drop: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = getDatabaseUrl(process.env);
  requireLocalStack(serverUrl, 'create test databases on');
  const databaseUrl = withDatabaseName(serverUrl, `astra_test_${randomUUID().replaceAll('-', '')}`);
  await createDatabaseIfMissing(databaseUrl);
  const dataSource = await openDataSourceWithAppSchema(databaseUrl);
  await dataSource.runMigrations();
  await dataSource.destroy();
  return { databaseUrl, drop: () => dropDatabase(databaseUrl) };
}

export async function withDatabaseUrl<Result>(
  databaseUrl: string,
  action: () => Promise<Result>,
): Promise<Result> {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  try {
    return await action();
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
}

export interface TestApp {
  app: INestApplication;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const { databaseUrl, drop } = await createTestDatabase();
  const testingModule = await withDatabaseUrl(databaseUrl, () =>
    Test.createTestingModule({ imports: [AppModule] }).compile(),
  );
  const app = testingModule.createNestApplication();
  await app.init();
  const close = async () => {
    await app.close();
    await drop();
  };
  return { app, close };
}
