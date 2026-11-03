import { NotFoundException } from '@nestjs/common';
import { createTestApp } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import type { SaveStudentProfileBodyDto } from './student-profile.dto';
import { StudentsService } from './students.service';

const UNKNOWN_STUDENT_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';
const ROUNDS_TO_CATCH_A_LOST_RACE = 5;
const SAVES_AT_ONCE = 20;
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

  it('saves a student and reads the student back', async () => {
    const created = await studentsService.createStudent({ name: 'Adaeze Ọkàfọ́r' });

    expect(await studentsService.getStudent(created.id)).toEqual({
      id: created.id,
      name: 'Adaeze Ọkàfọ́r',
      profile: null,
    });
  });

  it('saves a profile with its interests and reads the profile back', async () => {
    const { id } = await studentsService.createStudent({ name: 'Maya' });

    await studentsService.saveProfile(id, PROFILE);

    expect((await studentsService.getStudent(id)).profile).toEqual(PROFILE);
  });

  it('keeps an empty interest list, because onboarding lets a student skip it', async () => {
    const { id } = await studentsService.createStudent({ name: 'Maya' });

    await studentsService.saveProfile(id, { ...PROFILE, interests: [] });

    expect((await studentsService.getStudent(id)).profile?.interests).toEqual([]);
  });

  it('replaces the earlier profile when a student saves again', async () => {
    const { id } = await studentsService.createStudent({ name: 'Maya' });
    await studentsService.saveProfile(id, PROFILE);

    const changedProfile: SaveStudentProfileBodyDto = {
      ...PROFILE,
      interests: ['Music'],
      voice: 'noor',
    };
    await studentsService.saveProfile(id, changedProfile);

    expect((await studentsService.getStudent(id)).profile).toEqual(changedProfile);
  });

  it.each(Array.from({ length: ROUNDS_TO_CATCH_A_LOST_RACE }, (_unused, round) => round + 1))(
    'saves one profile when many saves arrive together, round %i',
    async () => {
      const { id } = await studentsService.createStudent({ name: 'Maya' });

      await Promise.all(
        Array.from({ length: SAVES_AT_ONCE }, () => studentsService.saveProfile(id, PROFILE)),
      );

      expect((await studentsService.getStudent(id)).profile).toEqual(PROFILE);
    },
  );

  it('reports a student that does not exist', async () => {
    await expect(studentsService.getStudent(UNKNOWN_STUDENT_ID)).rejects.toThrow(NotFoundException);
    await expect(studentsService.saveProfile(UNKNOWN_STUDENT_ID, PROFILE)).rejects.toThrow(
      NotFoundException,
    );
  });
});
