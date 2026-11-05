import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { TEST_SECRET_KEY } from '../../test/test-auth';
import { addAuthUser, addSupabaseAuthTables, createTestApp, findAuthTablesHolding, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp } from '../../test/test-database';

const AGENT_KEY = 'agent-key-for-test-that-is-long';
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const VALID_PROFILE = { name: 'Maya', interests: ['space'], level: 'university', goal: 'exam' };
const LOG_EVENT = { seq: 0, event: { seq: 0, atMs: 0, kind: 'studentSpoke', text: 'i already picked the day', source: 'typed', isReaction: false, durationMs: 0 } };
const LESSON_RECAP = { kind: 'lesson', covered: 'We worked on atoms.', gotRight: null, tryNext: 'Try saying what an atom is.' };
const RECORD_UPDATE = { updateKey: 'room-one', notes: [{ kind: 'explored', topic: 'gravity', detail: null, evidence: [{ source: 'board', text: 'x = 3' }] }] };
const TABLES_WITH_STUDENT_ID = ['learner_notes', 'safety_flags', 'sessions', 'student_daily_spend', 'student_profiles'];
const TABLES_WITH_AUTH_USER_ID = ['closed_accounts', 'students'];
const DELETE_RACE_TRIES = 12;
const STUDENT_COLUMN_NAMES = ['student_id', 'auth_user_id', 'session_id'];
/** Every table a student's rows live in. */
const TABLES_GONE_WITH_A_STUDENT = ['learner_notes', 'learner_record_updates', 'safety_flags', 'session_log_events', 'sessions', 'student_daily_spend', 'student_profiles'];
const TABLES_WITH_NO_STUDENT_ROWS = ['closed_accounts', 'closed_address_hashes', 'migrations', 'students'];

const STUDENT_COLUMNS_QUERY = `
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = ANY($1) ORDER BY table_name`;

const PUBLIC_TABLES_QUERY = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;

/** Follows delete cascades down from `students`, so a table counts only if deleting a student really reaches it. */
const TABLES_REACHED_BY_A_STUDENT_DELETE_QUERY = `
  WITH RECURSIVE reached AS (
    SELECT 'public.students'::regclass AS table_oid
    UNION
    SELECT link.conrelid::regclass FROM pg_constraint AS link JOIN reached ON link.confrelid = reached.table_oid
    WHERE link.contype = 'f' AND link.confdeltype = 'c'
  )
  SELECT source.relname AS table_name FROM reached JOIN pg_class AS source ON source.oid = reached.table_oid`;

interface StudentColumn {
  table_name: string;
  column_name: string;
}

function listStudentColumns(dataSource: DataSource): Promise<StudentColumn[]> {
  return dataSource.query(STUDENT_COLUMNS_QUERY, [STUDENT_COLUMN_NAMES]);
}

// A table's name is not enough, because a jsonb column can hold a student's words under any name, so every table must be reached by the delete or be listed as holding no student's rows.
async function findTablesADeleteMisses(dataSource: DataSource): Promise<string[]> {
  const reached: { table_name: string }[] = await dataSource.query(TABLES_REACHED_BY_A_STUDENT_DELETE_QUERY);
  const reachedTables = new Set(reached.map(({ table_name: tableName }) => tableName));
  const tables: { table_name: string }[] = await dataSource.query(PUBLIC_TABLES_QUERY);
  return tables.map(({ table_name: tableName }) => tableName).filter((tableName) => !reachedTables.has(tableName) && !TABLES_WITH_NO_STUDENT_ROWS.includes(tableName));
}

function listEveryFile(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function writeRecord(path: string, record: object) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(record));
}

function writeStudentStore(storeRoot: string, studentId: string, name: string) {
  writeRecord(join(storeRoot, 'scenes', `scene-${name}`, 'scene.json'), { id: `scene-${name}`, status: 'checked', ownerId: studentId });
  writeFileSync(join(storeRoot, 'scenes', `scene-${name}`, 'light.take.br'), 'take');
  writeRecord(join(storeRoot, 'refusals', `scene-${name}.json`), { key: { id: `scene-${name}`, ownerId: studentId } });
  writeRecord(join(storeRoot, 'waiting-plans', `scene-${name}.json`), { key: { id: `scene-${name}`, ownerId: studentId }, plan: {} });
  writeRecord(join(storeRoot, 'student-voice', studentId, `scene-${name}`, 'line.json'), { sampleRate: 24000, base64: 'AAAA', words: [] });
}

describe('deleting a student', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  let storeRoot: string;
  const savedEnvironment = { ...process.env };

  const server = () => request(testApp.app.getHttpServer());
  const asToken = (call: request.Test, token: string) => call.set('Authorization', `Bearer ${token}`);
  const agentCall = (call: request.Test) => call.set('Authorization', `Bearer ${AGENT_KEY}`);

  async function createFullStudent() {
    const authUserId = randomUUID();
    const email = `${authUserId}@astra.test`;
    const token = await testApp.supabaseAuth.signToken(authUserId, { claims: { email } });
    await addAuthUser(dataSource, { authUserId, email });
    const { body: account } = await asToken(server().post('/me/birth-date'), token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(200);
    const studentId = (account as { student: { id: string } }).student.id;
    await asToken(server().put('/me/profile'), token).send(VALID_PROFILE).expect(200);
    const { body: session } = await asToken(server().post('/sessions'), token).send(VALID_SESSION).expect(201);
    const sessionId = (session as { id: string }).id;
    await agentCall(server().post(`/agent/sessions/${sessionId}/spend`)).send({ usd: 0.01 }).expect(200);
    await agentCall(server().post(`/agent/sessions/${sessionId}/flags`)).send({ kind: 'danger', source: 'tutor' }).expect(200);
    await agentCall(server().post(`/agent/sessions/${sessionId}/flags`)).send({ kind: 'vague', source: 'student' }).expect(200);
    await agentCall(server().post(`/agent/sessions/${sessionId}/log`)).send({ runId: randomUUID(), runStartedAt: new Date().toISOString(), events: [LOG_EVENT] }).expect(204);
    await agentCall(server().post(`/agent/sessions/${sessionId}/recap`)).send({ recap: LESSON_RECAP }).expect(204);
    await asToken(server().put(`/sessions/${sessionId}/recap-answer`), token).send({ answer: 'An atom is the smallest piece.' }).expect(204);
    await agentCall(server().post(`/agent/sessions/${sessionId}/record`)).send(RECORD_UPDATE).expect(200);
    return { authUserId, email, token, studentId, sessionId };
  }

  async function countRowsFor(ids: { studentId: string; authUserId: string; sessionId: string }) {
    const counts: Record<string, number> = {};
    for (const { table_name: tableName, column_name: columnName } of await listStudentColumns(dataSource)) {
      const id = { student_id: ids.studentId, auth_user_id: ids.authUserId, session_id: ids.sessionId }[columnName] as string;
      const [row] = await dataSource.query(`SELECT count(*)::int AS total FROM "${tableName}" WHERE "${columnName}" = $1`, [id]);
      counts[`${tableName}.${columnName}`] = (row as { total: number }).total;
    }
    return counts;
  }

  beforeAll(async () => {
    storeRoot = mkdtempSync(join(tmpdir(), 'astra-delete-student-'));
    process.env.SCENE_STORE_DIR = storeRoot;
    process.env.ASTRA_AGENT_KEY = AGENT_KEY;
    process.env.ASTRA_DAILY_LIMIT_USD = '1';
    delete process.env.LESSON_SPEND_FILE;
    testApp = await createTestApp({ environment: { SUPABASE_SECRET_KEY: TEST_SECRET_KEY } });
    dataSource = await addSupabaseAuthTables(testApp);
  });

  afterAll(async () => {
    process.env = savedEnvironment;
    rmSync(storeRoot, { recursive: true, force: true });
    await testApp.close();
  });

  it('leaves no row for them in any table with a student_id or auth_user_id column, and keeps another student whole', async () => {
    const student = await createFullStudent();
    const otherStudent = await createFullStudent();
    const rowsBefore = await countRowsFor(student);
    const otherRowsBefore = await countRowsFor(otherStudent);

    await asToken(server().delete('/me'), student.token).expect(200, { deleted: true });

    expect(rowsBefore).toMatchObject({ 'students.auth_user_id': 1, 'student_profiles.student_id': 1, 'sessions.student_id': 1, 'student_daily_spend.student_id': 1, 'safety_flags.student_id': 2, 'session_log_events.session_id': 1, 'learner_notes.student_id': 1, 'learner_notes.session_id': 1, 'learner_record_updates.session_id': 1 });
    expect(Object.values(await countRowsFor(student)).every((total) => total === 0)).toBe(true);
    expect(await countRowsFor(otherStudent)).toEqual(otherRowsBefore);
  });

  it('removes the replay log, the recap, the answer, and every flag, and the student can no longer open them', async () => {
    const student = await createFullStudent();
    const [before] = await dataSource.query('SELECT recap, recap_answer FROM sessions WHERE id = $1', [student.sessionId]);
    expect(before).toMatchObject({ recap: LESSON_RECAP, recap_answer: 'An atom is the smallest piece.' });
    await asToken(server().get(`/sessions/${student.sessionId}/replay`), student.token).expect(200);

    await asToken(server().delete('/me'), student.token).expect(200);

    const rows = await countRowsFor(student);
    expect({ log: rows['session_log_events.session_id'], flags: rows['safety_flags.student_id'], sessions: rows['sessions.student_id'] }).toEqual({ log: 0, flags: 0, sessions: 0 });
    await asToken(server().get(`/sessions/${student.sessionId}/replay`), student.token).expect(403);
  });

  it('leaves no row behind when a room keeps saving as the student deletes, over many tries', async () => {
    for (let attempt = 0; attempt < DELETE_RACE_TRIES; attempt += 1) {
      const student = await createFullStudent();
      const save = (path: string, body: object) => agentCall(server().post(`/agent/sessions/${student.sessionId}/${path}`)).send(body).then((response) => response.status);
      const saves = Array.from({ length: 3 }, () => [
        save('log', { runId: randomUUID(), runStartedAt: new Date().toISOString(), events: [LOG_EVENT] }),
        save('recap', { recap: LESSON_RECAP }),
        save('flags', { kind: 'self_harm', source: 'student' }),
      ]).flat();
      await Promise.all([...saves, asToken(server().delete('/me'), student.token).expect(200)]);
      await Promise.all(saves);

      expect(Object.values(await countRowsFor(student)).every((total) => total === 0)).toBe(true);
    }
  });

  it('removes them from every Auth table, including the audit log, and keeps another user', async () => {
    const student = await createFullStudent();
    const otherStudent = await createFullStudent();

    expect(await findAuthTablesHolding(dataSource, student.email)).toEqual(expect.arrayContaining(['users', 'identities', 'audit_log_entries']));
    await asToken(server().delete('/me'), student.token).expect(200);

    expect(await findAuthTablesHolding(dataSource, student.email)).toEqual([]);
    expect(await findAuthTablesHolding(dataSource, student.authUserId)).toEqual([]);
    expect(await findAuthTablesHolding(dataSource, otherStudent.email)).toEqual(expect.arrayContaining(['users', 'audit_log_entries']));
  });

  it('removes what the scene store holds for them, and keeps shared scenes and another student', async () => {
    const student = await createFullStudent();
    const otherStudent = await createFullStudent();
    writeStudentStore(storeRoot, student.studentId, 'own');
    writeStudentStore(storeRoot, otherStudent.studentId, 'other');
    writeRecord(join(storeRoot, 'scenes', 'scene-shared', 'scene.json'), { id: 'scene-shared', status: 'checked', ownerId: null });
    writeFileSync(join(storeRoot, 'lesson-spend.jsonl'), [student.studentId, otherStudent.studentId, student.studentId].map((studentId) => JSON.stringify({ studentId, usd: 0.1 })).join('\n') + '\n');

    await asToken(server().delete('/me'), student.token).expect(200);

    const files = listEveryFile(storeRoot);
    expect(files.filter((path) => path.includes(student.studentId) || readFileSync(path, 'utf8').includes(student.studentId))).toEqual([]);
    expect(existsSync(join(storeRoot, 'scenes', 'scene-own'))).toBe(false);
    expect(existsSync(join(storeRoot, 'scenes', 'scene-shared', 'scene.json'))).toBe(true);
    expect(existsSync(join(storeRoot, 'student-voice', otherStudent.studentId, 'scene-other', 'line.json'))).toBe(true);
    expect(readFileSync(join(storeRoot, 'lesson-spend.jsonl'), 'utf8').trim()).toBe(JSON.stringify({ studentId: otherStudent.studentId, usd: 0.1 }));
  });

  it('removes a scene record too damaged to read, because it may be theirs and nothing can be served from it, and keeps readable ones', async () => {
    const student = await createFullStudent();
    const otherStudent = await createFullStudent();
    writeStudentStore(storeRoot, otherStudent.studentId, 'kept');
    const damaged = join(storeRoot, 'scenes', 'scene-damaged');
    mkdirSync(damaged, { recursive: true });
    writeFileSync(join(damaged, 'scene.json'), '{"id":"scene-damaged","status":"che');
    writeFileSync(join(damaged, 'light.take.br'), 'take');
    const damagedPlan = join(storeRoot, 'waiting-plans', 'scene-damaged.json');
    writeFileSync(damagedPlan, '{"key":{"id":"scene-dam');
    writeFileSync(join(storeRoot, 'lesson-spend.jsonl'), `{"studentId":"${student.studentId}","us\n${JSON.stringify({ studentId: otherStudent.studentId, usd: 0.1 })}\n`);

    await asToken(server().delete('/me'), student.token).expect(200, { deleted: true });

    expect(existsSync(damaged)).toBe(false);
    expect(existsSync(damagedPlan)).toBe(false);
    expect(readFileSync(join(storeRoot, 'lesson-spend.jsonl'), 'utf8')).not.toContain(student.studentId);
    expect(existsSync(join(storeRoot, 'scenes', 'scene-kept', 'scene.json'))).toBe(true);
    expect(existsSync(join(storeRoot, 'waiting-plans', 'scene-kept.json'))).toBe(true);
  });

  it('finishes on a second press when Auth failed the first time', async () => {
    const student = await createFullStudent();
    const deleteAsAuthDoes = testApp.supabaseAuth.onDeleteUser;
    testApp.supabaseAuth.onDeleteUser = () => Promise.reject(new Error('Auth is down'));

    await asToken(server().delete('/me'), student.token).expect(500);
    testApp.supabaseAuth.onDeleteUser = deleteAsAuthDoes;
    await asToken(server().delete('/me'), student.token).expect(200, { deleted: true });

    expect(await findAuthTablesHolding(dataSource, student.email)).toEqual([]);
  });

  it('keeps no hash of an old enough address, so that student can come back as a new Auth user', async () => {
    const student = await createFullStudent();

    await asToken(server().delete('/me'), student.token).expect(200);

    const authUserId = randomUUID();
    await addAuthUser(dataSource, { authUserId, email: student.email });
    const token = await testApp.supabaseAuth.signToken(authUserId, { claims: { email: student.email } });
    await asToken(server().post('/me/birth-date'), token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(200);
    await asToken(server().delete('/me'), token).expect(200);
  });

  it('refuses to create a student for a token whose Auth user is gone, because nothing could delete that student once the token expires', async () => {
    const student = await createFullStudent();
    await asToken(server().delete('/me'), student.token).expect(200);

    await asToken(server().post('/me/birth-date'), student.token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(401);

    const [row] = await dataSource.query('SELECT count(*)::int AS total FROM students WHERE auth_user_id = $1', [student.authUserId]);
    expect((row as { total: number }).total).toBe(0);
  });

  it('refuses a birth date while Auth cannot say the user exists, rather than risk a student nothing can delete', async () => {
    const authUserId = randomUUID();
    const token = await testApp.supabaseAuth.signToken(authUserId, { claims: { email: `${authUserId}@astra.test` } });
    const answerAsAuthDoes = testApp.supabaseAuth.onGetUser;
    testApp.supabaseAuth.onGetUser = () => Promise.reject(new Error('Auth is down'));

    await asToken(server().post('/me/birth-date'), token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(500);
    testApp.supabaseAuth.onGetUser = answerAsAuthDoes;
  });

  it('asks for a token', async () => {
    await server().delete('/me').expect(401);
  });

  it('knows every column that names a student, so a new one has to be added here on purpose', async () => {
    const columns = await listStudentColumns(dataSource);

    expect(columns.filter(({ column_name: columnName }) => columnName === 'session_id').map(({ table_name: tableName }) => tableName).every((tableName) => TABLES_GONE_WITH_A_STUDENT.includes(tableName))).toBe(true);
    expect(columns.filter(({ column_name: columnName }) => columnName === 'student_id').map(({ table_name: tableName }) => tableName)).toEqual(TABLES_WITH_STUDENT_ID);
    expect(columns.filter(({ column_name: columnName }) => columnName === 'auth_user_id').map(({ table_name: tableName }) => tableName)).toEqual(TABLES_WITH_AUTH_USER_ID);
  });

  it('reaches every table but the ones listed as holding no student\'s rows', async () => {
    expect(await findTablesADeleteMisses(dataSource)).toEqual([]);
  });

  it.each([
    ['a student_id', '"student_id" uuid NOT NULL'],
    ['a session_id and jsonb words, with no foreign key', '"session_id" uuid NOT NULL, "words" jsonb NOT NULL'],
    ['only jsonb words', '"words" jsonb NOT NULL'],
  ])('fails on a planted table with %s, that a delete would miss', async (_name, columns) => {
    await dataSource.query(`CREATE TABLE "planted_table" (${columns})`);
    const missed = await findTablesADeleteMisses(dataSource);
    await dataSource.query('DROP TABLE "planted_table"');

    expect(missed).toEqual(['planted_table']);
  });
});
