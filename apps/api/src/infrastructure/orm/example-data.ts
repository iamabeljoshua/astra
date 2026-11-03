import { In } from 'typeorm';
import type { DataSource, DeepPartial } from 'typeorm';
import type { SessionLanguage } from '../../sessions/session-options';
import { SessionEntity } from './entities/session.entity';
import { StudentProfileEntity } from './entities/student-profile.entity';
import { ClosedAccountEntity } from './entities/closed-account.entity';
import { StudentEntity } from './entities/student.entity';

export const EXAMPLE_STUDENT_ID = '00000000-0000-4000-8000-000000000001';

export const EXAMPLE_AUTH_USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const NEW_STUDENT_AUTH_USER_ID = '00000000-0000-4000-8000-0000000000a2';
const LOCAL_AUTH_USER_IDS = [EXAMPLE_AUTH_USER_ID, NEW_STUDENT_AUTH_USER_ID];

const EXAMPLE_SESSION_LANGUAGE: SessionLanguage = 'en';

const EXAMPLE_STUDENT: Partial<StudentEntity> = {
  id: EXAMPLE_STUDENT_ID,
  authUserId: EXAMPLE_AUTH_USER_ID,
  name: 'Maya',
  birthDate: '2004-03-14',
};

const EXAMPLE_PROFILE: Partial<StudentProfileEntity> = {
  studentId: EXAMPLE_STUDENT_ID,
  interests: ['Basketball', 'Space'],
  level: 'university',
  goal: 'exam',
  voice: 'ada',
};

function atNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

const EXAMPLE_SESSIONS: DeepPartial<SessionEntity>[] = [
  {
    title: 'Free-body diagrams',
    subject: 'Physics',
    startedAt: atNoon('2026-10-31'),
    durationSeconds: 252,
    status: 'in_progress',
    detail: 'Next up: friction on a slope. Concept 2 of 5.',
    artwork: 'forces',
  },
  {
    title: 'Why the sky is dark at night',
    subject: 'Astronomy',
    startedAt: atNoon('2026-10-29'),
    durationSeconds: 1120,
    status: 'finished',
    artwork: 'saturn',
  },
  {
    title: 'Solving quadratic equations',
    subject: 'Math',
    startedAt: atNoon('2026-10-28'),
    durationSeconds: 1565,
    status: 'finished',
    artwork: 'growth',
  },
  {
    title: 'Balancing chemical equations',
    subject: 'Chemistry',
    startedAt: atNoon('2026-10-26'),
    durationSeconds: 1277,
    status: 'finished',
    artwork: 'helix',
  },
  {
    title: 'How compound interest grows',
    subject: 'Math',
    startedAt: atNoon('2026-10-24'),
    durationSeconds: 753,
    status: 'finished',
    artwork: 'growth',
  },
  {
    title: 'The causes of the French Revolution',
    subject: 'History',
    startedAt: atNoon('2026-10-22'),
    durationSeconds: 1862,
    status: 'finished',
    artwork: 'athens',
  },
];

export async function replaceExampleData(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.delete(StudentEntity, { authUserId: In(LOCAL_AUTH_USER_IDS) });
    await manager.delete(ClosedAccountEntity, { authUserId: In(LOCAL_AUTH_USER_IDS) });
    await manager.save(StudentEntity, EXAMPLE_STUDENT);
    await manager.save(StudentProfileEntity, EXAMPLE_PROFILE);
    await manager.save(
      SessionEntity,
      EXAMPLE_SESSIONS.map((session) => ({
        ...session,
        studentId: EXAMPLE_STUDENT_ID,
        language: EXAMPLE_SESSION_LANGUAGE,
      })),
    );
  });
}
