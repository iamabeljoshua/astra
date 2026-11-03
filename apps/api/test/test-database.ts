import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { getDatabaseUrl, isLocalDatabase, withDatabaseName } from '../src/database/database-url';
import { createDatabaseIfMissing, dropDatabase } from '../src/database/manage-databases';
import { openDataSource } from '../src/database/open-data-source';

export interface TestDatabase {
  databaseUrl: string;
  drop: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = getDatabaseUrl(process.env);
  if (!isLocalDatabase(serverUrl)) {
    throw new Error('Tests create databases, so DATABASE_URL must be local.');
  }
  const databaseUrl = withDatabaseName(serverUrl, `astra_test_${randomUUID().replaceAll('-', '')}`);
  await createDatabaseIfMissing(databaseUrl);
  const dataSource = await openDataSource(databaseUrl);
  await dataSource.runMigrations();
  await dataSource.destroy();
  return { databaseUrl, drop: () => dropDatabase(databaseUrl) };
}

export interface TestApp {
  app: INestApplication;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const { databaseUrl, drop } = await createTestDatabase();
  process.env.DATABASE_URL = databaseUrl;
  const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = testingModule.createNestApplication();
  await app.init();
  const close = async () => {
    await app.close();
    await drop();
  };
  return { app, close };
}
