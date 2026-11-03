import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';
import { StudentEntity } from '../infrastructure/orm/entities/student.entity';
import { ConsentLinkDelivery } from './consent-link-delivery';

const MILLISECONDS_PER_YEAR = 365.25 * 86_400_000;
const PARENT_EMAIL = 'parent@astra.test';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const VALID_PROFILE = {
  name: 'Tolu',
  interests: ['Space'],
  level: 'high_school',
  goal: 'exam',
  voice: 'ada',
  firstQuestion: null,
};

function getBirthDateAtAge(ageInYears: number) {
  return new Date(Date.now() - ageInYears * MILLISECONDS_PER_YEAR).toISOString().slice(0, 10);
}

describe('parent consent', () => {
  let testApp: TestApp;
  let sendLink: jest.SpyInstance;

  function api(token: string) {
    const server = request(testApp.app.getHttpServer());
    const bearer = `Bearer ${token}`;
    return {
      answerBirthDate: (birthDate: string) => server.post('/me/birth-date').set('Authorization', bearer).send({ birthDate, name: 'Tolu' }),
      getAccount: () => server.get('/me').set('Authorization', bearer),
      askParent: (parentEmail: string) => server.put('/me/parent-consent').set('Authorization', bearer).send({ parentEmail }),
      startSession: () => server.post('/sessions').set('Authorization', bearer).send(VALID_SESSION),
      getHome: () => server.get('/home').set('Authorization', bearer),
      saveProfile: () => server.put('/me/profile').set('Authorization', bearer).send(VALID_PROFILE),
    };
  }

  function parentPage(linkToken: string) {
    const server = request(testApp.app.getHttpServer());
    return { read: () => server.get(`/parent-consent/${linkToken}`), accept: () => server.post('/parent-consent/accept').send({ token: linkToken }) };
  }

  async function createMinor() {
    const token = await testApp.supabaseAuth.signToken(randomUUID());
    await api(token).answerBirthDate(getBirthDateAtAge(15)).expect(200);
    return api(token);
  }

  async function readAcceptedAt(studentId: string): Promise<Date | null> {
    const student = await testApp.app.get(DataSource).getRepository(StudentEntity).findOneByOrFail({ id: studentId });
    return student.parentConsentAt;
  }

  function getLastLinkToken() {
    const [, link] = sendLink.mock.lastCall as [string, string];
    return link.split('/').at(-1) as string;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    sendLink = jest.spyOn(testApp.app.get(ConsentLinkDelivery), 'logInPlaceOfEmail').mockImplementation(() => undefined);
  });

  beforeEach(() => sendLink.mockClear());

  afterAll(() => testApp?.close());

  it('tells a new minor that a parent has not been asked', async () => {
    const minor = await createMinor();

    const { body } = await minor.getAccount().expect(200);

    expect(body.student.parentConsent).toEqual({ status: 'not_asked', parentEmail: null });
  });

  it('needs no parent for an adult, and refuses to ask one', async () => {
    const adult = await createTestStudent(testApp);

    const { body } = await api(adult.token).getAccount().expect(200);

    expect(body.student.parentConsent).toBeNull();
    await api(adult.token).askParent(PARENT_EMAIL).expect(409);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it('keeps an unconfirmed minor from starting a session', async () => {
    const minor = await createMinor();
    await minor.startSession().expect(403);

    await minor.askParent(PARENT_EMAIL).expect(200);

    await minor.startSession().expect(403);
  });

  it('keeps an unconfirmed minor from every other student route', async () => {
    const minor = await createMinor();
    await minor.askParent(PARENT_EMAIL).expect(200);

    await minor.getHome().expect(403);
    await minor.saveProfile().expect(403);
  });

  it('lets the minor in once a parent accepts the logged link', async () => {
    const minor = await createMinor();
    const { body: waiting } = await minor.askParent(PARENT_EMAIL).expect(200);
    expect(waiting.student.parentConsent).toEqual({ status: 'waiting', parentEmail: PARENT_EMAIL });

    await parentPage(getLastLinkToken()).accept().expect(200, { studentName: 'Tolu', isAccepted: true });

    const { body: accepted } = await minor.getAccount().expect(200);
    expect(accepted.student.parentConsent).toEqual({ status: 'given', parentEmail: PARENT_EMAIL });
    await minor.startSession().expect(201);
    await minor.getHome().expect(200);
  });

  it('accepts nothing when the link is only read, as a mail scanner would', async () => {
    const minor = await createMinor();
    await minor.askParent(PARENT_EMAIL).expect(200);

    await parentPage(getLastLinkToken()).read().expect(200, { studentName: 'Tolu', isAccepted: false });

    await minor.startSession().expect(403);
  });

  it('logs one link when the same address is asked again, in any letter case', async () => {
    const minor = await createMinor();

    await minor.askParent(PARENT_EMAIL).expect(200);
    await minor.askParent(PARENT_EMAIL.toUpperCase()).expect(200);

    expect(sendLink).toHaveBeenCalledTimes(1);
  });

  it('logs one link when the same address is asked many times at once', async () => {
    const minor = await createMinor();

    await Promise.all(Array.from({ length: 10 }, () => minor.askParent(PARENT_EMAIL).expect(200)));

    expect(sendLink).toHaveBeenCalledTimes(1);
  });

  it('kills the old link when the student changes the address', async () => {
    const minor = await createMinor();
    await minor.askParent(PARENT_EMAIL).expect(200);
    const oldLinkToken = getLastLinkToken();

    await minor.askParent('other-parent@astra.test').expect(200);

    await parentPage(oldLinkToken).accept().expect(404);
    await minor.startSession().expect(403);
    await parentPage(getLastLinkToken()).accept().expect(200);
    await minor.startSession().expect(201);
  });

  it('keeps the first acceptance when the link is opened again', async () => {
    const minor = await createMinor();
    await minor.askParent(PARENT_EMAIL).expect(200);
    const linkToken = getLastLinkToken();
    const { body: account } = await minor.getAccount().expect(200);

    await parentPage(linkToken).accept().expect(200);
    const firstAcceptedAt = await readAcceptedAt(account.student.id);
    await parentPage(linkToken).accept().expect(200, { studentName: 'Tolu', isAccepted: true });
    await parentPage(linkToken).read().expect(200, { studentName: 'Tolu', isAccepted: true });

    expect(firstAcceptedAt).toBeInstanceOf(Date);
    expect(await readAcceptedAt(account.student.id)).toEqual(firstAcceptedAt);
  });

  it('never gives the link to the student', async () => {
    const minor = await createMinor();

    const { text: asked } = await minor.askParent(PARENT_EMAIL).expect(200);
    const { text: account } = await minor.getAccount().expect(200);

    expect(asked).not.toContain(getLastLinkToken());
    expect(account).not.toContain(getLastLinkToken());
  });

  it('does not store the link itself', async () => {
    const minor = await createMinor();
    await minor.askParent(PARENT_EMAIL).expect(200);

    const rows: { link_token_hash: string }[] = await testApp.app.get(DataSource).query('SELECT link_token_hash FROM parent_consent_requests');

    expect(rows.map((row) => row.link_token_hash)).not.toContain(getLastLinkToken());
  });

  it('answers not found for a link that never existed', async () => {
    await parentPage('not-a-real-link').read().expect(404);
    await parentPage('not-a-real-link').accept().expect(404);
  });

  it.each([
    ['text that is not an address', 'not an email'],
    ['an empty address', ''],
    ['an address that is too long', `${'a'.repeat(250)}@astra.test`],
  ])('rejects %s and logs nothing', async (_caseName, parentEmail) => {
    const minor = await createMinor();

    await minor.askParent(parentEmail).expect(400);

    expect(sendLink).not.toHaveBeenCalled();
  });

  it('no longer holds back a student who turned 18', async () => {
    const token = await testApp.supabaseAuth.signToken(randomUUID());
    await api(token).answerBirthDate(getBirthDateAtAge(18.1)).expect(200);

    await api(token).startSession().expect(201);
  });
});
