import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

const AGENT_KEY = 'agent-key-for-test-that-is-long';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const VALID_PROFILE = { name: 'Maya', interests: ['basketball', 'space'], level: 'university', goal: 'exam' };
const EMPTY_BRIEF = { level: null, interests: [], goal: null };
const JSON_CONTENT = 'application/json';

describe('the agent channel', () => {
  let testApp: TestApp;
  let student: TestStudent;
  let sessionId: string;
  const savedEnvironment = { ...process.env };

  const server = () => request(testApp.app.getHttpServer());
  const asStudent = (call: request.Test, { token }: TestStudent = student) => call.set('Authorization', `Bearer ${token}`);
  const getBrief = (id: string, key = AGENT_KEY) => server().get(`/agent/sessions/${id}/brief`).set('Authorization', `Bearer ${key}`);
  const addSpend = (id: string, body: object, key = AGENT_KEY) => server().post(`/agent/sessions/${id}/spend`).set('Authorization', `Bearer ${key}`).send(body);

  const setTitle = (id: string, body: object, key = AGENT_KEY) => server().post(`/agent/sessions/${id}/title`).set('Authorization', `Bearer ${key}`).send(body);
  const readTitle = async (id: string) => ((await asStudent(server().get(`/sessions/${id}`)).expect(200)).body as { title: string }).title;

  async function startSession(owner: TestStudent = student) {
    const { body } = await asStudent(server().post('/sessions'), owner).send(VALID_SESSION).expect(201);
    return (body as { id: string }).id;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
    sessionId = await startSession();
  });

  beforeEach(() => {
    process.env.ASTRA_AGENT_KEY = AGENT_KEY;
    process.env.ASTRA_DAILY_LIMIT_USD = '1';
  });

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  describe('a new title', () => {
    it('renames a running session', async () => {
      const running = await startSession();

      await setTitle(running, { title: 'Physics of the impossible' }).expect(204);

      expect(await readTitle(running)).toBe('Physics of the impossible');
    });

    it('takes the card\'s picture away with the title that named it', async () => {
      const running = await startSession();

      await setTitle(running, { title: 'A black hole' }).expect(204);

      const { body } = await asStudent(server().get(`/sessions/${running}`)).expect(200);
      expect((body as { artwork: unknown }).artwork).toBeNull();
    });

    it('leaves a finished session as it was', async () => {
      const finished = await startSession();
      await asStudent(server().patch(`/sessions/${finished}`)).send({ durationSeconds: 1, status: 'finished' }).expect(200);

      await setTitle(finished, { title: 'Too late' }).expect(204);

      expect(await readTitle(finished)).toBe(VALID_SESSION.title);
    });

    it.each([
      ['no title', {}],
      ['a blank title', { title: '   ' }],
      ['a title that is too long', { title: 'T'.repeat(201) }],
      ['a title with a null character', { title: 'a\u0000b' }],
      ['more than a title', { title: 'Fine', status: 'finished' }],
    ])('refuses %s', async (_name, body) => {
      await setTitle(sessionId, body).expect(400);
    });

    it('answers 404 for a session it does not know, and 401 with no key', async () => {
      await setTitle(randomUUID(), { title: 'Fine' }).expect(404);
      await setTitle(sessionId, { title: 'Fine' }, 'not-the-key-at-all-not-the-key').expect(401);
    });
  });

  describe('who may call it', () => {
    it('answers 401 to every call while no key is set, even one that sends a key', async () => {
      delete process.env.ASTRA_AGENT_KEY;

      await getBrief(sessionId).expect(401);
      await addSpend(sessionId, { usd: 0.01 }).expect(401);
    });

    it('answers 401 to every call while the key is empty, even one that sends nothing', async () => {
      process.env.ASTRA_AGENT_KEY = '';

      await server().get(`/agent/sessions/${sessionId}/brief`).set('Authorization', 'Bearer ').expect(401);
      await server().post(`/agent/sessions/${sessionId}/spend`).send({ usd: 0.01 }).expect(401);
    });

    it.each([
      ['a wrong key', `Bearer ${AGENT_KEY}x`],
      ['a key cut short', `Bearer ${AGENT_KEY.slice(0, -1)}`],
      ['another scheme', `Basic ${AGENT_KEY}`],
      ['no scheme', AGENT_KEY],
    ])('answers 401 to %s', async (_caseName, authorization) => {
      await server().get(`/agent/sessions/${sessionId}/brief`).set('Authorization', authorization).expect(401);
      await server().post(`/agent/sessions/${sessionId}/spend`).set('Authorization', authorization).send({ usd: 0.01 }).expect(401);
    });

    it('answers 401 with no header, and to a student\'s own token', async () => {
      await server().get(`/agent/sessions/${sessionId}/brief`).expect(401);
      await asStudent(server().get(`/agent/sessions/${sessionId}/brief`)).expect(401);
      await asStudent(server().post(`/agent/sessions/${sessionId}/spend`)).send({ usd: 0.01 }).expect(401);
    });

    it('answers 401 before it says whether a session exists', async () => {
      await getBrief(randomUUID(), 'wrong-key').expect(401);
      await getBrief('not-a-session', 'wrong-key').expect(401);
    });

    it('tells every store along the way to keep no answer, because a brief describes a student', async () => {
      const { headers } = await getBrief(sessionId).expect(200);
      expect(headers['cache-control']).toBe('no-store');
    });
  });

  describe('the brief', () => {
    let namedStudent: TestStudent;
    let namedSessionId: string;

    beforeAll(async () => {
      namedStudent = await createTestStudent(testApp);
      await asStudent(server().put('/me/profile'), namedStudent).send(VALID_PROFILE).expect(200);
      namedSessionId = await startSession(namedStudent);
    });

    it('holds the level, interests, and goal of the session\'s student, and nothing else', async () => {
      const { body, text } = await getBrief(namedSessionId).expect(200);

      expect(body).toEqual({ level: 'university', interests: ['basketball', 'space'], goal: 'exam' });
      expect(text).not.toContain('Maya');
      expect(text).not.toContain(OLD_ENOUGH_BIRTH_DATE);
      expect(text).not.toContain(namedStudent.studentId);
      expect(text).not.toContain(namedStudent.authUserId);
      expect(text).not.toContain(namedSessionId);
    });

    it('answers one empty shape for a student with no profile, so the agent has no guessing to do', async () => {
      await getBrief(sessionId).expect(200, EMPTY_BRIEF);
    });

    it('leaves out an interest saved as free text, which must not reach a model', async () => {
      const owner = await createTestStudent(testApp);
      await asStudent(server().put('/me/profile'), owner).send(VALID_PROFILE).expect(200);
      await testApp.app.get(DataSource).query(`UPDATE "student_profiles" SET "interests" = ARRAY['space', 'my phone number is 555'] WHERE "student_id" = $1`, [owner.studentId]);

      const { body } = await getBrief(await startSession(owner)).expect(200);

      expect((body as { interests: string[] }).interests).toEqual(['space']);
    });

    it('answers for a finished session too', async () => {
      const finished = await startSession();
      await asStudent(server().patch(`/sessions/${finished}`)).send({ durationSeconds: 1, status: 'finished' }).expect(200);

      await getBrief(finished).expect(200, EMPTY_BRIEF);
    });

    it.each([
      ['an unknown session', randomUUID()],
      ['a malformed session', 'not-a-session'],
    ])('answers 404 to %s', async (_caseName, id) => {
      await getBrief(id).expect(404);
    });
  });

  describe('a charge', () => {
    it('adds to the student\'s total for today, and says when it reached the limit', async () => {
      const id = await startSession(await createTestStudent(testApp));

      await addSpend(id, { usd: 0.4 }).expect(200, { isOverDailyLimit: false });
      await addSpend(id, { usd: 0.4 }).expect(200, { isOverDailyLimit: false });
      await addSpend(id, { usd: 0.2 }).expect(200, { isOverDailyLimit: true });
    });

    it('adds up across the student\'s sessions, because the limit is per student', async () => {
      const owner = await createTestStudent(testApp);

      await addSpend(await startSession(owner), { usd: 0.6 }).expect(200, { isOverDailyLimit: false });
      await addSpend(await startSession(owner), { usd: 0.6 }).expect(200, { isOverDailyLimit: true });
    });

    it('closes the student\'s next room once it reaches the limit', async () => {
      const owner = await createTestStudent(testApp);
      const id = await startSession(owner);
      process.env.LIVEKIT_URL = 'wss://astra-test.livekit.cloud';
      process.env.LIVEKIT_API_KEY = 'key-for-test';
      process.env.LIVEKIT_API_SECRET = 'secret-for-test-that-is-long-enough-to-sign';

      await addSpend(id, { usd: 1 }).expect(200, { isOverDailyLimit: true });

      await asStudent(server().post(`/sessions/${id}/live-room`), owner).expect(200, { access: null, unavailableBecause: 'dailyLimit' });
    });

    it('loses no charge when turns end together', async () => {
      const id = await startSession(await createTestStudent(testApp));

      await Promise.all(Array.from({ length: 19 }, () => addSpend(id, { usd: 0.05 }).expect(200)));

      await addSpend(id, { usd: 0 }).expect(200, { isOverDailyLimit: false });
      await addSpend(id, { usd: 0.05 }).expect(200, { isOverDailyLimit: true });
    });

    it('takes a charge on a finished session, because a turn can end as its room closes', async () => {
      const owner = await createTestStudent(testApp);
      const id = await startSession(owner);
      await asStudent(server().patch(`/sessions/${id}`), owner).send({ durationSeconds: 1, status: 'finished' }).expect(200);

      await addSpend(id, { usd: 1 }).expect(200, { isOverDailyLimit: true });
    });

    it.each([[0], [10], [0.000001]])('accepts %d', async (usd) => {
      const id = await startSession(await createTestStudent(testApp));

      await addSpend(id, { usd }).expect(200);
    });

    it.each([
      ['a negative amount', '{"usd":-0.01}'],
      ['more than $10', '{"usd":10.01}'],
      ['an amount too large for a number', '{"usd":1e999}'],
      ['text', '{"usd":"1"}'],
      ['null', '{"usd":null}'],
      ['no amount', '{}'],
      ['a field it does not know', '{"usd":1,"studentId":"someone-else"}'],
    ])('answers 400 to %s, and adds nothing', async (_caseName, body) => {
      const id = await startSession(await createTestStudent(testApp));

      await server().post(`/agent/sessions/${id}/spend`).set('Authorization', `Bearer ${AGENT_KEY}`).set('Content-Type', JSON_CONTENT).send(body).expect(400);

      await addSpend(id, { usd: 0 }).expect(200, { isOverDailyLimit: false });
    });

    it.each([
      ['an unknown session', randomUUID()],
      ['a malformed session', 'not-a-session'],
    ])('answers 404 to %s', async (_caseName, id) => {
      await addSpend(id, { usd: 0.01 }).expect(404);
    });
  });
  describe('saving a session\'s log and recap', () => {
    const saveLog = (id: string, body: object, key = AGENT_KEY) => server().post(`/agent/sessions/${id}/log`).set('Authorization', `Bearer ${key}`).send(body);
    const saveRecap = (id: string, body: object) => server().post(`/agent/sessions/${id}/recap`).set('Authorization', `Bearer ${AGENT_KEY}`).send(body);
    const RUN = { runId: randomUUID(), runStartedAt: '2026-11-04T10:00:00.000Z', events: [{ seq: 0, event: { seq: 0, atMs: 5, kind: 'studentSpoke', text: 'a line' } }] };

    it('saves the log and the recap for the session\'s own student to read, finished or not', async () => {
      const id = await startSession();
      await asStudent(server().patch(`/sessions/${id}`)).send({ durationSeconds: 5, status: 'finished' }).expect(200);

      await saveLog(id, RUN).expect(204);
      await saveRecap(id, { recap: { kind: 'gentle', line: 'Thanks for talking.' } }).expect(204);

      const { body } = await asStudent(server().get(`/sessions/${id}/replay`)).expect(200);
      expect(body).toEqual({ recap: { kind: 'gentle', line: 'Thanks for talking.' }, recapAnswer: null, runs: [{ startedAt: RUN.runStartedAt, events: [RUN.events[0]?.event] }] });
    });

    it('refuses a wrong key, an unknown session, and a body that is not a log', async () => {
      await saveLog(sessionId, RUN, 'a-wrong-key-that-is-just-as-long').expect(401);
      await saveLog(randomUUID(), RUN).expect(404);
      await saveRecap(randomUUID(), { recap: { kind: 'gentle', line: 'x' } }).expect(404);
      await saveLog(sessionId, { ...RUN, runId: 'not-a-uuid' }).expect(400);
      await saveLog(sessionId, { ...RUN, events: [{ seq: -1, event: {} }] }).expect(400);
      await saveLog(sessionId, { ...RUN, events: [{ seq: 0 }] }).expect(400);
      await saveRecap(sessionId, { recap: 'words' }).expect(400);
    });

    it.each([
      ['a null character', { seq: 0, event: { text: 'a\u0000b' } }],
      ['a lone surrogate', { seq: 0, event: { text: 'a\ud83db' } }],
      ['a bad character far inside an event', { seq: 0, event: { action: { work: [{ text: '\u0000' }] } } }],
      ['a bad character in a key', { seq: 0, event: { 'a\u0000': 1 } }],
      ['a place past what a row can hold', { seq: 2_147_483_648, event: {} }],
    ])('answers 400 and not a server error to %s, so the agent can drop it', async (_caseName, loggedEvent) => {
      const id = await startSession();
      await saveLog(id, { ...RUN, events: [loggedEvent] }).expect(400);
    });

    it('answers 400 to a recap Postgres could not hold', async () => {
      await saveRecap(await startSession(), { recap: { kind: 'gentle', line: 'a\u0000b' } }).expect(400);
    });

    it('takes one save that names a place twice, with no server error', async () => {
      const id = await startSession();
      await saveLog(id, { ...RUN, events: [{ seq: 0, event: { a: 1 } }, { seq: 0, event: { a: 2 } }] }).expect(204);
    });
  });
});
