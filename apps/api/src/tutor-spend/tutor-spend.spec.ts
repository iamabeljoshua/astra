import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { StudentSpendRepository } from '../infrastructure/orm/repositories/student-spend.repository';
import { TutorSpendService } from './tutor-spend.service';

const LIVE_ROOM_KEYS = { LIVEKIT_URL: 'wss://astra-test.livekit.cloud', LIVEKIT_API_KEY: 'key-for-test', LIVEKIT_API_SECRET: 'secret-for-test-that-is-long-enough-to-sign' };
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const AT_THE_LIMIT = { access: null, unavailableBecause: 'dailyLimit' };
const ONE_DAY_MS = 86_400_000;
const FIRST_CHARGE_USD = 0.999999;
const LAST_MICRO_USD = 0.000001;

const getUtcDay = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);

describe('the daily limit on tutor time', () => {
  let testApp: TestApp;
  const savedEnvironment = { ...process.env };

  const spend = () => testApp.app.get(TutorSpendService);

  async function openRoom(student: TestStudent) {
    const server = request(testApp.app.getHttpServer());
    const { body: session } = await server.post('/sessions').set('Authorization', `Bearer ${student.token}`).send(VALID_SESSION).expect(201);
    const { body } = await server.post(`/sessions/${(session as { id: string }).id}/live-room`).set('Authorization', `Bearer ${student.token}`).expect(200);
    return body as { access: object | null; unavailableBecause: string | null };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(() => {
    Object.assign(process.env, LIVE_ROOM_KEYS, { ASTRA_DAILY_LIMIT_USD: '1' });
    const realFetch = global.fetch;
    // Opening a room calls LiveKit over fetch, and only that far end is replaced.
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith('https://astra-test.livekit.cloud/')) return realFetch(input, init);
      const { name } = JSON.parse(String(init?.body ?? '{}')) as { name?: string };
      return new Response(JSON.stringify(name ? { sid: 'RM_test', name } : { rooms: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  // A session warms its room after it answers, and that call must land on this stub.
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  it('keeps the room open below the limit, and closes it exactly at the limit', async () => {
    const student = await createTestStudent(testApp);

    await spend().addSpend(student.studentId, FIRST_CHARGE_USD);
    expect(await openRoom(student)).toMatchObject({ access: expect.any(Object), unavailableBecause: null });

    await spend().addSpend(student.studentId, LAST_MICRO_USD);
    expect(await openRoom(student)).toEqual(AT_THE_LIMIT);
  });

  it('stays closed over the limit, and tells a turn when it crossed', async () => {
    const student = await createTestStudent(testApp);

    expect(await spend().addSpend(student.studentId, 0.5)).toEqual({ isOverDailyLimit: false });
    expect(await spend().addSpend(student.studentId, 0.75)).toEqual({ isOverDailyLimit: true });
    expect(await openRoom(student)).toEqual(AT_THE_LIMIT);
  });

  it('reads the limit on each request, so raising it needs no restart', async () => {
    const student = await createTestStudent(testApp);
    await spend().addSpend(student.studentId, 1);
    expect(await openRoom(student)).toEqual(AT_THE_LIMIT);

    process.env.ASTRA_DAILY_LIMIT_USD = '1.50';

    expect(await openRoom(student)).toMatchObject({ unavailableBecause: null });
  });

  it.each([
    ['left out', undefined],
    ['empty', ''],
    ['not a number', 'lots'],
    ['negative', '-1'],
    ['infinite', 'Infinity'],
  ])('holds a student to $3 when the limit is %s', async (_caseName, configured) => {
    if (configured === undefined) delete process.env.ASTRA_DAILY_LIMIT_USD;
    else process.env.ASTRA_DAILY_LIMIT_USD = configured;
    const student = await createTestStudent(testApp);

    await spend().addSpend(student.studentId, 2.99);
    expect(await openRoom(student)).toMatchObject({ unavailableBecause: null });

    await spend().addSpend(student.studentId, 0.01);
    expect(await openRoom(student)).toEqual(AT_THE_LIMIT);
  });

  it('lets a limit of zero mean no tutor time', async () => {
    process.env.ASTRA_DAILY_LIMIT_USD = '0';

    expect(await openRoom(await createTestStudent(testApp))).toEqual(AT_THE_LIMIT);
  });

  it('holds only the student who spent it', async () => {
    const student = await createTestStudent(testApp);
    await spend().addSpend(student.studentId, 5);

    expect(await openRoom(await createTestStudent(testApp))).toMatchObject({ unavailableBecause: null });
  });

  it('counts only today in UTC, so yesterday does not hold anyone', async () => {
    const student = await createTestStudent(testApp);
    await testApp.app.get(StudentSpendRepository).addToDayTotal({ studentId: student.studentId, spentOn: getUtcDay(Date.now() - ONE_DAY_MS), microUsd: 5_000_000 });

    expect(await openRoom(student)).toMatchObject({ unavailableBecause: null });
  });

  it('loses no charge when turns end together, and adds in exact micro-dollars', async () => {
    const student = await createTestStudent(testApp);

    await Promise.all(Array.from({ length: 30 }, () => spend().addSpend(student.studentId, 0.1)));

    const total = await testApp.app.get(StudentSpendRepository).findDayTotal(student.studentId, getUtcDay(Date.now()));
    expect(total).toBe(3_000_000n);
  });

  it('clears a student\'s totals with the student, as their other rows are', async () => {
    const student = await createTestStudent(testApp);
    await spend().addSpend(student.studentId, 0.1);
    const dataSource = testApp.app.get(DataSource);

    await dataSource.query('DELETE FROM "students" WHERE "id" = $1', [student.studentId]);

    expect(await dataSource.query('SELECT 1 FROM "student_daily_spend" WHERE "student_id" = $1', [student.studentId])).toEqual([]);
  });
});
