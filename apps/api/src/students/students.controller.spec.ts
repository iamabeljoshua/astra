import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp, createTestStudent, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

const SAVED_PROFILE = {
  interests: ['Basketball', 'Space'],
  level: 'university',
  goal: 'exam',
  voice: 'ada',
  firstQuestion: 'How does a curveball bend?',
};
const VALID_PROFILE = { ...SAVED_PROFILE, name: 'Maya' };
const MILLISECONDS_PER_DAY = 86_400_000;
const CLOSED_ACCOUNT = { status: 'closed', student: null };
const ANSWERS_AT_ONCE = 20;

function getYoungBirthDate() {
  return new Date(Date.now() - 365 * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

describe('the account routes', () => {
  let testApp: TestApp;
  let student: TestStudent;

  function api(token: string) {
    const server = request(testApp.app.getHttpServer());
    const bearer = `Bearer ${token}`;
    return {
      getAccount: () => server.get('/me').set('Authorization', bearer),
      answer: (birthDate: unknown, name?: string) => server.post('/me/birth-date').set('Authorization', bearer).send({ birthDate, name }),
      saveProfile: (body: object) => server.put('/me/profile').set('Authorization', bearer).send(body),
    };
  }

  function createNewAccountToken() {
    return testApp.supabaseAuth.signToken(randomUUID());
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

  describe('the date of birth question', () => {
    it('makes an account with a student when the answer is old enough', async () => {
      const token = await createNewAccountToken();

      const { body } = await api(token).answer(OLD_ENOUGH_BIRTH_DATE).expect(200);

      expect(body).toEqual({
        status: 'active',
        student: { id: expect.any(String), name: null, profile: null, parentConsent: null },
      });
      await api(token).getAccount().expect(200, body);
    });

    it('closes the account when the answer is too young', async () => {
      const token = await createNewAccountToken();

      await api(token).answer(getYoungBirthDate()).expect(200, CLOSED_ACCOUNT);

      await api(token).getAccount().expect(200, CLOSED_ACCOUNT);
    });

    it('keeps the account closed after an older answer', async () => {
      const token = await createNewAccountToken();
      await api(token).answer(getYoungBirthDate()).expect(200);

      await api(token).answer(OLD_ENOUGH_BIRTH_DATE).expect(200, CLOSED_ACCOUNT);

      await api(token).getAccount().expect(200, CLOSED_ACCOUNT);
    });

    it('keeps the account closed under a new token for the same user', async () => {
      const authUserId = randomUUID();
      await api(await testApp.supabaseAuth.signToken(authUserId)).answer(getYoungBirthDate()).expect(200);

      const nextToken = await testApp.supabaseAuth.signToken(authUserId);

      await api(nextToken).getAccount().expect(200, CLOSED_ACCOUNT);
      await api(nextToken).answer(OLD_ENOUGH_BIRTH_DATE).expect(200, CLOSED_ACCOUNT);
    });

    it('refuses every student route for a closed account', async () => {
      const token = await createNewAccountToken();
      await api(token).answer(getYoungBirthDate()).expect(200);

      await api(token).saveProfile(VALID_PROFILE).expect(403);
      await request(testApp.app.getHttpServer()).get('/sessions').set('Authorization', `Bearer ${token}`).expect(403);
    });

    it('keeps the first answer of an active student', async () => {
      const first = await api(student.token).getAccount().expect(200);

      await api(student.token).answer(getYoungBirthDate()).expect(200, first.body);

      await api(student.token).getAccount().expect(200, first.body);
    });

    it('stores one outcome when answers race, and a closed account stays closed', async () => {
      const token = await createNewAccountToken();

      const answers = await Promise.all(
        Array.from({ length: ANSWERS_AT_ONCE }, (_unused, index) =>
          api(token).answer(index % 2 === 0 ? getYoungBirthDate() : OLD_ENOUGH_BIRTH_DATE),
        ),
      );

      const { body: account } = await api(token).getAccount().expect(200);
      expect(account).toEqual(answers[0]?.body);
      expect(new Set(answers.map((answer) => JSON.stringify(answer.body))).size).toBe(1);
    });

    it('creates one student when the same answer arrives many times', async () => {
      const token = await createNewAccountToken();

      const answers = await Promise.all(
        Array.from({ length: ANSWERS_AT_ONCE }, () => api(token).answer(OLD_ENOUGH_BIRTH_DATE)),
      );

      expect(answers.map((answer) => answer.status)).toEqual(Array(ANSWERS_AT_ONCE).fill(200));
      expect(new Set(answers.map((answer) => answer.body.student.id)).size).toBe(1);
    });

    it.each([
      ['a missing date', undefined],
      ['a date that is not text', 20040314],
      ['a date that does not exist', '2013-02-30'],
      ['a date in the future', '2999-01-01'],
      ['a date long ago', '1899-12-31'],
      ['the wrong format', '14/03/2004'],
    ])('rejects %s and lets the student try again', async (_caseName, birthDate) => {
      const token = await createNewAccountToken();

      expectBadRequestNaming(await api(token).answer(birthDate), 'birthDate');

      await api(token).getAccount().expect(200, { status: 'needs_birth_date', student: null });
    });

    it('never says the age limit in its answers', async () => {
      const token = await createNewAccountToken();

      const answers = [
        await api(token).answer('not a date'),
        await api(token).answer(getYoungBirthDate()),
        await api(token).getAccount(),
      ];

      expect(JSON.stringify(answers.map((answer) => answer.body))).not.toMatch(/\b13\b|thirteen|young|\bunder\b|\bage\b/i);
    });

    it('sends no birth date back', async () => {
      const { body } = await api(await createNewAccountToken()).answer(OLD_ENOUGH_BIRTH_DATE).expect(200);

      expect(JSON.stringify(body)).not.toContain(OLD_ENOUGH_BIRTH_DATE);
    });
  });

  it('saves a valid profile and reads the same profile and name back', async () => {
    const { body: saved } = await api(student.token).saveProfile(VALID_PROFILE).expect(200);

    const { body } = await api(student.token).getAccount().expect(200);

    expect(body).toEqual(saved);
    expect(body.student.name).toBe(VALID_PROFILE.name);
    expect(body.student.profile).toEqual(SAVED_PROFILE);
  });

  it('accepts a profile with no first question yet', async () => {
    const { body } = await api(student.token).saveProfile({ ...VALID_PROFILE, firstQuestion: null }).expect(200);

    expect(body.student.profile.firstQuestion).toBeNull();
  });

  it('stores the name given with the date of birth', async () => {
    const token = await createNewAccountToken();

    const { body } = await api(token).answer(OLD_ENOUGH_BIRTH_DATE, 'Maya').expect(200);

    expect(body.student.name).toBe('Maya');
  });

  it('stores no name for a closed account', async () => {
    const token = await createNewAccountToken();

    await api(token).answer(getYoungBirthDate(), 'Maya').expect(200, CLOSED_ACCOUNT);
  });

  it.each([
    ['a blank name', '  '],
    ['a name that is too long', 'N'.repeat(61)],
  ])('rejects %s with the date of birth', async (_caseName, name) => {
    const token = await createNewAccountToken();

    expectBadRequestNaming(await api(token).answer(OLD_ENOUGH_BIRTH_DATE, name), 'name');

    await api(token).getAccount().expect(200, { status: 'needs_birth_date', student: null });
  });

  it('sends no internal column of a student or a profile', async () => {
    await api(student.token).saveProfile(VALID_PROFILE).expect(200);

    const { body } = await api(student.token).getAccount().expect(200);

    expect(Object.keys(body.student).sort()).toEqual(['id', 'name', 'parentConsent', 'profile']);
    expect(Object.keys(body.student.profile).sort()).toEqual(['firstQuestion', 'goal', 'interests', 'level', 'voice']);
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
    ['a missing name', { name: undefined }, 'name'],
    ['a blank name', { name: '  ' }, 'name'],
    ['a name that is too long', { name: 'N'.repeat(61) }, 'name'],
    ['a missing first question', { firstQuestion: undefined }, 'firstQuestion'],
    ['a blank first question', { firstQuestion: '  ' }, 'firstQuestion'],
    ['a first question that is too long', { firstQuestion: 'Q'.repeat(501) }, 'firstQuestion'],
  ])('rejects %s when saving a profile', async (_caseName, change, fieldName) => {
    expectBadRequestNaming(await api(student.token).saveProfile({ ...VALID_PROFILE, ...change }), fieldName);
  });
});
