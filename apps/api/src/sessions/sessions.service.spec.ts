import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { StudentsService } from '../students/students.service';
import type { CreateSessionBodyDto } from './session.dto';
import { SessionEntity } from './session.entity';
import { SessionsService } from './sessions.service';

const UNKNOWN_STUDENT_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';
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
    return (await studentsService.createStudent({ name: 'Maya' })).id;
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

    expect(await sessionsService.listSessions(studentId, 10)).toEqual([created]);
    expect(created).toMatchObject({
      ...SESSION,
      status: 'in_progress',
      durationSeconds: 0,
      detail: null,
      artwork: null,
    });
    expect(created.startedAt).toBeInstanceOf(Date);
  });

  it('lists sessions newest first, up to the limit', async () => {
    const studentId = await createStudentId();
    const oldest = await sessionsService.createSession(studentId, { ...SESSION, title: 'oldest' });
    const newest = await sessionsService.createSession(studentId, { ...SESSION, title: 'newest' });
    const middle = await sessionsService.createSession(studentId, { ...SESSION, title: 'middle' });
    await moveSessionStart(oldest.id, '2026-10-01T12:00:00Z');
    await moveSessionStart(middle.id, '2026-10-02T12:00:00Z');
    await moveSessionStart(newest.id, '2026-10-03T12:00:00Z');

    const sessions = await sessionsService.listSessions(studentId, 2);

    expect(sessions.map((session) => session.title)).toEqual(['newest', 'middle']);
  });

  it('lists only the sessions of the given student', async () => {
    const studentId = await createStudentId();
    await sessionsService.createSession(await createStudentId(), SESSION);

    expect(await sessionsService.listSessions(studentId, 10)).toEqual([]);
  });

  it('reports a student that does not exist', async () => {
    await expect(sessionsService.createSession(UNKNOWN_STUDENT_ID, SESSION)).rejects.toThrow(
      NotFoundException,
    );
    await expect(sessionsService.listSessions(UNKNOWN_STUDENT_ID, 10)).rejects.toThrow(
      NotFoundException,
    );
  });
});
