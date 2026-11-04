import { In } from 'typeorm';
import type { DataSource, DeepPartial } from 'typeorm';
import type { SessionLanguage } from '../../sessions/session-options';
import { LearnerNoteEntity } from './entities/learner-note.entity';
import { SessionLogEventEntity } from './entities/session-log-event.entity';
import { SessionEntity } from './entities/session.entity';
import { EXAMPLE_RECAP, EXAMPLE_REPLAY_EVENTS, EXAMPLE_REPLAY_SESSION_TITLE } from './example-replay';
import { StudentProfileEntity } from './entities/student-profile.entity';
import { ClosedAccountEntity } from './entities/closed-account.entity';
import { StudentDailySpendEntity } from './entities/student-daily-spend.entity';
import { StudentEntity } from './entities/student.entity';

export const EXAMPLE_STUDENT_ID = '00000000-0000-4000-8000-000000000001';

export const EXAMPLE_AUTH_USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const NEW_STUDENT_AUTH_USER_ID = '00000000-0000-4000-8000-0000000000a2';
export const SECOND_STUDENT_AUTH_USER_ID = '00000000-0000-4000-8000-0000000000a3';
const LOCAL_AUTH_USER_IDS = [EXAMPLE_AUTH_USER_ID, NEW_STUDENT_AUTH_USER_ID, SECOND_STUDENT_AUTH_USER_ID];

const EXAMPLE_SESSION_LANGUAGE: SessionLanguage = 'en';

const EXAMPLE_STUDENT: Partial<StudentEntity> = {
  id: EXAMPLE_STUDENT_ID,
  authUserId: EXAMPLE_AUTH_USER_ID,
  name: 'Maya',
  birthDate: '2004-03-14',
};

const EXAMPLE_PROFILE: Partial<StudentProfileEntity> = {
  studentId: EXAMPLE_STUDENT_ID,
  interests: ['basketball', 'space'],
  level: 'university',
  goal: 'exam',
};

const SECOND_STUDENT_ID = '00000000-0000-4000-8000-000000000002';

const SECOND_STUDENT: Partial<StudentEntity> = {
  id: SECOND_STUDENT_ID,
  authUserId: SECOND_STUDENT_AUTH_USER_ID,
  name: 'Tola',
  birthDate: '2008-05-20',
};

const SECOND_PROFILE: Partial<StudentProfileEntity> = {
  studentId: SECOND_STUDENT_ID,
  interests: ['cooking', 'music'],
  level: 'high_school',
  goal: 'class',
};

const EXAMPLE_SPEND: Partial<StudentDailySpendEntity> = {
  studentId: EXAMPLE_STUDENT_ID,
  spentOn: '2026-10-31',
  spentMicroUsd: '120000',
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

// Two kinds of evidence on real example sessions, so Home and the tutor have something to read after a seed.
function getExampleNotes([freeBody, sky, quadratics, , compoundInterest]: SessionEntity[]): Partial<LearnerNoteEntity>[] {
  const forSession = (session: SessionEntity | undefined) => ({ studentId: EXAMPLE_STUDENT_ID, sessionId: session?.id, notedAt: session?.startedAt });
  return [
    {
      ...forSession(freeBody),
      kind: 'struggled',
      topic: 'free-body diagrams',
      topicKey: 'free body diagrams',
      detail: 'Friction on a slope',
      evidence: [{ source: 'words', text: '', check: null }],
    },
    {
      ...forSession(sky),
      kind: 'explored',
      topic: 'why the sky is dark at night',
      topicKey: 'why the sky is dark at night',
      detail: null,
      evidence: [{ source: 'words', text: '', check: null }],
    },
    {
      ...forSession(quadratics),
      kind: 'showed',
      topic: 'solving quadratic equations',
      topicKey: 'solving quadratic equations',
      detail: null,
      evidence: [{ source: 'board', text: 'x^2 - 5x + 6 = 0 becomes (x - 2)(x - 3) = 0', check: 'right' }],
    },
    {
      ...forSession(compoundInterest),
      kind: 'struggled',
      topic: 'compound interest',
      topicKey: 'compound interest',
      detail: 'Added the interest once instead of each time',
      evidence: [{ source: 'words', text: '', check: null }],
    },
  ];
}

export async function replaceExampleData(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.delete(StudentEntity, { authUserId: In(LOCAL_AUTH_USER_IDS) });
    await manager.delete(ClosedAccountEntity, { authUserId: In(LOCAL_AUTH_USER_IDS) });
    await manager.save(StudentEntity, [EXAMPLE_STUDENT, SECOND_STUDENT]);
    await manager.save(StudentProfileEntity, [EXAMPLE_PROFILE, SECOND_PROFILE]);
    await manager.save(StudentDailySpendEntity, EXAMPLE_SPEND);
    const sessions = await manager.save(
      SessionEntity,
      EXAMPLE_SESSIONS.map((session) => ({
        ...session,
        studentId: EXAMPLE_STUDENT_ID,
        language: EXAMPLE_SESSION_LANGUAGE,
        ...(session.title === EXAMPLE_REPLAY_SESSION_TITLE ? { recap: EXAMPLE_RECAP } : {}),
      })),
    );
    const replayed = sessions.find(({ title }) => title === EXAMPLE_REPLAY_SESSION_TITLE);
    if (replayed) {
      const run = { sessionId: replayed.id, runId: '00000000-0000-4000-8000-0000000000b1', runStartedAt: atNoon('2026-10-28') };
      await manager.insert(SessionLogEventEntity, EXAMPLE_REPLAY_EVENTS.map((event, seq) => ({ ...run, seq, event })));
    }
    await manager.save(LearnerNoteEntity, getExampleNotes(sessions));
  });
}
