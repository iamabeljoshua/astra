import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { createTestDatabase } from '../../test/test-database';
import type { TestDatabase } from '../../test/test-database';
import { SessionEntity } from '../sessions/session.entity';
import { ClosedAccountEntity } from '../students/closed-account.entity';
import { StudentProfileEntity } from '../students/student-profile.entity';
import { StudentEntity } from '../students/student.entity';
import { getDatabaseName, withDatabaseName } from './database-url';
import { EXAMPLE_AUTH_USER_ID, EXAMPLE_STUDENT_ID, NEW_STUDENT_AUTH_USER_ID, replaceExampleData } from './example-data';
import { createDatabaseIfMissing, dropDatabase } from './manage-databases';
import { openMigratedDataSource } from './open-data-source';

const APP_SCHEMA_ROLES_QUERY = `
  SELECT role.rolname AS role, has_schema_privilege(role.rolname, 'app', 'USAGE') AS has_usage
  FROM pg_roles AS role
  WHERE role.rolname IN ('anon', 'authenticated')
  ORDER BY role.rolname`;

// Views and foreign tables count too, because the Data API serves those as well.
const USER_RELATIONS_QUERY = `
  SELECT namespace.nspname AS schema, relation.relname AS name
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')`;

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

  it('keeps every table in the app schema, the migrations table included', async () => {
    const relations: { schema: string; name: string }[] = await dataSource.query(USER_RELATIONS_QUERY);

    expect(relations.filter((relation) => relation.schema !== 'app')).toEqual([]);
    expect(relations.map((relation) => relation.name)).toEqual(
      expect.arrayContaining(['migrations', 'students', 'student_profiles', 'sessions', 'closed_accounts']),
    );
  });

  it('gives anon and authenticated no way into the app schema', async () => {
    expect(await dataSource.query(APP_SCHEMA_ROLES_QUERY)).toEqual([
      { role: 'anon', has_usage: false },
      { role: 'authenticated', has_usage: false },
    ]);
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
      const devAccounts = JSON.parse(readFileSync(join(__dirname, '../../../../supabase/dev-accounts.json'), 'utf8'));
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
