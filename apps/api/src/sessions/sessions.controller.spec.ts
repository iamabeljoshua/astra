import request from 'supertest';
import { createTestApp } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';

const UNKNOWN_STUDENT_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

describe('the sessions routes', () => {
  let testApp: TestApp;
  let sessionsPath: string;

  function api() {
    return request(testApp.app.getHttpServer());
  }

  function expectBadRequestNaming(response: request.Response, fieldName: string) {
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining(fieldName)]),
    );
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    const student = await api().post('/students').send({ name: 'Maya' }).expect(201);
    sessionsPath = `/students/${student.body.id}/sessions`;
  });

  afterAll(() => testApp?.close());

  it('saves a valid session and reads the same session back', async () => {
    const { body: created } = await api().post(sessionsPath).send(VALID_SESSION).expect(201);

    const { body: sessions } = await api().get(sessionsPath).expect(200);

    expect(sessions).toContainEqual(created);
    expect(created).toMatchObject(VALID_SESSION);
  });

  it('sends no internal column of a session', async () => {
    const { body } = await api().post(sessionsPath).send(VALID_SESSION).expect(201);

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
      .post(sessionsPath)
      .send({ ...VALID_SESSION, ...change });

    expectBadRequestNaming(response, fieldName);
  });

  it.each(['0', '101', '1e21', '-1', 'many', '1.5'])(
    'rejects a list limit of %s',
    async (limit) => {
      expectBadRequestNaming(await api().get(`${sessionsPath}?limit=${limit}`), 'limit');
    },
  );

  it('accepts the largest list limit', async () => {
    await api().get(`${sessionsPath}?limit=100`).expect(200);
  });

  it('answers 404 for a student that does not exist', async () => {
    await api().post(`/students/${UNKNOWN_STUDENT_ID}/sessions`).send(VALID_SESSION).expect(404);
    await api().get(`/students/${UNKNOWN_STUDENT_ID}/sessions`).expect(404);
  });
});
