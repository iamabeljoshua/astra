import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { LearnerNoteEntity } from '../infrastructure/orm/entities/learner-note.entity';
import { LearnerRecordUpdateEntity } from '../infrastructure/orm/entities/learner-record-update.entity';
import { StudentEntity } from '../infrastructure/orm/entities/student.entity';
import type { NewLearnerNoteDto } from './learner-record.dto';
import { LearnerRecordService } from './learner-record.service';

const AGENT_KEY = 'agent-key-for-test-that-is-long';
const VALID_SESSION = { title: 'Solving equations', subject: 'Math', language: 'en' };
const SIGN_ERROR: NewLearnerNoteDto = {
  kind: 'struggled',
  topic: 'Moving a term across the equals sign',
  detail: 'Kept the plus when moving the 3',
  evidence: [{ source: 'board', text: '2x + 3 = 11 became 2x = 14', check: 'wrong' }],
};
const ROCKETS: NewLearnerNoteDto = {
  kind: 'cares_about',
  topic: 'Rockets',
  detail: null,
  evidence: [{ source: 'words', text: '', check: null }],
};

describe('the learner record', () => {
  let testApp: TestApp;
  let learnerRecord: LearnerRecordService;
  const savedEnvironment = { ...process.env };

  const server = () => request(testApp.app.getHttpServer());
  const asStudent = (call: request.Test, { token }: TestStudent) => call.set('Authorization', `Bearer ${token}`);
  const asAgent = (call: request.Test) => call.set('Authorization', `Bearer ${AGENT_KEY}`);
  const getTopics = async ({ studentId }: { studentId: string }) => (await learnerRecord.getRecord(studentId)).notes.map(({ topic }) => topic);

  async function startSession(owner: TestStudent) {
    const { body } = await asStudent(server().post('/sessions'), owner).send(VALID_SESSION).expect(201);
    return (body as { id: string }).id;
  }

  async function getNewStudent() {
    const student = await createTestStudent(testApp);
    const sessionId = await startSession(student);
    return { student, studentId: student.studentId, sessionId };
  }

  beforeAll(async () => {
    process.env.ASTRA_AGENT_KEY = AGENT_KEY;
    testApp = await createTestApp();
    learnerRecord = testApp.app.get(LearnerRecordService);
  });

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  it('adds nothing when the same update runs twice', async () => {
    const owner = await getNewStudent();
    const update = { ...owner, updateKey: 'room-a', notes: [SIGN_ERROR] };

    expect(await learnerRecord.applyUpdate(update)).toBe(true);
    expect(await learnerRecord.applyUpdate(update)).toBe(false);

    expect(await getTopics(owner)).toEqual([SIGN_ERROR.topic]);
  });

  it('keeps a deleted note gone when the same update runs again', async () => {
    const owner = await getNewStudent();
    const update = { ...owner, updateKey: 'room-a', notes: [SIGN_ERROR, ROCKETS] };
    await learnerRecord.applyUpdate(update);
    const { notes } = await learnerRecord.getRecord(owner.studentId);
    const signError = notes.find(({ topic }) => topic === SIGN_ERROR.topic);

    await asStudent(server().delete(`/me/record/notes/${signError?.id}`), owner.student).expect(204);
    await learnerRecord.applyUpdate(update);

    expect(await getTopics(owner)).toEqual([ROCKETS.topic]);
  });

  it('lets a later room in the same session add to the record, without noting the same thing twice', async () => {
    const owner = await getNewStudent();

    await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-a', notes: [SIGN_ERROR] });
    await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-b', notes: [{ ...SIGN_ERROR, topic: 'MOVING a term, across the equals sign!' }, ROCKETS] });

    expect((await getTopics(owner)).toSorted()).toEqual([SIGN_ERROR.topic, ROCKETS.topic].toSorted());
  });

  it.each<[string, NewLearnerNoteDto]>([
    ['showed with no line code marked right', { ...ROCKETS, kind: 'showed' }],
    ['showed with a wrong line beside a right one', { ...ROCKETS, kind: 'showed', evidence: [{ source: 'board', text: 'x = 4', check: 'right' }, ...SIGN_ERROR.evidence] }],
    ['struggled on a line code marked right', { ...SIGN_ERROR, evidence: [{ source: 'board', text: 'x = 4', check: 'right' }] }],
    ['cares about with only a board line', { ...ROCKETS, evidence: SIGN_ERROR.evidence }],
    ["a student's own words kept as a quote", { ...ROCKETS, evidence: [{ source: 'words', text: 'i have asthma so i like lungs', check: null }] }],
    ['a board line with nothing on it', { ...SIGN_ERROR, evidence: [{ source: 'board', text: '', check: 'wrong' }] }],
  ])('refuses %s', async (_description, note) => {
    const owner = await getNewStudent();

    await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-a', notes: [note] });

    expect(await getTopics(owner)).toEqual([]);
  });

  describe('between students', () => {
    it('never reads another student through the signed-in route', async () => {
      const owner = await getNewStudent();
      const other = await getNewStudent();
      await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-a', notes: [ROCKETS] });

      const { body } = await asStudent(server().get('/me/record'), other.student).expect(200);

      expect(body).toEqual({ notes: [] });
    });

    it('never deletes another student\'s note', async () => {
      const owner = await getNewStudent();
      const other = await getNewStudent();
      await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-a', notes: [ROCKETS] });
      const [note] = (await learnerRecord.getRecord(owner.studentId)).notes;

      await asStudent(server().delete(`/me/record/notes/${note?.id}`), other.student).expect(404);
      await asStudent(server().delete('/me/record'), other.student).expect(204);

      expect(await getTopics(owner)).toEqual([ROCKETS.topic]);
    });

    it('gives the agent only the record of the session\'s own student', async () => {
      const owner = await getNewStudent();
      const other = await getNewStudent();
      await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-a', notes: [ROCKETS] });

      const { body } = await asAgent(server().get(`/agent/sessions/${other.sessionId}/record`)).expect(200);
      const { body: ownBody } = await asAgent(server().get(`/agent/sessions/${owner.sessionId}/record`)).expect(200);

      expect(body).toEqual({ notes: [] });
      expect((ownBody as { notes: { topic: string }[] }).notes.map(({ topic }) => topic)).toEqual([ROCKETS.topic]);
    });

    it('writes an agent update to the session\'s own student, whatever the body says', async () => {
      const owner = await getNewStudent();
      const other = await getNewStudent();
      const body = { studentId: other.studentId, updateKey: 'room-a', notes: [ROCKETS] };

      await asAgent(server().post(`/agent/sessions/${owner.sessionId}/record`)).send(body).expect(400);
      await asAgent(server().post(`/agent/sessions/${owner.sessionId}/record`)).send({ updateKey: 'room-a', notes: [ROCKETS] }).expect(200);

      expect(await getTopics(other)).toEqual([]);
      expect(await getTopics(owner)).toEqual([ROCKETS.topic]);
    });

    it('answers 404 for a session that does not exist', async () => {
      await asAgent(server().get(`/agent/sessions/${randomUUID()}/record`)).expect(404);
    });
  });

  it('deletes everything about a student when the student is deleted', async () => {
    const owner = await getNewStudent();
    await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-a', notes: [SIGN_ERROR, ROCKETS] });
    const dataSource = testApp.app.get(DataSource);

    await dataSource.getRepository(StudentEntity).delete(owner.studentId);

    expect(await dataSource.getRepository(LearnerNoteEntity).countBy({ studentId: owner.studentId })).toBe(0);
    expect(await dataSource.getRepository(LearnerRecordUpdateEntity).countBy({ sessionId: owner.sessionId })).toBe(0);
  });

  it('lets a student delete the whole record', async () => {
    const owner = await getNewStudent();
    await learnerRecord.applyUpdate({ ...owner, updateKey: 'room-a', notes: [SIGN_ERROR, ROCKETS] });

    await asStudent(server().delete('/me/record'), owner.student).expect(204);

    expect(await getTopics(owner)).toEqual([]);
  });
});
