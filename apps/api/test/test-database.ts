import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { SignIn } from '../src/auth/route-access';
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
  environment?: Record<string, string>;
}

export async function createTestApp({ supabaseUrl, nodeEnv = 'test', extraModules = [], environment = {} }: TestAppOptions = {}): Promise<TestApp> {
  const { databaseUrl, drop } = await createTestDatabase();
  const supabaseAuth = await startTestSupabaseAuth();
  const testingModule = await withEnvironment(
    { DATABASE_URL: databaseUrl, SUPABASE_URL: supabaseUrl ?? supabaseAuth.url, NODE_ENV: nodeEnv, ...environment },
    () => Test.createTestingModule({ imports: [AppModule, ...extraModules] }).compile(),
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

export function signInAs(authUserId: string): SignIn {
  return { authUserId, email: null, isAddressClosed: false };
}

const SUPABASE_AUTH_SCHEMA = join(__dirname, 'fixtures/supabase-auth-schema.sql');

export async function addSupabaseAuthTables({ app, supabaseAuth }: TestApp): Promise<DataSource> {
  const dataSource = app.get(DataSource);
  await dataSource.query(readFileSync(SUPABASE_AUTH_SCHEMA, 'utf8'));
  supabaseAuth.onDeleteUser = async (authUserId) => {
    const [user] = await dataSource.query('DELETE FROM auth.users WHERE id = $1 RETURNING email', [authUserId]).then(([rows]) => rows as { email: string }[]);
    const traits = { user_id: authUserId, user_email: user?.email, user_phone: '' };
    await dataSource.query('INSERT INTO auth.audit_log_entries (id, payload) VALUES (gen_random_uuid(), $1)', [{ action: 'user_deleted', actor_username: 'service_role', log_type: 'team', traits }]);
  };
  return dataSource;
}

export async function addAuthUser(dataSource: DataSource, { authUserId, email }: { authUserId: string; email: string }): Promise<void> {
  const sessionId = randomUUID();
  const auditPayload = { action: 'login', actor_id: authUserId, actor_username: email, actor_via_sso: false, log_type: 'account', traits: { provider: 'email' } };
  await dataSource.query(`INSERT INTO auth.users (id, email, aud, role) VALUES ($1, $2, 'authenticated', 'authenticated')`, [authUserId, email]);
  await dataSource.query(`INSERT INTO auth.identities (provider_id, user_id, identity_data, provider) VALUES ($1, $2, $3, 'email')`, [authUserId, authUserId, { email, sub: authUserId }]);
  await dataSource.query('INSERT INTO auth.sessions (id, user_id) VALUES ($1, $2)', [sessionId, authUserId]);
  await dataSource.query('INSERT INTO auth.refresh_tokens (token, user_id, session_id) VALUES ($1, $2, $3)', [randomUUID(), authUserId, sessionId]);
  await dataSource.query(`INSERT INTO auth.audit_log_entries (id, payload) VALUES (gen_random_uuid(), $1)`, [auditPayload]);
  await dataSource.query(`INSERT INTO auth.flow_state (id, user_id, code_challenge_method, code_challenge, provider_type, authentication_method) VALUES (gen_random_uuid(), $1, 'plain', 'challenge', 'email', 'otp')`, [authUserId]);
}

export async function findAuthTablesHolding(dataSource: DataSource, text: string): Promise<string[]> {
  const tables: { table_name: string }[] = await dataSource.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth' AND table_type = 'BASE TABLE'`);
  const holding: string[] = [];
  for (const { table_name: tableName } of tables) {
    const [row] = await dataSource.query(`SELECT count(*)::int AS total FROM auth."${tableName}" AS entry WHERE to_jsonb(entry)::text ILIKE '%' || $1 || '%'`, [text]);
    if ((row as { total: number }).total > 0) holding.push(tableName);
  }
  return holding;
}
