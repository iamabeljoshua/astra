import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { createTestDatabase } from '../../../test/test-database';
import type { TestDatabase } from '../../../test/test-database';
import { SessionEntity } from './entities/session.entity';
import { ClosedAccountEntity } from './entities/closed-account.entity';
import { StudentProfileEntity } from './entities/student-profile.entity';
import { StudentEntity } from './entities/student.entity';
import { createDataSourceOptions } from './data-source-options';
import { getDatabaseName, withDatabaseName } from './database-url';
import { EXAMPLE_AUTH_USER_ID, EXAMPLE_STUDENT_ID, NEW_STUDENT_AUTH_USER_ID, replaceExampleData } from './example-data';
import { createDatabaseIfMissing, dropDatabase } from './manage-databases';
import { CreateStudentsAndSessions1793666578779 } from './migrations/1793666578779-create-students-and-sessions';
import { AddSignInAndAgeGate1793686438335 } from './migrations/1793686438335-add-sign-in-and-age-gate';
import { openDataSourceWithMigrationLog, openMigratedDataSource } from './open-data-source';

// Views and foreign tables count too, because the Data API serves those as well and row security cannot close them.
const USER_RELATIONS_QUERY = `
  SELECT namespace.nspname AS schema, relation.relname AS name, relation.relrowsecurity AS has_row_security
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')`;

const MIGRATIONS_BEFORE_THE_MOVE = [CreateStudentsAndSessions1793666578779, AddSignInAndAgeGate1793686438335];

describe('a database built from migrations', () => {
  let testDatabase: TestDatabase;
  let dataSource: DataSource;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    dataSource = await openMigratedDataSource(testDatabase.databaseUrl);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await testDatabase?.drop();
  });

  it('matches the entities, so no migration is missing', async () => {
    const schemaChanges = await dataSource.driver.createSchemaBuilder().log();
    const missingChanges = schemaChanges.upQueries.map((query) => query.query);

    if (missingChanges.length > 0) {
      throw new Error(
        `The entities and the migrations differ. Run pnpm db:migration as "To change the tables" in the README says. Missing changes:\n${missingChanges.join('\n')}`,
      );
    }
  });

  it('keeps every table in public, the migrations table included', async () => {
    const relations: { schema: string; name: string }[] = await dataSource.query(USER_RELATIONS_QUERY);

    expect(relations.filter((relation) => relation.schema !== 'public')).toEqual([]);
    expect(relations.map((relation) => relation.name)).toEqual(
      expect.arrayContaining(['migrations', 'students', 'student_profiles', 'sessions', 'closed_accounts']),
    );
  });

  it('turns row security on for every table and adds no policy', async () => {
    const relations: { name: string; has_row_security: boolean }[] = await dataSource.query(USER_RELATIONS_QUERY);

    expect(relations.filter((relation) => !relation.has_row_security)).toEqual([]);
    expect(await dataSource.query('SELECT policyname FROM pg_policies')).toEqual([]);
  });

  it('stops the API on a database that has migrations to run', async () => {
    const unmigratedUrl = withDatabaseName(
      testDatabase.databaseUrl,
      `${getDatabaseName(testDatabase.databaseUrl)}_unmigrated`,
    );
    await createDatabaseIfMissing(unmigratedUrl);

    try {
      await expect(openMigratedDataSource(unmigratedUrl)).rejects.toThrow(/pnpm db:migrate/);
    } finally {
      await dropDatabase(unmigratedUrl);
    }
  });

  it('moves a database from before the move to public, and keeps its rows and its log', async () => {
    const oldUrl = withDatabaseName(testDatabase.databaseUrl, `${getDatabaseName(testDatabase.databaseUrl)}_old`);
    const authUserId = randomUUID();
    await createDatabaseIfMissing(oldUrl);

    try {
      const oldDataSource = await new DataSource({
        ...createDataSourceOptions(oldUrl),
        migrations: MIGRATIONS_BEFORE_THE_MOVE,
      } as DataSourceOptions).initialize();
      await oldDataSource.runMigrations();
      await oldDataSource.query('INSERT INTO "app"."closed_accounts" ("auth_user_id") VALUES ($1)', [authUserId]);
      await oldDataSource.query('ALTER TABLE "public"."migrations" SET SCHEMA "app"');
      await oldDataSource.destroy();

      const movedDataSource = await openDataSourceWithMigrationLog(oldUrl);
      await movedDataSource.runMigrations();

      expect(await movedDataSource.query('SELECT "auth_user_id" AS id FROM "public"."closed_accounts"')).toEqual([{ id: authUserId }]);
      const relations: { schema: string; has_row_security: boolean }[] = await movedDataSource.query(USER_RELATIONS_QUERY);
      expect(relations.filter((relation) => relation.schema !== 'public' || !relation.has_row_security)).toEqual([]);
      await movedDataSource.destroy();
    } finally {
      await dropDatabase(oldUrl);
    }
  });

  describe('after the seed', () => {
    beforeAll(() => replaceExampleData(dataSource));

    function readExampleSessions() {
      return dataSource
        .getRepository(SessionEntity)
        .find({ where: { studentId: EXAMPLE_STUDENT_ID }, order: { startedAt: 'DESC' } });
    }

    it('holds the example student and profile from the prototype', async () => {
      const student = await dataSource
        .getRepository(StudentEntity)
        .findOneBy({ id: EXAMPLE_STUDENT_ID });
      const profile = await dataSource
        .getRepository(StudentProfileEntity)
        .findOneBy({ studentId: EXAMPLE_STUDENT_ID });

      expect(student).toMatchObject({ name: 'Maya' });
      expect(profile).toMatchObject({
        interests: ['Basketball', 'Space'],
        level: 'university',
        goal: 'exam',
        voice: 'ada',
      });
    });

    it('links the example student to the local account that db:up creates', async () => {
      const devAccounts = JSON.parse(readFileSync(join(__dirname, '../../../../../supabase/dev-accounts.json'), 'utf8'));
      const student = await dataSource.getRepository(StudentEntity).findOneByOrFail({ id: EXAMPLE_STUDENT_ID });

      expect(student.authUserId).toBe(EXAMPLE_AUTH_USER_ID);
      expect(devAccounts.accounts.map((account: { id: string }) => account.id)).toEqual([
        EXAMPLE_AUTH_USER_ID,
        NEW_STUDENT_AUTH_USER_ID,
      ]);
    });

    it('makes the new student account new again when the seed runs', async () => {
      await dataSource.getRepository(ClosedAccountEntity).insert({ authUserId: NEW_STUDENT_AUTH_USER_ID });

      await replaceExampleData(dataSource);

      expect(await dataSource.getRepository(ClosedAccountEntity).countBy({ authUserId: NEW_STUDENT_AUTH_USER_ID })).toBe(0);

      await dataSource.getRepository(StudentEntity).insert({ authUserId: NEW_STUDENT_AUTH_USER_ID, birthDate: '2004-03-14' });

      await replaceExampleData(dataSource);

      expect(await dataSource.getRepository(StudentEntity).countBy({ authUserId: NEW_STUDENT_AUTH_USER_ID })).toBe(0);
    });

    it('replaces the example account after it answered the question by hand', async () => {
      await dataSource.getRepository(StudentEntity).delete({ authUserId: EXAMPLE_AUTH_USER_ID });
      await dataSource.getRepository(StudentEntity).insert({ authUserId: EXAMPLE_AUTH_USER_ID, birthDate: '2004-03-14' });

      await replaceExampleData(dataSource);

      const student = await dataSource.getRepository(StudentEntity).findOneByOrFail({ authUserId: EXAMPLE_AUTH_USER_ID });
      expect(student.id).toBe(EXAMPLE_STUDENT_ID);
    });

    it('opens the example account after it was closed', async () => {
      await dataSource.getRepository(ClosedAccountEntity).insert({ authUserId: EXAMPLE_AUTH_USER_ID });

      await replaceExampleData(dataSource);

      expect(await dataSource.getRepository(ClosedAccountEntity).countBy({ authUserId: EXAMPLE_AUTH_USER_ID })).toBe(0);
    });

    it('holds the six sessions from the prototype, one of them unfinished', async () => {
      const sessions = await readExampleSessions();

      expect(sessions.map((session) => [session.title, session.status])).toEqual([
        ['Free-body diagrams', 'in_progress'],
        ['Why the sky is dark at night', 'finished'],
        ['Solving quadratic equations', 'finished'],
        ['Balancing chemical equations', 'finished'],
        ['How compound interest grows', 'finished'],
        ['The causes of the French Revolution', 'finished'],
      ]);
      expect(sessions.every((session) => session.language === 'en')).toBe(true);
    });

    it('ends at the same six sessions when the seed runs again', async () => {
      await dataSource.getRepository(SessionEntity).save({
        studentId: EXAMPLE_STUDENT_ID,
        title: 'Added between seeds',
        subject: 'Math',
        language: 'en',
      });

      await replaceExampleData(dataSource);

      const sessions = await readExampleSessions();
      expect(sessions).toHaveLength(6);
      expect(sessions.map((session) => session.title)).not.toContain('Added between seeds');
    });
  });
});
