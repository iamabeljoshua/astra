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
const TABLES_WITH_STUDENT_ID = ['safety_flags', 'sessions', 'student_daily_spend', 'student_profiles'];
const TABLES_WITH_AUTH_USER_ID = ['closed_accounts', 'students'];
const STUDENT_COLUMN_NAMES = ['student_id', 'auth_user_id'];

const STUDENT_COLUMNS_QUERY = `
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = ANY($1) ORDER BY table_name`;

const CASCADING_STUDENT_ID_COLUMNS_QUERY = `
  SELECT source.relname AS table_name
  FROM pg_constraint AS link
  JOIN pg_class AS source ON source.oid = link.conrelid
  JOIN pg_namespace AS namespace ON namespace.oid = source.relnamespace
  JOIN pg_attribute AS attribute ON attribute.attrelid = source.oid AND attribute.attnum = ANY(link.conkey)
  WHERE link.contype = 'f' AND link.confdeltype = 'c' AND link.confrelid = 'public.students'::regclass
    AND namespace.nspname = 'public' AND attribute.attname = 'student_id'`;

interface StudentColumn {
  table_name: string;
  column_name: string;
}

function listStudentColumns(dataSource: DataSource): Promise<StudentColumn[]> {
  return dataSource.query(STUDENT_COLUMNS_QUERY, [STUDENT_COLUMN_NAMES]);
}

async function findStudentIdColumnsThatDoNotCascade(dataSource: DataSource): Promise<string[]> {
  const cascading: { table_name: string }[] = await dataSource.query(CASCADING_STUDENT_ID_COLUMNS_QUERY);
  const cascadingTables = new Set(cascading.map(({ table_name: tableName }) => tableName));
  return (await listStudentColumns(dataSource))
    .filter((column) => column.column_name === 'student_id' && !cascadingTables.has(column.table_name))
    .map((column) => column.table_name);
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
    return { authUserId, email, token, studentId };
  }

  async function countRowsFor(ids: { studentId: string; authUserId: string }) {
    const counts: Record<string, number> = {};
    for (const { table_name: tableName, column_name: columnName } of await listStudentColumns(dataSource)) {
      const id = columnName === 'student_id' ? ids.studentId : ids.authUserId;
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

    expect(rowsBefore).toMatchObject({ 'students.auth_user_id': 1, 'student_profiles.student_id': 1, 'sessions.student_id': 1, 'student_daily_spend.student_id': 1, 'safety_flags.student_id': 1 });
    expect(Object.values(await countRowsFor(student)).every((total) => total === 0)).toBe(true);
    expect(await countRowsFor(otherStudent)).toEqual(otherRowsBefore);
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

  it('finishes on a second press when Auth failed the first time', async () => {
    const student = await createFullStudent();
    const deleteAsAuthDoes = testApp.supabaseAuth.onDeleteUser;
    testApp.supabaseAuth.onDeleteUser = () => Promise.reject(new Error('Auth is down'));

    await asToken(server().delete('/me'), student.token).expect(500);
    testApp.supabaseAuth.onDeleteUser = deleteAsAuthDoes;
    await asToken(server().delete('/me'), student.token).expect(200, { deleted: true });

    expect(await findAuthTablesHolding(dataSource, student.email)).toEqual([]);
  });

  it('keeps no hash of an old enough address, so that student can come back', async () => {
    const student = await createFullStudent();

    await asToken(server().delete('/me'), student.token).expect(200);

    await asToken(server().get('/me'), student.token).expect(200, { status: 'needs_birth_date', student: null });
    await asToken(server().post('/me/birth-date'), student.token).send({ birthDate: OLD_ENOUGH_BIRTH_DATE }).expect(200);
    await asToken(server().delete('/me'), student.token).expect(200);
  });

  it('asks for a token', async () => {
    await server().delete('/me').expect(401);
  });

  it('knows every column that names a student, so a new one has to be added here on purpose', async () => {
    const columns = await listStudentColumns(dataSource);

    expect(columns.filter(({ column_name: columnName }) => columnName === 'student_id').map(({ table_name: tableName }) => tableName)).toEqual(TABLES_WITH_STUDENT_ID);
    expect(columns.filter(({ column_name: columnName }) => columnName === 'auth_user_id').map(({ table_name: tableName }) => tableName)).toEqual(TABLES_WITH_AUTH_USER_ID);
  });

  it('fails on a table with a student_id that does not cascade from students', async () => {
    expect(await findStudentIdColumnsThatDoNotCascade(dataSource)).toEqual([]);

    await dataSource.query('CREATE TABLE "learner_notes_planted" ("student_id" uuid NOT NULL)');
    const found = await findStudentIdColumnsThatDoNotCascade(dataSource);
    await dataSource.query('DROP TABLE "learner_notes_planted"');

    expect(found).toEqual(['learner_notes_planted']);
  });
});
