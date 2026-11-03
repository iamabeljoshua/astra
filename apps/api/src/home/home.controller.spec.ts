import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { EXAMPLE_AUTH_USER_ID, EXAMPLE_STUDENT_ID, replaceExampleData } from '../infrastructure/orm/example-data';
import { SessionEntity } from '../infrastructure/orm/entities/session.entity';

const SEEDED_UNFINISHED_TITLE = 'Free-body diagrams';

describe('GET /home', () => {
  let testApp: TestApp;
  let mayaToken: string;

  function getHomeWithToken(token: string) {
    return request(testApp.app.getHttpServer()).get('/home').set('Authorization', `Bearer ${token}`);
  }

  function getHome() {
    return getHomeWithToken(mayaToken);
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
    mayaToken = await testApp.supabaseAuth.signToken(EXAMPLE_AUTH_USER_ID);
  });

  beforeEach(() => replaceExampleData(testApp.app.get(DataSource)));

  afterAll(() => testApp?.close());

  it('sends the screen in the documented shape', async () => {
    const { body } = await getHome().expect(200);

    expect(Object.keys(body).sort()).toEqual(['continueSession', 'isNewStudent', 'picks', 'startHereQuestion', 'studentName']);
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
    expect(body.picks.length).toBeGreaterThan(0);
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

  it('calls a student with sessions a returning one, and offers no start here card', async () => {
    const { body } = await getHome().expect(200);

    expect(body.isNewStudent).toBe(false);
    expect(body.startHereQuestion).toBeNull();
  });

  it('offers a new student their first answer until they start a session', async () => {
    const student = await createTestStudent(testApp);
    const profile = { name: 'Tolu', interests: [], level: 'university', goal: 'class', voice: 'kofi', firstQuestion: 'Why is the sky blue?' };
    await request(testApp.app.getHttpServer()).put('/me/profile').set('Authorization', `Bearer ${student.token}`).send(profile).expect(200);

    const { body: firstVisit } = await getHomeWithToken(student.token).expect(200);
    expect(firstVisit).toMatchObject({ studentName: 'Tolu', isNewStudent: true, startHereQuestion: 'Why is the sky blue?' });

    await saveUnfinishedSession(student.studentId, 'Why is the sky blue?', '2026-11-01T12:00:00Z');

    const { body: afterASession } = await getHomeWithToken(student.token).expect(200);
    expect(afterASession).toMatchObject({ isNewStudent: false, startHereQuestion: null });
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

  it('shows each student their own home, whatever the example data holds', async () => {
    const newStudent = await createTestStudent(testApp);
    const returningStudent = await createTestStudent(testApp);
    await saveUnfinishedSession(returningStudent.studentId, 'Only for this student', '2026-11-02T12:00:00Z');

    const { body: newHome } = await getHomeWithToken(newStudent.token).expect(200);
    const { body: returningHome } = await getHomeWithToken(returningStudent.token).expect(200);
    const { body: mayaHome } = await getHome().expect(200);

    expect(newHome).toMatchObject({ studentName: null, continueSession: null });
    expect(returningHome).toMatchObject({ studentName: null, continueSession: { title: 'Only for this student' } });
    expect(mayaHome).toMatchObject({ studentName: 'Maya', continueSession: { title: SEEDED_UNFINISHED_TITLE } });
  });

  it('refuses a request with no token', async () => {
    await request(testApp.app.getHttpServer()).get('/home').expect(401);
  });

  it('refuses a signed-in user who has no student yet', async () => {
    await getHomeWithToken(await testApp.supabaseAuth.signToken(randomUUID())).expect(403);
  });
});
