import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import {
  EXAMPLE_AUTH_USER_ID,
  EXAMPLE_STUDENT_ID,
  SECOND_STUDENT_AUTH_USER_ID,
  replaceExampleData,
} from '../infrastructure/orm/example-data';
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
    expect(body.picks.length).toBeGreaterThan(0);
    for (const pick of body.picks) {
      expect(Object.keys(pick).sort()).toEqual([
        'artwork',
        'id',
        'lengthMinutes',
        'openingLine',
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

  it('picks six cards that fit each student, with a reason that names what they said', async () => {
    const secondToken = await testApp.supabaseAuth.signToken(SECOND_STUDENT_AUTH_USER_ID);

    const { body: mayaHome } = await getHome().expect(200);
    const { body: secondHome } = await getHomeWithToken(secondToken).expect(200);

    const getReasons = (home: { picks: { reason: string }[] }) => home.picks.map((pick) => pick.reason);
    expect(mayaHome.picks).toHaveLength(6);
    expect(secondHome.picks).toHaveLength(6);
    expect(getReasons(mayaHome)).toEqual(expect.arrayContaining(["Because you're into basketball", "Because you're into space"]));
    expect(getReasons(secondHome)).toEqual(expect.arrayContaining(["Because you're into cooking", "Because you're into music"]));
    const secondTitles = secondHome.picks.map((pick: { title: string }) => pick.title);
    expect(mayaHome.picks.filter((pick: { title: string }) => secondTitles.includes(pick.title))).toEqual([]);
  });

  it('gives a student with no profile six cards with an honest reason', async () => {
    const newStudent = await createTestStudent(testApp);

    const { body } = await getHomeWithToken(newStudent.token).expect(200);

    expect(body.picks).toHaveLength(6);
    expect(new Set(body.picks.map((pick: { reason: string }) => pick.reason))).toEqual(new Set(['A good place to start']));
  });

  it('refuses a request with no token', async () => {
    await request(testApp.app.getHttpServer()).get('/home').expect(401);
  });

  it('refuses a signed-in user who has no student yet', async () => {
    await getHomeWithToken(await testApp.supabaseAuth.signToken(randomUUID())).expect(403);
  });
});
