import type { DataSource } from 'typeorm';
import { createTestDatabase } from '../../test/test-database';
import type { TestDatabase } from '../../test/test-database';
import { SessionEntity } from '../sessions/session.entity';
import { StudentProfileEntity } from '../students/student-profile.entity';
import { StudentEntity } from '../students/student.entity';
import { getDatabaseName, withDatabaseName } from './database-url';
import { EXAMPLE_STUDENT_ID, replaceExampleData } from './example-data';
import { createDatabaseIfMissing, dropDatabase } from './manage-databases';
import { openMigratedDataSource } from './open-data-source';

describe('a seeded database built from migrations', () => {
  let testDatabase: TestDatabase;
  let dataSource: DataSource;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    dataSource = await openMigratedDataSource(testDatabase.databaseUrl);
    await replaceExampleData(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await testDatabase?.drop();
  });

  function readExampleSessions() {
    return dataSource
      .getRepository(SessionEntity)
      .find({ where: { studentId: EXAMPLE_STUDENT_ID }, order: { startedAt: 'DESC' } });
  }

  it('matches the entities, so no migration is missing', async () => {
    const schemaChanges = await dataSource.driver.createSchemaBuilder().log();

    expect(schemaChanges.upQueries.map((query) => query.query)).toEqual([]);
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
