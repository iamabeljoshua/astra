import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import type { SafetyFlagResponseDto } from './safety.dto';

const AGENT_KEY = 'agent-key-for-test-that-is-long';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const SELF_HARM_FROM_STUDENT = { kind: 'self_harm', source: 'student' };
const FLAG_FIELDS = ['createdAt', 'id', 'kind', 'reviewedAt', 'reviewedBy', 'sessionId', 'source', 'studentId'];
const FLAG_COLUMNS = ['created_at', 'id', 'kind', 'reviewed_at', 'reviewed_by', 'session_id', 'source', 'student_id'];
const WORDS_THAT_REACH_A_PARENT = /parent|guardian|sendmail|nodemailer|twilio/i;

describe('safety flags', () => {
  let testApp: TestApp;
  let student: TestStudent;
  let reviewer: TestStudent;
  let sessionId: string;
  const savedEnvironment = { ...process.env };

  const server = () => request(testApp.app.getHttpServer());
  const asUser = (call: request.Test, { token }: TestStudent) => call.set('Authorization', `Bearer ${token}`);
  const addFlag = (id: string, body: object, key = AGENT_KEY) =>
    server().post(`/agent/sessions/${id}/flags`).set('Authorization', `Bearer ${key}`).send(body);
  const listFlags = async () => (await asUser(server().get('/review/flags'), reviewer).expect(200)).body as SafetyFlagResponseDto[];

  async function startSession() {
    const { body } = await asUser(server().post('/sessions'), student).send(VALID_SESSION).expect(201);
    return (body as { id: string }).id;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
    reviewer = await createTestStudent(testApp);
    sessionId = await startSession();
  });

  beforeEach(() => {
    process.env.ASTRA_AGENT_KEY = AGENT_KEY;
    process.env.SAFETY_REVIEWER_IDS = `${randomUUID()}, ${reviewer.authUserId}`;
  });

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  describe('the agent route', () => {
    it('answers 200 with flagged true, and the flag names the session and its student', async () => {
      const ownSession = await startSession();

      await addFlag(ownSession, SELF_HARM_FROM_STUDENT).expect(200, { flagged: true });

      const flag = (await listFlags()).find((listed) => listed.sessionId === ownSession);
      expect(flag).toMatchObject({ studentId: student.studentId, kind: 'self_harm', source: 'student', reviewedAt: null, reviewedBy: null });
    });

    it('takes a finished session, as spend does', async () => {
      const finished = await startSession();
      await asUser(server().patch(`/sessions/${finished}`), student).send({ durationSeconds: 1, status: 'finished' }).expect(200);

      await addFlag(finished, { kind: 'tutor_slip', source: 'tutor' }).expect(200, { flagged: true });
    });

    it('keeps one row for each call, so a storm of repeats stays visible', async () => {
      const stormy = await startSession();

      await addFlag(stormy, SELF_HARM_FROM_STUDENT).expect(200);
      await addFlag(stormy, SELF_HARM_FROM_STUDENT).expect(200);

      expect((await listFlags()).filter((listed) => listed.sessionId === stormy)).toHaveLength(2);
    });

    it('refuses a call without the agent key', async () => {
      await addFlag(sessionId, SELF_HARM_FROM_STUDENT, 'not-the-key').expect(401);
      await asUser(server().post(`/agent/sessions/${sessionId}/flags`), student).send(SELF_HARM_FROM_STUDENT).expect(401);
    });

    it.each([
      ['an unknown kind', { kind: 'sad', source: 'student' }],
      ['an unknown source', { kind: 'abuse', source: 'parent' }],
      ['words beside the kind and source', { ...SELF_HARM_FROM_STUDENT, text: 'what the student said' }],
    ])('refuses %s', async (_description, body) => {
      await addFlag(sessionId, body).expect(400);
    });

    it('answers 404 for a session that does not exist', async () => {
      await addFlag(randomUUID(), SELF_HARM_FROM_STUDENT).expect(404);
      await addFlag('not-a-session', SELF_HARM_FROM_STUDENT).expect(404);
    });
  });

  describe('who may read the queue', () => {
    it.each([
      ['unset', () => delete process.env.SAFETY_REVIEWER_IDS],
      ['empty', () => (process.env.SAFETY_REVIEWER_IDS = '')],
    ])('answers everyone as a route that does not exist while the list is %s', async (_description, setList) => {
      setList();

      const list = await asUser(server().get('/review/flags'), reviewer).expect(404);
      const missingRoute = await asUser(server().get('/review/no-such-route'), reviewer).expect(404);
      await asUser(server().post(`/review/flags/${randomUUID()}/reviewed`), reviewer).expect(404);

      expect(Object.keys(list.body as object).sort()).toEqual(Object.keys(missingRoute.body as object).sort());
    });

    it('refuses a student the list does not name, while it names someone else', async () => {
      await asUser(server().get('/review/flags'), student).expect(404);
      await asUser(server().post(`/review/flags/${randomUUID()}/reviewed`), student).expect(404);
    });

    it('asks a caller with no token to sign in, as every other route does', async () => {
      await server().get('/review/flags').expect(401);
    });
  });

  describe('the queue', () => {
    it('lists unreviewed flags first, and newest first within each group', async () => {
      const queued = await startSession();
      for (const kind of ['abuse', 'danger', 'grooming']) await addFlag(queued, { kind, source: 'student' }).expect(200);
      const [newest] = await listFlags();
      await asUser(server().post(`/review/flags/${newest?.id}/reviewed`), reviewer).expect(200);

      const flags = await listFlags();
      const firstReviewedAt = flags.findIndex((flag) => flag.reviewedAt !== null);
      const unreviewed = flags.slice(0, firstReviewedAt).map((flag) => flag.createdAt);

      expect(flags[firstReviewedAt]?.id).toBe(newest?.id);
      expect(flags.slice(firstReviewedAt).every((flag) => flag.reviewedAt !== null)).toBe(true);
      expect(unreviewed).toEqual([...unreviewed].sort().reverse());
    });

    it('records who reviewed a flag, and the first reviewer stands', async () => {
      const reviewedSession = await startSession();
      await addFlag(reviewedSession, { kind: 'danger', source: 'tutor' }).expect(200);
      const flag = (await listFlags()).find((listed) => listed.sessionId === reviewedSession);
      const secondReviewer = await createTestStudent(testApp);
      process.env.SAFETY_REVIEWER_IDS = `${reviewer.authUserId},${secondReviewer.authUserId}`;

      const { body: first } = await asUser(server().post(`/review/flags/${flag?.id}/reviewed`), reviewer).expect(200);
      const { body: second } = await asUser(server().post(`/review/flags/${flag?.id}/reviewed`), secondReviewer).expect(200);

      expect(first).toMatchObject({ reviewedBy: reviewer.authUserId });
      expect(second).toEqual(first);
    });

    it('answers 404 when marking a flag that does not exist', async () => {
      await asUser(server().post(`/review/flags/${randomUUID()}/reviewed`), reviewer).expect(404);
      await asUser(server().post('/review/flags/not-a-flag/reviewed'), reviewer).expect(404);
    });
  });

  describe('what a flag holds and where it goes', () => {
    it('holds no words: no column can carry text, and the answer has no parent field', async () => {
      const dataSource = testApp.app.get(DataSource);
      const columns: { column_name: string; data_type: string }[] = await dataSource.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'safety_flags'`,
      );
      await addFlag(sessionId, SELF_HARM_FROM_STUDENT).expect(200);
      const [flag] = await listFlags();

      expect(columns.map((column) => column.column_name).sort()).toEqual(FLAG_COLUMNS);
      expect(columns.map((column) => column.data_type)).not.toEqual(expect.arrayContaining(['text']));
      expect(columns.map((column) => column.data_type)).not.toEqual(expect.arrayContaining(['character varying']));
      expect(Object.keys(flag as object).sort()).toEqual(FLAG_FIELDS);
    });

    it('sends nothing to anyone: flagging makes no outside call, and the module has no way to reach a parent', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      await addFlag(sessionId, SELF_HARM_FROM_STUDENT).expect(200, { flagged: true });
      const callsToOutside = fetchSpy.mock.calls.filter(([url]) => !String(url).startsWith('http://127.0.0.1'));
      fetchSpy.mockRestore();

      const moduleSources = readdirSync(__dirname)
        .filter((file) => !file.endsWith('.spec.ts'))
        .map((file) => readFileSync(join(__dirname, file), 'utf8'));
      expect(callsToOutside).toEqual([]);
      expect(moduleSources.filter((source) => WORDS_THAT_REACH_A_PARENT.test(source))).toEqual([]);
    });
  });
});
