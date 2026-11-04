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

interface PickCard {
  id: string;
}

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

    expect(Object.keys(body).sort()).toEqual(['continueSession', 'isNewStudent', 'picks', 'studentName']);
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
        'continueSessionId',
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

  it('calls a student with sessions a returning one', async () => {
    const { body } = await getHome().expect(200);

    expect(body.isNewStudent).toBe(false);
  });

  it('picks from what a new student chose, and calls them new until they start a session', async () => {
    const student = await createTestStudent(testApp);
    const profile = { name: 'Tolu', interests: ['space'], level: 'university', goal: 'class' };
    await request(testApp.app.getHttpServer()).put('/me/profile').set('Authorization', `Bearer ${student.token}`).send(profile).expect(200);

    const { body: firstVisit } = await getHomeWithToken(student.token).expect(200);
    const firstReasons = firstVisit.picks.map((pick: { reason: string }) => pick.reason);
    expect(firstVisit).toMatchObject({ studentName: 'Tolu', isNewStudent: true });
    expect(firstVisit.picks).toHaveLength(6);
    expect(firstReasons).toContain("Because you're into space");
    expect(firstReasons).not.toContain('A good place to start');

    await saveUnfinishedSession(student.studentId, 'Why is the sky blue?', '2026-11-01T12:00:00Z');

    const { body: afterASession } = await getHomeWithToken(student.token).expect(200);
    expect(afterASession.isNewStudent).toBe(false);
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

    expect(body.isNewStudent).toBe(true);
    expect(body.picks).toHaveLength(6);
    expect(new Set(body.picks.map((pick: { reason: string }) => pick.reason))).toEqual(new Set(['A good place to start']));
  });

  describe('after sessions on topics from the library', () => {
    const CARRY_ON_REASON = 'Carry on where you left off';

    function getPick(home: { picks: PickCard[] }, id: string) {
      return home.picks.find((pick) => pick.id === id);
    }

    function saveTopicSession(studentId: string, session: { topicId: string; startedAt: string; durationSeconds?: number; status?: 'finished' }) {
      return sessions().save({
        studentId,
        title: session.topicId,
        subject: 'Physics',
        language: 'en',
        ...session,
        startedAt: new Date(session.startedAt),
      });
    }

    it('drops a finished topic, suggests the next one, and offers an older open topic that reopens its session', async () => {
      const student = await createTestStudent(testApp);
      await saveTopicSession(student.studentId, { topicId: 'jump-shot', startedAt: '2026-11-01T10:00:00Z', durationSeconds: 720, status: 'finished' });
      const olderOpen = await saveTopicSession(student.studentId, { topicId: 'saturn-rings', startedAt: '2026-11-01T11:00:00Z' });
      const newestOpen = await saveTopicSession(student.studentId, { topicId: 'game-worlds', startedAt: '2026-11-01T12:00:00Z' });

      const { body } = await getHomeWithToken(student.token).expect(200);

      expect(getPick(body, 'jump-shot')).toBeUndefined();
      expect(body.continueSession.id).toBe(newestOpen.id);
      expect(getPick(body, 'game-worlds')).toBeUndefined();
      expect(getPick(body, 'saturn-rings')).toMatchObject({ reason: CARRY_ON_REASON, continueSessionId: olderOpen.id });
      expect(body.picks).toHaveLength(6);
    });

    it('suggests the next topic with a reason that names the finished one', async () => {
      const student = await createTestStudent(testApp);
      await saveTopicSession(student.studentId, { topicId: 'seasons', startedAt: '2026-11-01T10:00:00Z', durationSeconds: 300, status: 'finished' });

      const { body } = await getHomeWithToken(student.token).expect(200);

      expect(body.picks[0]).toMatchObject({ id: 'saturn-rings', reason: 'You finished What really causes the seasons' });
    });

    it('leaves the cards alone for a session ended after a few seconds', async () => {
      const student = await createTestStudent(testApp);
      const { body: homeBefore } = await getHomeWithToken(student.token).expect(200);
      await saveTopicSession(student.studentId, { topicId: 'jump-shot', startedAt: '2026-11-01T10:00:00Z', durationSeconds: 5, status: 'finished' });

      const { body: homeAfter } = await getHomeWithToken(student.token).expect(200);

      expect(homeAfter.picks).toEqual(homeBefore.picks);
    });

    it('takes no card from a typed question, even one worded like a topic', async () => {
      const student = await createTestStudent(testApp);
      const { body: homeBefore } = await getHomeWithToken(student.token).expect(200);
      await sessions().save({ studentId: student.studentId, title: 'How a jump shot flies', subject: 'Your question', language: 'en', status: 'finished', durationSeconds: 720 });

      const { body: homeAfter } = await getHomeWithToken(student.token).expect(200);

      expect(homeAfter.picks).toEqual(homeBefore.picks);
    });
  });

  it('refuses a request with no token', async () => {
    await request(testApp.app.getHttpServer()).get('/home').expect(401);
  });

  it('refuses a signed-in user who has no student yet', async () => {
    await getHomeWithToken(await testApp.supabaseAuth.signToken(randomUUID())).expect(403);
  });
});
