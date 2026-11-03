import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { ClosedAccountEntity } from './closed-account.entity';
import type { SaveStudentProfileBodyDto } from './student-profile.dto';
import { StudentEntity } from './student.entity';
import { StudentsService } from './students.service';

const ROUNDS_TO_CATCH_A_LOST_RACE = 5;
const SAVES_AT_ONCE = 20;
const YOUNG_BIRTH_DATE = new Date().toISOString().slice(0, 10);
const PROFILE: SaveStudentProfileBodyDto = {
  interests: ['Basketball', 'Space'],
  level: 'university',
  goal: 'exam',
  voice: 'ada',
};

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
    const { student } = await studentsService.answerBirthDate(authUserId, OLD_ENOUGH_BIRTH_DATE);
    return { authUserId, id: student?.id as string };
  }

  async function readProfile(authUserId: string) {
    return (await studentsService.getAccount(authUserId)).student?.profile;
  }

  it('saves a profile with its interests and reads the profile back', async () => {
    const { authUserId, id } = await createStudent();

    await studentsService.saveProfile(id, PROFILE);

    expect(await readProfile(authUserId)).toEqual(PROFILE);
  });

  it('keeps an empty interest list, because onboarding lets a student skip it', async () => {
    const { authUserId, id } = await createStudent();

    await studentsService.saveProfile(id, { ...PROFILE, interests: [] });

    expect((await readProfile(authUserId))?.interests).toEqual([]);
  });

  it('replaces the earlier profile when a student saves again', async () => {
    const { authUserId, id } = await createStudent();
    await studentsService.saveProfile(id, PROFILE);

    const changedProfile: SaveStudentProfileBodyDto = {
      ...PROFILE,
      interests: ['Music'],
      voice: 'noor',
    };
    await studentsService.saveProfile(id, changedProfile);

    expect(await readProfile(authUserId)).toEqual(changedProfile);
  });

  it.each(Array.from({ length: ROUNDS_TO_CATCH_A_LOST_RACE }, (_unused, round) => round + 1))(
    'saves one profile when many saves arrive together, round %i',
    async () => {
      const { authUserId, id } = await createStudent();

      await Promise.all(
        Array.from({ length: SAVES_AT_ONCE }, () => studentsService.saveProfile(id, PROFILE)),
      );

      expect(await readProfile(authUserId)).toEqual(PROFILE);
    },
  );

  it('stores the birth date of a student who may stay', async () => {
    const { authUserId } = await createStudent();

    const stored = await testApp.app.get(DataSource).getRepository(StudentEntity).findOneByOrFail({ authUserId });

    expect(stored.birthDate).toBe(OLD_ENOUGH_BIRTH_DATE);
  });

  it('stores only the user ID and the time for a closed account, and no student', async () => {
    const authUserId = randomUUID();

    await studentsService.answerBirthDate(authUserId, YOUNG_BIRTH_DATE);

    const dataSource = testApp.app.get(DataSource);
    const [closedAccount] = await dataSource.getRepository(ClosedAccountEntity).findBy({ authUserId });
    expect(Object.keys(closedAccount ?? {}).sort()).toEqual(['authUserId', 'closedAt']);
    expect(await dataSource.getRepository(StudentEntity).countBy({ authUserId })).toBe(0);
  });

  it('finds no student for an unknown user, and the student for a known one', async () => {
    const { authUserId, id } = await createStudent();

    expect(await studentsService.findStudentId(randomUUID())).toBeNull();
    expect(await studentsService.findStudentId(authUserId)).toBe(id);
  });
});
