import { randomUUID } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getDatabaseUrl, requireLocalStack, withDatabaseName } from '../src/infrastructure/orm/database-url';
import { createDatabaseIfMissing, dropDatabase } from '../src/infrastructure/orm/manage-databases';
import { openDataSourceWithMigrationLog } from '../src/infrastructure/orm/open-data-source';
import { startTestSupabaseAuth } from './test-auth';
import type { TestSupabaseAuth } from './test-auth';

export interface TestDatabase {
  databaseUrl: string;
  drop: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = getDatabaseUrl(process.env);
  requireLocalStack(serverUrl, 'create test databases on');
  const databaseUrl = withDatabaseName(serverUrl, `astra_test_${randomUUID().replaceAll('-', '')}`);
  await createDatabaseIfMissing(databaseUrl);
  const dataSource = await openDataSourceWithMigrationLog(databaseUrl);
  await dataSource.runMigrations();
  await dataSource.destroy();
  return { databaseUrl, drop: () => dropDatabase(databaseUrl) };
}

export async function withEnvironment<Result>(
  values: Record<string, string>,
  action: () => Promise<Result>,
): Promise<Result> {
  const previousValues = Object.keys(values).map((name) => [name, process.env[name]] as const);
  Object.assign(process.env, values);
  try {
    return await action();
  } finally {
    for (const [name, previousValue] of previousValues) {
      if (previousValue === undefined) delete process.env[name];
      else process.env[name] = previousValue;
    }
  }
}

export interface TestApp {
  app: INestApplication;
  supabaseAuth: TestSupabaseAuth;
  close: () => Promise<void>;
}

interface TestAppOptions {
  supabaseUrl?: string;
  nodeEnv?: string;
  extraModules?: Type[];
  configure?(builder: TestingModuleBuilder): TestingModuleBuilder;
}

export async function createTestApp({ supabaseUrl, nodeEnv = 'test', extraModules = [], configure = (builder) => builder }: TestAppOptions = {}): Promise<TestApp> {
  const { databaseUrl, drop } = await createTestDatabase();
  const supabaseAuth = await startTestSupabaseAuth();
  const testingModule = await withEnvironment(
    { DATABASE_URL: databaseUrl, SUPABASE_URL: supabaseUrl ?? supabaseAuth.url, NODE_ENV: nodeEnv },
    () => configure(Test.createTestingModule({ imports: [AppModule, ...extraModules] })).compile(),
  );
  const app = testingModule.createNestApplication();
  await app.listen(0, '127.0.0.1');
  const close = async () => {
    await app.close();
    await supabaseAuth.close();
    await drop();
  };
  return { app, supabaseAuth, close };
}

export const OLD_ENOUGH_BIRTH_DATE = '2004-03-14';

export interface TestStudent {
  authUserId: string;
  token: string;
  studentId: string;
}

export async function createTestStudent({ app, supabaseAuth }: TestApp): Promise<TestStudent> {
  const authUserId = randomUUID();
  const token = await supabaseAuth.signToken(authUserId);
  const { body } = await request(app.getHttpServer())
    .post('/me/birth-date')
    .set('Authorization', `Bearer ${token}`)
    .send({ birthDate: OLD_ENOUGH_BIRTH_DATE })
    .expect(200);
  return { authUserId, token, studentId: body.student.id };
}
