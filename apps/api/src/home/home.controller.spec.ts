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
import { LearnerNoteEntity } from '../infrastructure/orm/entities/learner-note.entity';
import { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { LearnerRecordService } from '../learner-record/learner-record.service';
import { getStruggleReason } from '../picks/pick-reasons';
import { SessionsService } from '../sessions/sessions.service';

const SEEDED_UNFINISHED_TITLE = 'Free-body diagrams';

interface PickCard {
  id: string;
  title: string;
  subject: string;
  reason: string;
  continueSessionId: string | null;
  reasonDate: string | null;
  topicId: string | null;
}

const FREE_BODY_STRUGGLE = {
  kind: 'struggled' as const,
  topic: 'free-body forces',
  detail: null,
  evidence: [{ source: 'words' as const, text: '', check: null }],
};

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
        'reasonDate',
        'subject',
        'title',
        'topicId',
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

    it('gives the continue card to an open typed question, and offers the lesson it displaced as a carry-on card', async () => {
      const student = await createTestStudent(testApp);
      const openLesson = await saveTopicSession(student.studentId, { topicId: 'saturn-rings', startedAt: '2026-11-01T11:00:00Z' });
      const { body: homeBefore } = await getHomeWithToken(student.token).expect(200);
      expect(homeBefore.continueSession.id).toBe(openLesson.id);
      expect(getPick(homeBefore, 'saturn-rings')).toBeUndefined();

      const openQuestion = await sessions().save({ studentId: student.studentId, title: 'How a jump shot flies', subject: 'Your question', language: 'en', startedAt: new Date('2026-11-01T12:00:00Z') });

      const { body: homeAfter } = await getHomeWithToken(student.token).expect(200);

      expect(homeAfter.continueSession.id).toBe(openQuestion.id);
      expect(getPick(homeAfter, 'saturn-rings')).toMatchObject({ reason: CARRY_ON_REASON, continueSessionId: openLesson.id });
    });
  });

  describe('from the learner record', () => {
    const REASON = getStruggleReason(FREE_BODY_STRUGGLE.topic);

    function records() {
      return testApp.app.get(LearnerRecordService);
    }

    async function noteStruggle(studentId: string, updateKey = 'first') {
      const { id: sessionId } = await sessions().save({ studentId, title: 'A finished question', subject: 'Physics', language: 'en', status: 'finished' as const, startedAt: new Date(Date.now() - 60_000) });
      await records().applyUpdate({ studentId, sessionId, updateKey, notes: [FREE_BODY_STRUGGLE] });
    }

    async function getPicks(token = mayaToken): Promise<PickCard[]> {
      const { body } = await getHomeWithToken(token).expect(200);
      return (body as { picks: PickCard[] }).picks;
    }

    it('puts a struggle among the first cards, naming what happened and when', async () => {
      await noteStruggle(EXAMPLE_STUDENT_ID);

      const picks = await getPicks();
      const struggleCard = picks.find((pick) => pick.reason === REASON);

      expect(picks.indexOf(struggleCard as PickCard)).toBeLessThan(2);
      expect(struggleCard).toMatchObject({ title: 'Free-body forces', topicId: null });
      expect(Date.now() - new Date(struggleCard?.reasonDate ?? 0).getTime()).toBeLessThan(60_000);
    });

    describe('when a session moved away from its card', () => {
      const LONG_DIVISION_STRUGGLE = { ...FREE_BODY_STRUGGLE, topic: 'long division' };

      async function startOnCardThenMove(studentId: string, startedAt = new Date(Date.now() - 60_000)) {
        const { id } = await sessions().save({ studentId, title: 'How a jump shot flies', subject: 'Physics', language: 'en', artwork: 'arc' as const, topicId: 'jump-shot', startedAt });
        await testApp.app.get(SessionsService).renameUnfinished(studentId, id, 'Long division');
        return id;
      }

      it('makes a card for the topic it moved to, and does not blame the card it left', async () => {
        const student = await createTestStudent(testApp);
        const sessionId = await startOnCardThenMove(student.studentId);
        await records().applyUpdate({ studentId: student.studentId, sessionId, updateKey: 'moved', notes: [LONG_DIVISION_STRUGGLE] });
        await sessions().update({ id: sessionId }, { status: 'finished' });

        const picks = await getPicks(student.token);

        expect(picks.find(({ reason }) => reason.includes('long division'))).toMatchObject({ title: 'Long division', subject: 'Your question', topicId: null });
        expect(picks.find(({ id }) => id === 'jump-shot')?.reason ?? '').not.toContain('long division');
      });

      it('does not say the student finished the card it left, however long it ran', async () => {
        const student = await createTestStudent(testApp);
        const sessionId = await startOnCardThenMove(student.studentId);
        await sessions().update({ id: sessionId }, { status: 'finished', durationSeconds: 900 });

        const picks = await getPicks(student.token);

        expect(picks.filter(({ reason }) => reason.startsWith('You finished'))).toEqual([]);
      });

      it('does not offer to carry on the card it left', async () => {
        const student = await createTestStudent(testApp);
        const movedId = await startOnCardThenMove(student.studentId, new Date(Date.now() - 120_000));
        await saveUnfinishedSession(student.studentId, 'A newer question', new Date(Date.now() - 60_000).toISOString());

        const picks = await getPicks(student.token);

        expect(picks.filter(({ continueSessionId }) => continueSessionId === movedId)).toEqual([]);
      });
    });

    describe('when a note holds words off the closed list', () => {
      it.each(['self harm', 'my dads drinking', 'suicide', 'my depression', 'my dad hits me'])('never shows %j, whatever the table holds', async (topic) => {
        const student = await createTestStudent(testApp);
        const { id: sessionId } = await sessions().save({ studentId: student.studentId, title: 'A question', subject: 'Your question', language: 'en', status: 'finished' as const, startedAt: new Date(Date.now() - 60_000) });
        await testApp.app.get(DataSource).getRepository(LearnerNoteEntity).save({ studentId: student.studentId, sessionId, kind: 'struggled' as const, topic, topicKey: topic, detail: null, evidence: [{ source: 'words' as const, text: '', check: null }] });

        const { text } = await getHomeWithToken(student.token).expect(200);

        expect(text).not.toContain(topic);
      });
    });

    it('still offers six cards', async () => {
      await noteStruggle(EXAMPLE_STUDENT_ID);

      expect(await getPicks()).toHaveLength(6);
    });

    it('drops the card as soon as its note is deleted', async () => {
      await noteStruggle(EXAMPLE_STUDENT_ID);
      const { notes } = await records().getRecord(EXAMPLE_STUDENT_ID);
      const noteId = notes.find(({ topic }) => topic === FREE_BODY_STRUGGLE.topic)?.id ?? '';

      await request(testApp.app.getHttpServer()).delete(`/me/record/notes/${noteId}`).set('Authorization', `Bearer ${mayaToken}`).expect(204);

      expect((await getPicks()).map((pick) => pick.reason)).not.toContain(REASON);
    });

    it('never lets another student\'s record change a card', async () => {
      const otherToken = await testApp.supabaseAuth.signToken(SECOND_STUDENT_AUTH_USER_ID);
      const otherPicksBefore = await getPicks(otherToken);
      const mayaPicksBefore = await getPicks();

      await noteStruggle(EXAMPLE_STUDENT_ID);

      expect(await getPicks(otherToken)).toEqual(otherPicksBefore);
      expect(await getPicks()).not.toEqual(mayaPicksBefore);
    });

    it('still gives a full Home when the record cannot be read', async () => {
      const expected = await getPicks();
      await noteStruggle(EXAMPLE_STUDENT_ID);
      const failedRead = jest.spyOn(records(), 'getRecord').mockRejectedValue(new Error('no record'));

      const picks = await getPicks();
      failedRead.mockRestore();

      expect(picks.map((pick) => pick.reason)).not.toContain(REASON);
      expect(picks).toHaveLength(expected.length);
    });

    it('gives a brand new student six cards and no claim about a day', async () => {
      const { token } = await createTestStudent(testApp);

      const picks = await getPicks(token);

      expect(picks).toHaveLength(6);
      expect(picks.every((pick) => pick.reasonDate === null)).toBe(true);
    });
  });

  it('refuses a request with no token', async () => {
    await request(testApp.app.getHttpServer()).get('/home').expect(401);
  });

  it('refuses a signed-in user who has no student yet', async () => {
    await getHomeWithToken(await testApp.supabaseAuth.signToken(randomUUID())).expect(403);
  });
});
