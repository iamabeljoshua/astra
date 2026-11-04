import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { ClosedAccountEntity } from '../infrastructure/orm/entities/closed-account.entity';
import type { SaveStudentProfileBodyDto } from './student-profile.dto';
import { StudentEntity } from '../infrastructure/orm/entities/student.entity';
import { StudentsService } from './students.service';

const ROUNDS_TO_CATCH_A_LOST_RACE = 5;
const SAVES_AT_ONCE = 20;
const YOUNG_BIRTH_DATE = new Date().toISOString().slice(0, 10);
const SAVED_PROFILE: Omit<SaveStudentProfileBodyDto, 'name'> = {
  interests: ['basketball', 'space'],
  level: 'university',
  goal: 'exam',
};
const PROFILE: SaveStudentProfileBodyDto = { ...SAVED_PROFILE, name: 'Maya' };

describe('StudentsService', () => {
  let testApp: TestApp;
  let studentsService: StudentsService;

  beforeAll(async () => {
    testApp = await createTestApp();
    studentsService = testApp.app.get(StudentsService);
  });

  afterAll(() => testApp?.close());

  async function createStudent() {
    const authUserId = randomUUID();
    const { student } = await studentsService.answerBirthDate(authUserId, { birthDate: OLD_ENOUGH_BIRTH_DATE });
    return { authUserId, id: student?.id as string };
  }

  async function readProfile(authUserId: string) {
    return (await studentsService.getAccount(authUserId)).student?.profile;
  }

  it('saves a profile with its interests and reads the profile back', async () => {
    const { authUserId, id } = await createStudent();

    await studentsService.saveProfile(id, PROFILE);

    expect(await readProfile(authUserId)).toEqual(SAVED_PROFILE);
  });

  it('keeps an empty interest list, because a student can choose none', async () => {
    const { authUserId, id } = await createStudent();

    await studentsService.saveProfile(id, { ...PROFILE, interests: [] });

    expect((await readProfile(authUserId))?.interests).toEqual([]);
  });

  it('replaces the earlier profile when a student saves again', async () => {
    const { authUserId, id } = await createStudent();
    await studentsService.saveProfile(id, PROFILE);

    const changedProfile: typeof SAVED_PROFILE = { ...SAVED_PROFILE, interests: ['music'], goal: 'curiosity' };
    await studentsService.saveProfile(id, { ...changedProfile, name: 'Maya' });

    expect(await readProfile(authUserId)).toEqual(changedProfile);
  });

  it.each(Array.from({ length: ROUNDS_TO_CATCH_A_LOST_RACE }, (_unused, round) => round + 1))(
    'saves one profile when many saves arrive together, round %i',
    async () => {
      const { authUserId, id } = await createStudent();

      await Promise.all(
        Array.from({ length: SAVES_AT_ONCE }, () => studentsService.saveProfile(id, PROFILE)),
      );

      expect(await readProfile(authUserId)).toEqual(SAVED_PROFILE);
    },
  );

  it('stores the birth date of a student who may stay', async () => {
    const { authUserId } = await createStudent();

    const stored = await testApp.app.get(DataSource).getRepository(StudentEntity).findOneByOrFail({ authUserId });

    expect(stored.birthDate).toBe(OLD_ENOUGH_BIRTH_DATE);
  });

  it('stores only the user ID and the time for a closed account, and no student', async () => {
    const authUserId = randomUUID();

    await studentsService.answerBirthDate(authUserId, { birthDate: YOUNG_BIRTH_DATE });

    const dataSource = testApp.app.get(DataSource);
    const [storedRow] = await dataSource.query('SELECT * FROM "closed_accounts" WHERE "auth_user_id" = $1', [authUserId]);
    expect(Object.keys(storedRow).sort()).toEqual(['auth_user_id', 'closed_at']);
    expect(await dataSource.getRepository(StudentEntity).countBy({ authUserId })).toBe(0);
  });

  it('saves a profile for the student from the token, whatever the body says', async () => {
    const { authUserId, id } = await createStudent();
    const other = await createStudent();

    await studentsService.saveProfile(id, { ...PROFILE, studentId: other.id } as SaveStudentProfileBodyDto);

    expect(await readProfile(authUserId)).toEqual(SAVED_PROFILE);
    expect(await readProfile(other.authUserId)).toBeNull();
  });

  it('finds a student with one query, because every student route runs this first', async () => {
    const { authUserId } = await createStudent();
    const logQuery = jest.spyOn(testApp.app.get(DataSource).logger, 'logQuery');

    await studentsService.findStudentId(authUserId);

    expect(logQuery).toHaveBeenCalledTimes(1);
    logQuery.mockRestore();
  });

  it('finds no student once the account of an active student is closed', async () => {
    const { authUserId, id } = await createStudent();
    expect(await studentsService.findStudentId(authUserId)).toBe(id);

    await testApp.app.get(DataSource).getRepository(ClosedAccountEntity).insert({ authUserId });

    expect(await studentsService.findStudentId(authUserId)).toBeNull();
    expect(await studentsService.getAccount(authUserId)).toEqual({ status: 'closed', student: null });
  });

  it('finds no student for an unknown user, and the student for a known one', async () => {
    const { authUserId, id } = await createStudent();

    expect(await studentsService.findStudentId(randomUUID())).toBeNull();
    expect(await studentsService.findStudentId(authUserId)).toBe(id);
  });
});
