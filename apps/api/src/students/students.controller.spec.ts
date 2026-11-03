import request from 'supertest';
import { createTestApp } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';

const UNKNOWN_STUDENT_ID = '0b0e9c52-6d0c-4f3b-9a53-3f5f0d3f7c11';
const VALID_PROFILE = {
  interests: ['Basketball', 'Space'],
  level: 'university',
  goal: 'exam',
  voice: 'ada',
};

describe('the students routes', () => {
  let testApp: TestApp;
  let studentId: string;

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
    studentId = (await api().post('/students').send({ name: 'Maya' }).expect(201)).body.id;
  });

  afterAll(() => testApp?.close());

  it('saves a valid student and reads the same student back', async () => {
    const created = await api().post('/students').send({ name: 'Adaeze Ọkàfọ́r' }).expect(201);

    await api()
      .get(`/students/${created.body.id}`)
      .expect(200, { id: created.body.id, name: 'Adaeze Ọkàfọ́r', profile: null });
  });

  it.each([
    ['an emoji', '\u{1F3C0}'],
    ['an emoji joined with zero-width characters', '\u{1F469}\u200D\u{1F680}'],
    ['a name with a zero-width joiner', 'Niv\u200Da'],
    ['a name with combining tone marks', 'Ade\u0300\u0323'],
  ])('saves %s and reads the same text back', async (_caseName, name) => {
    const created = await api().post('/students').send({ name }).expect(201);

    await api().get(`/students/${created.body.id}`).expect(200, { id: created.body.id, name, profile: null });
  });

  it('saves a valid profile and reads the same profile back', async () => {
    await api().put(`/students/${studentId}/profile`).send(VALID_PROFILE).expect(200, VALID_PROFILE);

    await api()
      .get(`/students/${studentId}`)
      .expect(200, { id: studentId, name: 'Maya', profile: VALID_PROFILE });
  });

  it('sends no internal column of a student or a profile', async () => {
    await api().put(`/students/${studentId}/profile`).send(VALID_PROFILE).expect(200);

    const { body } = await api().get(`/students/${studentId}`).expect(200);

    expect(Object.keys(body).sort()).toEqual(['id', 'name', 'profile']);
    expect(Object.keys(body.profile).sort()).toEqual(['goal', 'interests', 'level', 'voice']);
  });

  it.each([
    ['a missing name', {}, 'name'],
    ['a name that is not text', { name: 42 }, 'name'],
    ['an empty name', { name: '' }, 'name'],
    ['a blank name', { name: '   ' }, 'name'],
    ['a name with a null character', { name: 'Ma\u0000ya' }, 'name'],
    ['a name of only zero-width characters', { name: '\u200B\u200C\u200D\u2060\uFEFF' }, 'name'],
    ['a name of only variation selectors', { name: '\uFE0F\uFE0F' }, 'name'],
    ['a name of only combining marks', { name: '\u0301\u0323' }, 'name'],
    ['a name with a lone high surrogate', { name: 'Ma\uD83Dya' }, 'name'],
    ['a name with a lone low surrogate', { name: 'Ma\uDE00ya' }, 'name'],
    ['a name that is too long', { name: 'M'.repeat(81) }, 'name'],
    ['a field the DTO does not declare', { name: 'Maya', isAdmin: true }, 'isAdmin'],
  ])('rejects %s when creating a student', async (_caseName, body, fieldName) => {
    expectBadRequestNaming(await api().post('/students').send(body), fieldName);
  });

  it.each([
    ['a missing interest list', { interests: undefined }, 'interests'],
    ['interests that are not a list', { interests: 'Space' }, 'interests'],
    ['a list inside the interest list', { interests: [['Space']] }, 'interests'],
    ['an interest that is not text', { interests: [42] }, 'interests'],
    ['a blank interest', { interests: ['  '] }, 'interests'],
    ['an interest with a null character', { interests: ['Sp\u0000ce'] }, 'interests'],
    ['an interest that is too long', { interests: ['S'.repeat(61)] }, 'interests'],
    ['too many interests', { interests: Array(21).fill('Space') }, 'interests'],
    ['a level that is not on the list', { level: 'wizard' }, 'level'],
    ['a goal that is not on the list', { goal: 'fame' }, 'goal'],
    ['a voice that is not on the list', { voice: 'hal' }, 'voice'],
  ])('rejects %s when saving a profile', async (_caseName, change, fieldName) => {
    const response = await api()
      .put(`/students/${studentId}/profile`)
      .send({ ...VALID_PROFILE, ...change });

    expectBadRequestNaming(response, fieldName);
  });

  it('rejects a student ID that is not a UUID', async () => {
    expectBadRequestNaming(await api().get('/students/not-a-uuid'), 'studentId');
  });

  it('answers 404 for a student that does not exist', async () => {
    await api().get(`/students/${UNKNOWN_STUDENT_ID}`).expect(404);
    await api().put(`/students/${UNKNOWN_STUDENT_ID}/profile`).send(VALID_PROFILE).expect(404);
  });
});
