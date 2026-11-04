import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { StudentsService } from '../students/students.service';
import type { CreateSessionBodyDto } from './session.dto';
import { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { SessionsService } from './sessions.service';

const SESSION: CreateSessionBodyDto = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

describe('SessionsService', () => {
  let testApp: TestApp;
  let sessionsService: SessionsService;
  let studentsService: StudentsService;

  beforeAll(async () => {
    testApp = await createTestApp();
    sessionsService = testApp.app.get(SessionsService);
    studentsService = testApp.app.get(StudentsService);
  });

  afterAll(() => testApp?.close());

  async function createStudentId() {
    const { student } = await studentsService.answerBirthDate(randomUUID(), OLD_ENOUGH_BIRTH_DATE);
    return student?.id as string;
  }

  function listTen(studentId: string) {
    return sessionsService.listSessions(studentId, { limit: 10, offset: 0 });
  }

  function moveSessionStart(sessionId: string, startedAt: string) {
    return testApp.app
      .get(DataSource)
      .getRepository(SessionEntity)
      .update(sessionId, { startedAt: new Date(startedAt) });
  }

  it('saves a session with its language and reads the session back', async () => {
    const studentId = await createStudentId();

    const created = await sessionsService.createSession(studentId, SESSION);

    expect(await listTen(studentId)).toEqual([created]);
    expect(created).toMatchObject({
      ...SESSION,
      status: 'in_progress',
      durationSeconds: 0,
      detail: null,
      artwork: null,
    });
    expect(created.startedAt).toBeInstanceOf(Date);
  });

  it('gives a new session to the student from the token, whatever the body says', async () => {
    const studentId = await createStudentId();
    const otherStudentId = await createStudentId();

    await sessionsService.createSession(studentId, { ...SESSION, studentId: otherStudentId } as CreateSessionBodyDto);

    expect(await listTen(studentId)).toHaveLength(1);
    expect(await listTen(otherStudentId)).toEqual([]);
  });

  it('lists sessions newest first, up to the limit', async () => {
    const studentId = await createStudentId();
    const oldest = await sessionsService.createSession(studentId, { ...SESSION, title: 'oldest' });
    const newest = await sessionsService.createSession(studentId, { ...SESSION, title: 'newest' });
    const middle = await sessionsService.createSession(studentId, { ...SESSION, title: 'middle' });
    await moveSessionStart(oldest.id, '2026-10-01T12:00:00Z');
    await moveSessionStart(middle.id, '2026-10-02T12:00:00Z');
    await moveSessionStart(newest.id, '2026-10-03T12:00:00Z');

    const sessions = await sessionsService.listSessions(studentId, { limit: 2, offset: 0 });

    expect(sessions.map((session) => session.title)).toEqual(['newest', 'middle']);
  });

  it('lists only the sessions of the given student', async () => {
    const studentId = await createStudentId();
    await sessionsService.createSession(await createStudentId(), SESSION);

    expect(await listTen(studentId)).toEqual([]);
  });
});
