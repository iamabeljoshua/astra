import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { SessionLogEventEntity } from '../infrastructure/orm/entities/session-log-event.entity';
import type { SessionLogRun } from '../infrastructure/orm/repositories/session-log.repository';
import { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { SessionsService } from './sessions.service';

const SESSIONS_PATH = '/sessions';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

describe('the sessions routes', () => {
  let testApp: TestApp;
  let student: TestStudent;

  function api({ token }: TestStudent = student) {
    const server = request(testApp.app.getHttpServer());
    return {
      get: (url: string) => server.get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) => server.post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) => server.patch(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) => server.delete(url).set('Authorization', `Bearer ${token}`),
    };
  }

  function expectBadRequestNaming(response: request.Response, fieldName: string) {
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining(fieldName)]),
    );
  }

  async function startSession(owner: TestStudent, change: object = {}) {
    const { body } = await api(owner).post(SESSIONS_PATH).send({ ...VALID_SESSION, ...change }).expect(201);
    return body as { id: string; title: string };
  }

  function moveSessionStart(sessionId: string, startedAt: string) {
    return testApp.app.get(DataSource).getRepository(SessionEntity).update(sessionId, { startedAt: new Date(startedAt) });
  }

  async function listTitles(owner: TestStudent, query = '') {
    const { body } = await api(owner).get(`${SESSIONS_PATH}${query}`).expect(200);
    return (body as { title: string }[]).map((session) => session.title);
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
  });

  afterAll(() => testApp?.close());

  it('saves a valid session and reads the same session back', async () => {
    const { body: created } = await api().post(SESSIONS_PATH).send(VALID_SESSION).expect(201);

    const { body: sessions } = await api().get(SESSIONS_PATH).expect(200);

    expect(sessions).toContainEqual(created);
    expect(created).toMatchObject(VALID_SESSION);
  });

  it('stores the topic of a session started from a card, and keeps it out of the response', async () => {
    const { id } = await startSession(student, { topicId: 'jump-shot' });

    const stored = await testApp.app.get(DataSource).getRepository(SessionEntity).findOneByOrFail({ id });

    expect(stored.topicId).toBe('jump-shot');
    expect((await api().get(`${SESSIONS_PATH}/${id}`).expect(200)).body).not.toHaveProperty('topicId');
  });

  it('refuses a topic the library does not hold', async () => {
    const response = await api().post(SESSIONS_PATH).send({ ...VALID_SESSION, topicId: 'not-a-topic' });

    expectBadRequestNaming(response, 'topicId');
  });

  it("never lets another student's sessions change a card", async () => {
    const watchedStudent = await createTestStudent(testApp);
    const otherStudent = await createTestStudent(testApp);
    const getPicks = async (owner: TestStudent) => (await api(owner).get('/home').expect(200)).body.picks as unknown[];
    const picksBefore = await getPicks(watchedStudent);

    const finished = await startSession(otherStudent, { topicId: 'jump-shot' });
    await api(otherStudent).patch(`${SESSIONS_PATH}/${finished.id}`).send({ durationSeconds: 720, status: 'finished' }).expect(200);
    await startSession(otherStudent, { topicId: 'saturn-rings' });
    await startSession(otherStudent, { topicId: 'game-worlds' });

    expect(await getPicks(otherStudent)).not.toEqual(picksBefore);
    expect(await getPicks(watchedStudent)).toEqual(picksBefore);
  });

  it('sends no internal column of a session', async () => {
    const { body } = await api().post(SESSIONS_PATH).send(VALID_SESSION).expect(201);

    expect(Object.keys(body).sort()).toEqual([
      'artwork',
      'canReplay',
      'detail',
      'durationSeconds',
      'id',
      'language',
      'startedAt',
      'status',
      'subject',
      'title',
    ]);
  });

  it.each([
    ['a missing title', { title: undefined }, 'title'],
    ['a blank title', { title: '  ' }, 'title'],
    ['a title that is too long', { title: 'T'.repeat(201) }, 'title'],
    ['a missing subject', { subject: undefined }, 'subject'],
    ['a subject that is too long', { subject: 'S'.repeat(61) }, 'subject'],
    ['a missing language', { language: undefined }, 'language'],
    ['a language that is not on the list', { language: 'xx' }, 'language'],
    ['a status from the client', { status: 'finished' }, 'status'],
  ])('rejects %s when starting a session', async (_caseName, change, fieldName) => {
    const response = await api()
      .post(SESSIONS_PATH)
      .send({ ...VALID_SESSION, ...change });

    expectBadRequestNaming(response, fieldName);
  });

  it.each(['0', '101', '1e21', '-1', 'many', '1.5', '0x10', '0b11', '0o7', '1e1', ' 5', ''])(
    'rejects a list limit of "%s"',
    async (limit) => {
      const response = await api().get(`${SESSIONS_PATH}?limit=${encodeURIComponent(limit)}`);

      expectBadRequestNaming(response, 'limit');
    },
  );

  it('returns at most 50 sessions when the limit is left out', async () => {
    const busyStudent = await createTestStudent(testApp);
    for (let count = 0; count < 51; count += 1) {
      await api(busyStudent).post(SESSIONS_PATH).send(VALID_SESSION).expect(201);
    }

    const { body: sessions } = await api(busyStudent).get(SESSIONS_PATH).expect(200);

    expect(sessions).toHaveLength(50);
  });

  it('accepts the largest list limit', async () => {
    await api().get(`${SESSIONS_PATH}?limit=100`).expect(200);
  });

  it('keeps the picture a card asks for and refuses a name not on the list', async () => {
    const created = await startSession(student, { artwork: 'saturn' });

    expect(created).toMatchObject({ artwork: 'saturn' });
    expectBadRequestNaming(await api().post(SESSIONS_PATH).send({ ...VALID_SESSION, artwork: 'nope' }), 'artwork');
  });

  describe('the order of the list', () => {
    it('lists the newest session first, and the next page carries on from the last', async () => {
      const owner = await createTestStudent(testApp);
      const middle = await startSession(owner, { title: 'middle' });
      const newest = await startSession(owner, { title: 'newest' });
      const oldest = await startSession(owner, { title: 'oldest' });
      await moveSessionStart(oldest.id, '2026-10-01T12:00:00Z');
      await moveSessionStart(middle.id, '2026-10-02T12:00:00Z');
      await moveSessionStart(newest.id, '2026-10-03T12:00:00Z');

      expect(await listTitles(owner)).toEqual(['newest', 'middle', 'oldest']);
      expect(await listTitles(owner, '?limit=2')).toEqual(['newest', 'middle']);
      expect(await listTitles(owner, '?limit=2&offset=2')).toEqual(['oldest']);
    });

    it.each(['-1', '1.5', 'many', '2147483648', '99999999999999999999999'])('rejects a list offset of "%s"', async (offset) => {
      expectBadRequestNaming(await api().get(`${SESSIONS_PATH}?offset=${offset}`), 'offset');
    });
  });

  describe('search', () => {
    let owner: TestStudent;

    beforeAll(async () => {
      owner = await createTestStudent(testApp);
      await startSession(owner, { title: 'Why Saturn has rings', subject: 'Astronomy' });
      await startSession(owner, { title: 'Free-body diagrams', subject: 'Physics' });
      await startSession(owner, { title: 'Is 100% of a wave_form real?', subject: 'Physics' });
    });

    it.each([
      ['a word in a title', 'saturn', ['Why Saturn has rings']],
      ['a subject', 'ASTRONOMY', ['Why Saturn has rings']],
      ['a percent sign as itself', '100%', ['Is 100% of a wave_form real?']],
      ['an underscore as itself', 'wave_form', ['Is 100% of a wave_form real?']],
      ['a lone percent sign as itself', '%', ['Is 100% of a wave_form real?']],
      ['a backslash as itself', '\\\\', []],
      ['text in no session', 'calculus', []],
    ])('finds %s', async (_caseName, search, expectedTitles) => {
      expect(await listTitles(owner, `?search=${encodeURIComponent(search)}`)).toEqual(expectedTitles);
    });

    it('never finds the same words in another student\'s session', async () => {
      const otherStudent = await createTestStudent(testApp);

      expect(await listTitles(otherStudent, '?search=saturn')).toEqual([]);
      expect(await listTitles(otherStudent, '?search=astronomy')).toEqual([]);
    });

    it.each([
      ['blank text', '%20'],
      ['a null character', '%00'],
      ['two values', 'a&search=b'],
      ['text that is too long', 'a'.repeat(201)],
    ])('rejects %s', async (_caseName, search) => {
      expectBadRequestNaming(await api().get(`${SESSIONS_PATH}?search=${search}`), 'search');
    });
  });

  describe('one session', () => {
    it('reads the student\'s own session back', async () => {
      const created = await startSession(student);

      const { body } = await api().get(`${SESSIONS_PATH}/${created.id}`).expect(200);

      expect(body).toEqual(created);
    });

    it('answers 404 for an ID that belongs to no session', async () => {
      await api().get(`${SESSIONS_PATH}/${randomUUID()}`).expect(404);
      await api().patch(`${SESSIONS_PATH}/${randomUUID()}`).send({ durationSeconds: 1 }).expect(404);
    });

    it('answers 400 for an ID that is not a UUID', async () => {
      await api().get(`${SESSIONS_PATH}/not-a-uuid`).expect(400);
      await api().patch(`${SESSIONS_PATH}/not-a-uuid`).send({ durationSeconds: 1 }).expect(400);
    });

    it('refuses a request with no token', async () => {
      const created = await startSession(student);
      const server = request(testApp.app.getHttpServer());

      await server.get(`${SESSIONS_PATH}/${created.id}`).expect(401);
      await server.patch(`${SESSIONS_PATH}/${created.id}`).send({ durationSeconds: 1 }).expect(401);
    });
  });

  describe('another student\'s session', () => {
    it('cannot be read, by answering the same as an ID that does not exist', async () => {
      const created = await startSession(student);
      const otherStudent = await createTestStudent(testApp);

      const { body: refused } = await api(otherStudent).get(`${SESSIONS_PATH}/${created.id}`).expect(404);
      const { body: missing } = await api(otherStudent).get(`${SESSIONS_PATH}/${randomUUID()}`).expect(404);

      expect(refused).toEqual(missing);
    });

    it('cannot be saved or ended, and stays as it was', async () => {
      const created = await startSession(student);
      const otherStudent = await createTestStudent(testApp);

      await api(otherStudent)
        .patch(`${SESSIONS_PATH}/${created.id}`)
        .send({ durationSeconds: 999, status: 'finished' })
        .expect(404);

      const { body } = await api().get(`${SESSIONS_PATH}/${created.id}`).expect(200);
      expect(body).toEqual(created);
    });
  });

  describe('ending a session', () => {
    it('marks it finished with its length, and it reads back that way in the list', async () => {
      const created = await startSession(student);

      const { body: ended } = await api()
        .patch(`${SESSIONS_PATH}/${created.id}`)
        .send({ durationSeconds: 125, status: 'finished' })
        .expect(200);

      expect(ended).toMatchObject({ id: created.id, status: 'finished', durationSeconds: 125 });
      const { body: sessions } = await api().get(SESSIONS_PATH).expect(200);
      expect(sessions).toContainEqual(ended);
    });

    it('saves the length alone and leaves the session in progress', async () => {
      const created = await startSession(student);

      const { body } = await api().patch(`${SESSIONS_PATH}/${created.id}`).send({ durationSeconds: 30 }).expect(200);

      expect(body).toMatchObject({ status: 'in_progress', durationSeconds: 30 });
    });

    it('leaves a finished session as it is, and still answers, when a save or a second end arrives late', async () => {
      const created = await startSession(student);
      await api().patch(`${SESSIONS_PATH}/${created.id}`).send({ durationSeconds: 60, status: 'finished' }).expect(200);

      const { body: lateSave } = await api().patch(`${SESSIONS_PATH}/${created.id}`).send({ durationSeconds: 5 }).expect(200);
      const { body: secondEnd } = await api()
        .patch(`${SESSIONS_PATH}/${created.id}`)
        .send({ durationSeconds: 7, status: 'finished' })
        .expect(200);

      expect(lateSave).toMatchObject({ status: 'finished', durationSeconds: 60 });
      expect(secondEnd).toMatchObject({ status: 'finished', durationSeconds: 60 });
    });

    it.each([
      ['just over a day', 86_401],
      ['the largest the database holds', 2_147_483_647],
      ['too large for the database', 2_147_483_648],
    ])('saves a length of %s as a day, so the session can still end', async (_caseName, durationSeconds) => {
      const created = await startSession(student);

      const { body: saved } = await api().patch(`${SESSIONS_PATH}/${created.id}`).send({ durationSeconds }).expect(200);
      const { body: ended } = await api()
        .patch(`${SESSIONS_PATH}/${created.id}`)
        .send({ durationSeconds: durationSeconds + 1, status: 'finished' })
        .expect(200);

      expect(saved).toMatchObject({ status: 'in_progress', durationSeconds: 86_400 });
      expect(ended).toMatchObject({ status: 'finished', durationSeconds: 86_400 });
    });

    it('keeps a length of exactly a day as it is', async () => {
      const created = await startSession(student);

      const { body } = await api().patch(`${SESSIONS_PATH}/${created.id}`).send({ durationSeconds: 86_400 }).expect(200);

      expect(body).toMatchObject({ durationSeconds: 86_400 });
    });

    it.each([
      ['a missing length', {}, 'durationSeconds'],
      ['a negative length', { durationSeconds: -1 }, 'durationSeconds'],
      ['a length that is not whole', { durationSeconds: 1.5 }, 'durationSeconds'],
      ['a length sent as text', { durationSeconds: '5' }, 'durationSeconds'],
      ['a move back to in progress', { durationSeconds: 1, status: 'in_progress' }, 'status'],
      ['a new title', { durationSeconds: 1, title: 'Renamed' }, 'title'],
      ['a new owner', { durationSeconds: 1, studentId: randomUUID() }, 'studentId'],
    ])('rejects %s', async (_caseName, body, fieldName) => {
      const created = await startSession(student);

      expectBadRequestNaming(await api().patch(`${SESSIONS_PATH}/${created.id}`).send(body), fieldName);
    });
  });
  describe('the replay', () => {
    const RUN: SessionLogRun = { runId: randomUUID(), runStartedAt: new Date('2026-11-04T10:00:00Z'), events: [{ seq: 0, event: { seq: 0, atMs: 0, kind: 'studentSpoke', text: 'what is a half' } }] };
    const saveRun = (sessionId: string, run = RUN) => testApp.app.get(SessionsService).saveLog(sessionId, run);

    async function startSessionWithLog(owner: TestStudent) {
      const { id } = await startSession(owner);
      await saveRun(id);
      return id;
    }

    it('gives a session with no log nothing to replay', async () => {
      const { id } = await startSession(student);

      const { body } = await api().get(`${SESSIONS_PATH}/${id}`).expect(200);
      expect(body).toMatchObject({ canReplay: false });
      await api().get(`${SESSIONS_PATH}/${id}/replay`).expect(200, { recap: null, runs: [] });
    });

    it('gives the student their own session back, run by run, and the list says it can replay', async () => {
      const id = await startSessionWithLog(student);
      const secondRun = { runId: randomUUID(), runStartedAt: new Date('2026-11-04T11:00:00Z'), events: [{ seq: 0, event: { seq: 0, kind: 'second' } }] };
      await saveRun(id, secondRun);

      const { body } = await api().get(`${SESSIONS_PATH}/${id}/replay`).expect(200);
      expect((body as { runs: { events: object[] }[] }).runs.map(({ events }) => events)).toEqual([[RUN.events[0]?.event], [secondRun.events[0]?.event]]);
      const list = await api().get(SESSIONS_PATH).expect(200);
      expect((list.body as { id: string; canReplay: boolean }[]).find((session) => session.id === id)).toMatchObject({ canReplay: true });
    });

    it('replaces a row saved again, so a beat that plays further has one row', async () => {
      const id = await startSessionWithLog(student);
      await saveRun(id, { ...RUN, events: [{ seq: 0, event: { seq: 0, playedWords: 9 } }] });

      const { body } = await api().get(`${SESSIONS_PATH}/${id}/replay`).expect(200);
      expect((body as { runs: { events: object[] }[] }).runs).toEqual([expect.objectContaining({ events: [{ seq: 0, playedWords: 9 }] })]);
    });

    it('gives another student nothing, whether they read or delete, and leaves the owner\'s log whole', async () => {
      const id = await startSessionWithLog(student);
      const other = await createTestStudent(testApp);

      const read = await api(other).get(`${SESSIONS_PATH}/${id}/replay`).expect(404);
      expect(JSON.stringify(read.body)).not.toContain('what is a half');
      await api(other).delete(`${SESSIONS_PATH}/${id}/replay`).expect(404);
      await request(testApp.app.getHttpServer()).get(`${SESSIONS_PATH}/${id}/replay`).expect(401);
      const { body } = await api().get(`${SESSIONS_PATH}/${id}/replay`).expect(200);
      expect((body as { runs: unknown[] }).runs).toHaveLength(1);
    });

    it('deletes the log and the recap for good, and a tutor still closing cannot save them back', async () => {
      const id = await startSessionWithLog(student);
      await testApp.app.get(SessionsService).saveRecap(id, { kind: 'gentle', line: 'Thanks.' });

      await api().delete(`${SESSIONS_PATH}/${id}/replay`).expect(204);

      await saveRun(id);
      await testApp.app.get(SessionsService).saveRecap(id, { kind: 'gentle', line: 'Thanks.' });
      await api().get(`${SESSIONS_PATH}/${id}/replay`).expect(200, { recap: null, runs: [] });
      const { body } = await api().get(`${SESSIONS_PATH}/${id}`).expect(200);
      expect(body).toMatchObject({ canReplay: false, title: VALID_SESSION.title });
    });

    it('goes with the student, so nothing is left when an account is removed', async () => {
      const owner = await createTestStudent(testApp);
      const id = await startSessionWithLog(owner);
      const dataSource = testApp.app.get(DataSource);

      await dataSource.getRepository(SessionEntity).delete(id);

      await expect(dataSource.getRepository(SessionLogEventEntity).countBy({ sessionId: id })).resolves.toBe(0);
    });
  });
});
