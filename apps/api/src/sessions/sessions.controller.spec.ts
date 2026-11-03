import request from 'supertest';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

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
    };
  }

  function expectBadRequestNaming(response: request.Response, fieldName: string) {
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining(fieldName)]),
    );
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
});
