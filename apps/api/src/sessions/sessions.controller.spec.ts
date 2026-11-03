import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { SessionEntity } from '../infrastructure/orm/entities/session.entity';

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

  it('sends no internal column of a session', async () => {
    const { body } = await api().post(SESSIONS_PATH).send(VALID_SESSION).expect(201);

    expect(Object.keys(body).sort()).toEqual([
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
      ['a missing length', {}, 'durationSeconds'],
      ['a negative length', { durationSeconds: -1 }, 'durationSeconds'],
      ['a length that is not whole', { durationSeconds: 1.5 }, 'durationSeconds'],
      ['a length too large to store', { durationSeconds: 2_147_483_648 }, 'durationSeconds'],
      ['a length sent as text', { durationSeconds: '5' }, 'durationSeconds'],
      ['a move back to in progress', { durationSeconds: 1, status: 'in_progress' }, 'status'],
      ['a new title', { durationSeconds: 1, title: 'Renamed' }, 'title'],
      ['a new owner', { durationSeconds: 1, studentId: randomUUID() }, 'studentId'],
    ])('rejects %s', async (_caseName, body, fieldName) => {
      const created = await startSession(student);

      expectBadRequestNaming(await api().patch(`${SESSIONS_PATH}/${created.id}`).send(body), fieldName);
    });
  });
});
