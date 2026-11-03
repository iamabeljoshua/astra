import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getDatabaseUrl, requireLocalStack, withDatabaseName } from '../src/database/database-url';
import { createDatabaseIfMissing, dropDatabase } from '../src/database/manage-databases';
import { openDataSourceWithAppSchema } from '../src/database/open-data-source';
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
  const dataSource = await openDataSourceWithAppSchema(databaseUrl);
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

export async function createTestApp({ supabaseUrl }: { supabaseUrl?: string } = {}): Promise<TestApp> {
  const { databaseUrl, drop } = await createTestDatabase();
  const supabaseAuth = await startTestSupabaseAuth();
  const testingModule = await withEnvironment(
    { DATABASE_URL: databaseUrl, SUPABASE_URL: supabaseUrl ?? supabaseAuth.url },
    () => Test.createTestingModule({ imports: [AppModule] }).compile(),
  );
  const app = testingModule.createNestApplication();
  // Supertest would otherwise start the server once per request, and a race test sends many at once.
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
