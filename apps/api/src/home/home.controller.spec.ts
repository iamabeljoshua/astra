import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { EXAMPLE_STUDENT_ID, replaceExampleData } from '../database/example-data';
import { SessionEntity } from '../sessions/session.entity';
import { StudentEntity } from '../students/student.entity';

const OTHER_STUDENT_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';
const SEEDED_UNFINISHED_TITLE = 'Free-body diagrams';

describe('GET /home', () => {
  let testApp: TestApp;

  function getHome() {
    return request(testApp.app.getHttpServer()).get('/home');
  }

  function sessions() {
    return testApp.app.get(DataSource).getRepository(SessionEntity);
  }

  function saveUnfinishedSession(studentId: string, title: string, startedAt: string) {
    return sessions().save({
      studentId,
      title,
      subject: 'Physics',
      language: 'en',
      startedAt: new Date(startedAt),
    });
  }

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(() => replaceExampleData(testApp.app.get(DataSource)));

  afterAll(() => testApp?.close());

  it('sends the screen in the documented shape', async () => {
    const { body } = await getHome().expect(200);

    expect(Object.keys(body).sort()).toEqual(['continueSession', 'picks', 'studentName']);
    expect(Object.keys(body.continueSession).sort()).toEqual([
      'artwork',
      'detail',
      'durationSeconds',
      'id',
      'language',
      'startedAt',
      'status',
      'subject',
      'title',
    ]);
    for (const pick of body.picks) {
      expect(Object.keys(pick).sort()).toEqual([
        'artwork',
        'id',
        'lengthMinutes',
        'reason',
        'subject',
        'title',
      ]);
    }
  });

  it('greets the seeded student by name', async () => {
    const { body } = await getHome().expect(200);

    expect(body.studentName).toBe('Maya');
  });

  it('offers the unfinished session with a drawing to show', async () => {
    const { body } = await getHome().expect(200);

    expect(body.continueSession).toMatchObject({
      title: SEEDED_UNFINISHED_TITLE,
      status: 'in_progress',
      detail: 'Next up: friction on a slope. Concept 2 of 5.',
      artwork: 'forces',
    });
  });

  it('offers the newest of two unfinished sessions', async () => {
    await saveUnfinishedSession(EXAMPLE_STUDENT_ID, 'Newest', '2026-11-01T12:00:00Z');
    await saveUnfinishedSession(EXAMPLE_STUDENT_ID, 'Oldest', '2020-01-01T12:00:00Z');

    const { body } = await getHome().expect(200);

    expect(body.continueSession.title).toBe('Newest');
  });

  it('offers no session when every session has finished', async () => {
    await sessions().update({ studentId: EXAMPLE_STUDENT_ID }, { status: 'finished' });

    const { body } = await getHome().expect(200);

    expect(body.continueSession).toBeNull();
  });

  it("does not offer another student's session", async () => {
    await testApp.app.get(DataSource).getRepository(StudentEntity).save({ id: OTHER_STUDENT_ID, name: 'Ada' });
    await saveUnfinishedSession(OTHER_STUDENT_ID, 'Not for Maya', '2026-11-02T12:00:00Z');

    const { body } = await getHome().expect(200);

    expect(body.continueSession.title).toBe(SEEDED_UNFINISHED_TITLE);
  });

  it('states a reason on all six cards', async () => {
    const { body } = await getHome().expect(200);

    expect(body.picks).toHaveLength(6);
    for (const pick of body.picks) {
      expect(pick.reason).toEqual(expect.any(String));
      expect(pick.reason).not.toBe('');
    }
  });

  it('answers 404 when the current student does not exist', async () => {
    await testApp.app.get(DataSource).getRepository(StudentEntity).delete({ id: EXAMPLE_STUDENT_ID });

    await getHome().expect(404);
  });
});
