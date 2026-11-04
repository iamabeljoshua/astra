import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createTestStudent, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { getLiveRoomKeys, LiveRooms, MOST_KNOWN_ROOMS } from './live-rooms';

const LIVE_ROOM_KEYS = { LIVEKIT_URL: 'wss://astra-test.livekit.cloud', LIVEKIT_API_KEY: 'key-for-test', LIVEKIT_API_SECRET: 'secret-for-test-that-is-long-enough-to-sign', ASTRA_AGENT_NAME: 'tutor-for-test' };
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

function getAccess(answer: unknown) {
  return (answer as { access: { url: string; token: string; roomName: string; roomSid: string } }).access;
}

interface RoomCall {
  method: string;
  body: Record<string, unknown>;
}

// LiveKit answers over fetch, so the route runs for real and only the far end is replaced.
function stubLiveKit() {
  const realFetch = global.fetch;
  const calls: RoomCall[] = [];
  const rooms = new Map<string, { sid: string; name: string }>();
  const stub = {
    isDown: false,
    calls,
    rooms,
    named: (method: string) => calls.filter((call) => call.method === method),
    roomsOf: (sessionId: string) => [...rooms.keys()].filter((name) => name.startsWith(`session-${sessionId}`)),
  };
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith('https://astra-test.livekit.cloud/')) return realFetch(input, init);
    if (stub.isDown) throw new Error('LiveKit is down');
    const method = url.split('/').at(-1) as string;
    const body = JSON.parse(String(init?.body ?? '{}')) as { name?: string; room?: string; names?: string[] };
    calls.push({ method, body });
    if (method === 'CreateRoom') rooms.set(String(body.name), { sid: `RM_${rooms.size}`, name: String(body.name) });
    if (method === 'DeleteRoom') rooms.delete(String(body.room));
    const listed = [...rooms.values()].filter((room) => !body.names?.length || body.names.includes(room.name));
    const answers: Record<string, object> = { CreateRoom: rooms.get(String(body.name)) ?? {}, ListRooms: { rooms: listed }, DeleteRoom: {} };
    return new Response(JSON.stringify(answers[method] ?? {}), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return stub;
}

const WARMED_ROOM_WAIT_MS = 2000;

async function waitUntil(isDone: () => boolean): Promise<void> {
  const deadline = Date.now() + WARMED_ROOM_WAIT_MS;
  while (!isDone() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
}

describe('the live room route', () => {
  let testApp: TestApp;
  let student: TestStudent;
  let otherStudent: TestStudent;
  let liveKit: ReturnType<typeof stubLiveKit>;
  const savedEnvironment = { ...process.env };

  const server = () => request(testApp.app.getHttpServer());
  const post = (url: string, { token }: TestStudent = student) => server().post(url).set('Authorization', `Bearer ${token}`);
  const startSession = async (owner: TestStudent = student) => {
    const { body } = await post('/sessions', owner).send(VALID_SESSION).expect(201);
    return (body as { id: string }).id;
  };

  beforeEach(() => {
    Object.assign(process.env, LIVE_ROOM_KEYS);
  });

  beforeAll(async () => {
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
    otherStudent = await createTestStudent(testApp);
  });

  beforeEach(() => {
    liveKit = stubLiveKit();
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

  it('tells LiveKit which agent to call and nothing about the student', async () => {
    await server().put('/me/profile').set('Authorization', `Bearer ${student.token}`).send({ name: 'Maya', interests: ['basketball', 'space'], level: 'university', goal: 'exam' }).expect(200);
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt(getAccess(body).token);
    const [created] = liveKit.named('CreateRoom');
    expect(created?.body).toMatchObject({ agents: [{ agentName: 'tutor-for-test' }] });
    expect((created?.body as { agents: { metadata?: string }[] }).agents[0]?.metadata ?? '').toBe('');
    for (const secret of ['university', 'basketball', 'space', 'exam', 'Maya', OLD_ENOUGH_BIRTH_DATE]) {
      expect(JSON.stringify(claims)).not.toContain(secret);
      expect(JSON.stringify(liveKit.calls)).not.toContain(secret);
    }
  });

  it('gives a token for this session room with the least it needs', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt(getAccess(body).token) as Record<string, unknown> & { exp: number; nbf: number };
    const room = getAccess(body).roomName;
    expect(room).toMatch(new RegExp(`^session-${sessionId}-[0-9a-f]{8}$`));
    expect(claims.video).toEqual({ room, roomJoin: true, canSubscribe: true, canPublish: true, canPublishSources: ['microphone'], canPublishData: true, canUpdateOwnMetadata: false });
    expect(claims.roomConfig).toMatchObject({ name: room, maxParticipants: 1, departureTimeout: 120 });
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(120);
    expect(claims.sub).toMatch(/^student-/);
    expect(claims.name).toBeUndefined();
  });

  it('puts no tutor in the token, because a token cannot be taken back and would call a job into a finished session', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt(getAccess(body).token) as { roomConfig?: { agents?: unknown } };
    expect(claims.roomConfig?.agents ?? []).toEqual([]);
  });

  it('calls the tutor in from the API alone, with the room limits, before it hands over the token', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(liveKit.named('CreateRoom')).toHaveLength(1);
    expect(liveKit.named('CreateRoom')[0]?.body).toMatchObject({ name: getAccess(body).roomName, maxParticipants: 1, departureTimeout: 120, agents: [{ agentName: 'tutor-for-test', restartPolicy: 'JRP_NEVER' }] });
  });

  it('sends a rejoin back to the room it has, so a rejoin never starts a second tutor', async () => {
    const sessionId = await startSession();
    const { body: first } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const { body: second } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(getAccess(second).roomName).toBe(getAccess(first).roomName);
    expect(liveKit.named('CreateRoom')).toHaveLength(1);
  });

  it('closes the room when the session finishes, from any tab, and a finished session calls no tutor', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
    expect(liveKit.named('DeleteRoom')[0]?.body).toMatchObject({ room: getAccess(body).roomName });
    const createdBefore = liveKit.named('CreateRoom').length;
    await post(`/sessions/${sessionId}/live-room`).expect(409);
    expect(liveKit.named('CreateRoom')).toHaveLength(createdBefore);
  });

  it('does not close a room for a session that only changed its length', async () => {
    const sessionId = await startSession();
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 5 }).expect(200);
    expect(liveKit.named('DeleteRoom')).toHaveLength(0);
  });

  it('finishes the session even when LiveKit will not close the room', async () => {
    const sessionId = await startSession();
    liveKit.isDown = true;
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
    liveKit.isDown = false;
    await post(`/sessions/${sessionId}/live-room`).expect(409);
  });

  it('closes the old room and opens a new one when the student starts over, and not otherwise', async () => {
    const sessionId = await startSession();
    const { body: first } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(liveKit.named('DeleteRoom')).toHaveLength(0);
    const { body: second } = await post(`/sessions/${sessionId}/live-room?startOver=yes`).expect(200);
    expect(liveKit.named('DeleteRoom')).toHaveLength(1);
    expect(liveKit.named('CreateRoom')).toHaveLength(2);
    expect(getAccess(second).roomName).not.toBe(getAccess(first).roomName);
    await post(`/sessions/${sessionId}/live-room?startOver=maybe`).expect(400);
  });

  it('calls the tutor in when a session starts, and the first press joins that room with no call to LiveKit', async () => {
    const fresh = await createTestStudent(testApp);
    const sessionId = await startSession(fresh);
    await waitUntil(() => liveKit.named('CreateRoom').length === 1);
    expect(liveKit.roomsOf(sessionId)).toHaveLength(1);
    const callsBefore = liveKit.calls.length;
    const { body } = await post(`/sessions/${sessionId}/live-room`, fresh).expect(200);
    expect(getAccess(body).roomName).toBe(liveKit.roomsOf(sessionId)[0]);
    expect(liveKit.calls).toHaveLength(callsBefore);
  });

  it('calls a new tutor when LiveKit built the room again from a token, because no tutor is coming to that one', async () => {
    const rooms = testApp.app.get(LiveRooms);
    const keys = getLiveRoomKeys(process.env);
    if (!keys) throw new Error('the keys are set in beforeAll');
    const [sessionId, studentId] = [randomUUID(), randomUUID()];
    const first = await rooms.open(keys, sessionId, studentId);
    expect(first.sid).toMatch(/^RM_/);
    expect(await rooms.open(keys, sessionId, studentId)).toEqual(first);
    liveKit.rooms.set(first.name, { sid: 'RM_rebuilt', name: first.name });
    expect((await rooms.open(keys, sessionId, studentId)).name).not.toBe(first.name);
  });

  it('checks the room is still open after the first join, and calls a new tutor if it has gone', async () => {
    const sessionId = await startSession();
    const { body: first } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    liveKit.rooms.delete(getAccess(first).roomName);
    const { body: second } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(getAccess(second).roomName).not.toBe(getAccess(first).roomName);
    expect(liveKit.named('CreateRoom')).toHaveLength(2);
  });

  it('closes a warmed room when the session finishes before anyone joins', async () => {
    const fresh = await createTestStudent(testApp);
    const sessionId = await startSession(fresh);
    await waitUntil(() => liveKit.roomsOf(sessionId).length === 1);
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${fresh.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
    expect(liveKit.roomsOf(sessionId)).toEqual([]);
  });

  it('opens no room for a session with no keys, and does not stop the session starting', async () => {
    delete process.env.LIVEKIT_API_SECRET;
    await startSession();
    process.env.LIVEKIT_API_SECRET = LIVE_ROOM_KEYS.LIVEKIT_API_SECRET;
    expect(liveKit.calls).toEqual([]);
  });

  it('starts no job for a student past today\'s limit, from a new session or from the route, because a warm room spends', async () => {
    const limited = await createTestStudent(testApp);
    process.env.ASTRA_DAILY_LIMIT_USD = '0';
    const sessionId = await startSession(limited);
    const { body } = await post(`/sessions/${sessionId}/live-room`, limited).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    delete process.env.ASTRA_DAILY_LIMIT_USD;
    expect(body).toEqual({ access: null, unavailableBecause: 'dailyLimit' });
    expect(liveKit.calls).toEqual([]);
  });

  it('still starts a session when LiveKit will not warm a room', async () => {
    liveKit.isDown = true;
    await startSession();
    liveKit.isDown = false;
  });

  it('limits starting over per student, because each one starts a job, and leaves joining alone', async () => {
    const limited = await createTestStudent(testApp);
    const sessionId = await startSession(limited);
    for (let startOver = 0; startOver < 5; startOver += 1) await post(`/sessions/${sessionId}/live-room?startOver=yes`, limited).expect(200);
    const createdBefore = liveKit.named('CreateRoom').length;
    const deletedBefore = liveKit.named('DeleteRoom').length;
    await post(`/sessions/${sessionId}/live-room?startOver=yes`, limited).expect(429);
    const otherSession = await startSession(limited);
    await post(`/sessions/${otherSession}/live-room?startOver=yes`, limited).expect(429);
    expect(liveKit.named('DeleteRoom')).toHaveLength(deletedBefore);
    expect(liveKit.named('CreateRoom').length).toBeLessThanOrEqual(createdBefore + 1);
    await post(`/sessions/${sessionId}/live-room`, limited).expect(200);
    const untouched = await startSession(otherStudent);
    await post(`/sessions/${untouched}/live-room?startOver=yes`, otherStudent).expect(200);
  });

  it('warms at most two rooms for a student at once, and still creates every session', async () => {
    const flooding = await createTestStudent(testApp);
    const answers = await Promise.all(Array.from({ length: 8 }, () => post('/sessions', flooding).send(VALID_SESSION)));
    expect(answers.map(({ status }) => status)).toEqual(Array.from({ length: 8 }, () => 201));
    await waitUntil(() => liveKit.named('CreateRoom').length >= 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(liveKit.named('CreateRoom').length).toBeLessThanOrEqual(2);
  });

  it('warms again once the earlier rooms have had time to close, so a later lesson starts as fast', async () => {
    const returning = await createTestStudent(testApp);
    const earlier = await Promise.all([startSession(returning), startSession(returning), startSession(returning)]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const createdBefore = liveKit.named('CreateRoom').length;
    await testApp.app.get(DataSource).getRepository(SessionEntity).update(earlier, { startedAt: new Date(Date.now() - 121_000) });
    const later = await startSession(returning);
    await waitUntil(() => liveKit.roomsOf(later).length === 1);
    expect(liveKit.named('CreateRoom')).toHaveLength(createdBefore + 1);
  });

  it('opens the room of a session it did not warm when the student joins, and tells no one to wait', async () => {
    const reading = await createTestStudent(testApp);
    const [first, second, third] = [await startSession(reading), await startSession(reading), await startSession(reading)];
    await waitUntil(() => liveKit.named('CreateRoom').length === 2);
    expect(liveKit.roomsOf(third)).toEqual([]);
    for (const sessionId of [first, second, third]) await post(`/sessions/${sessionId}/live-room`, reading).expect(200);
    expect(liveKit.roomsOf(third)).toHaveLength(1);
    expect(liveKit.named('CreateRoom')).toHaveLength(3);
  });

  it('limits the rooms a student can open, because each one starts a job, says how long to wait, and leaves joining alone', async () => {
    const opening = await createTestStudent(testApp);
    const sessions: string[] = [];
    for (let session = 0; session < 13; session += 1) sessions.push(await startSession(opening));
    const allowed = sessions.slice(0, 12);
    for (const sessionId of allowed) await post(`/sessions/${sessionId}/live-room`, opening).expect(200);
    const { body } = await post(`/sessions/${sessions[12]}/live-room`, opening).expect(429);
    expect((body as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(500);
    expect((body as { retryAfterSeconds: number }).retryAfterSeconds).toBeLessThanOrEqual(600);
    await post(`/sessions/${allowed[0]}/live-room`, opening).expect(200);
    const untouched = await startSession(otherStudent);
    await post(`/sessions/${untouched}/live-room`, otherStudent).expect(200);
  });

  it('counts no room LiveKit would not open, so an outage never ends in a false wait', async () => {
    const unlucky = await createTestStudent(testApp);
    const sessionId = await startSession(unlucky);
    await waitUntil(() => liveKit.roomsOf(sessionId).length === 1);
    liveKit.isDown = true;
    for (let press = 0; press < 13; press += 1) await post(`/sessions/${sessionId}/live-room?startOver=yes`, unlucky).expect(503);
    for (let press = 0; press < 13; press += 1) await post(`/sessions/${sessionId}/live-room`, unlucky).expect(503);
    liveKit.isDown = false;
    await post(`/sessions/${sessionId}/live-room?startOver=yes`, unlucky).expect(200);
  });

  it('says how long a student must wait to start over, from the start that lifts the limit', async () => {
    const limited = await createTestStudent(testApp);
    const sessionId = await startSession(limited);
    const realNow = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow);
    for (let startOver = 0; startOver < 5; startOver += 1) await post(`/sessions/${sessionId}/live-room?startOver=yes`, limited).expect(200);
    clock.mockReturnValue(realNow + 240_000);
    const { body } = await post(`/sessions/${sessionId}/live-room?startOver=yes`, limited).expect(429);
    expect((body as { retryAfterSeconds: number }).retryAfterSeconds).toBe(360);
    clock.mockReturnValue(realNow + 600_001);
    await post(`/sessions/${sessionId}/live-room?startOver=yes`, limited).expect(200);
  });

  it('treats a warm room nobody joined as gone before it closes itself, so a late press never lands on a closing room', async () => {
    const fresh = await createTestStudent(testApp);
    const sessionId = await startSession(fresh);
    await waitUntil(() => liveKit.roomsOf(sessionId).length === 1);
    const [warmed] = liveKit.roomsOf(sessionId);
    const later = Date.now() + 106_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    const { body } = await post(`/sessions/${sessionId}/live-room`, fresh).expect(200);
    expect((body as { roomName: string }).roomName).not.toBe(warmed);
    expect(liveKit.named('ListRooms')).toHaveLength(0);
  });

  it('keeps joining a warm room a student has joined once, for as long as LiveKit says it is open', async () => {
    const fresh = await createTestStudent(testApp);
    const sessionId = await startSession(fresh);
    await waitUntil(() => liveKit.roomsOf(sessionId).length === 1);
    const { body: first } = await post(`/sessions/${sessionId}/live-room`, fresh).expect(200);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 300_000);
    const { body: second } = await post(`/sessions/${sessionId}/live-room`, fresh).expect(200);
    expect((second as { roomName: string }).roomName).toBe((first as { roomName: string }).roomName);
  });

  it('forgets the names of the oldest rooms, and finds one again by asking LiveKit', async () => {
    const rooms = testApp.app.get(LiveRooms);
    const keys = getLiveRoomKeys(process.env);
    if (!keys) throw new Error('the keys are set in beforeAll');
    const oldest = randomUUID();
    const room = await rooms.open(keys, oldest, randomUUID());
    for (let session = 0; session < MOST_KNOWN_ROOMS; session += 1) rooms.warm(randomUUID(), randomUUID());
    await waitUntil(() => liveKit.named('CreateRoom').length > MOST_KNOWN_ROOMS);
    liveKit.calls.length = 0;
    expect(await rooms.open(keys, oldest, randomUUID())).toEqual(room);
    expect(liveKit.named('ListRooms')).toEqual([{ method: 'ListRooms', body: {} }]);
  });

  it('answers 503 when LiveKit will not open the room, and gives no token', async () => {
    liveKit.isDown = true;
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(503);
    liveKit.isDown = false;
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('sends the browser no key, only the address, the token, and the room name', async () => {
    const sessionId = await startSession();
    const { body, text } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(body).toMatchObject({ unavailableBecause: null });
    expect(Object.keys(getAccess(body)).sort()).toEqual(['roomName', 'roomSid', 'token', 'url']);
    expect(text).not.toContain(LIVE_ROOM_KEYS.LIVEKIT_API_SECRET);
    expect(JSON.stringify(decodeJwt(getAccess(body).token))).not.toContain(LIVE_ROOM_KEYS.LIVEKIT_API_SECRET);
  });

  it('gives each session its own room, and another student no token at all', async () => {
    const mine = await startSession();
    const theirs = await startSession(otherStudent);
    const { body: first } = await post(`/sessions/${mine}/live-room`).expect(200);
    const { body: second } = await post(`/sessions/${theirs}/live-room`, otherStudent).expect(200);
    expect(getAccess(first).roomName).not.toBe(getAccess(second).roomName);
    await post(`/sessions/${theirs}/live-room`, student).expect(404);
    await post(`/sessions/${randomUUID()}/live-room`).expect(404);
  });

  it('refuses a session that has finished', async () => {
    const sessionId = await startSession();
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
    await post(`/sessions/${sessionId}/live-room`).expect(409);
  });

  it('refuses a student who is not signed in', async () => {
    const sessionId = await startSession();
    await server().post(`/sessions/${sessionId}/live-room`).expect(401);
  });

  it('answers 200 with no access when live voice has no keys, because that is an expected state and not a server error', async () => {
    const sessionId = await startSession();
    delete process.env.LIVEKIT_API_SECRET;
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(body).toEqual({ access: null, unavailableBecause: 'notSetUp' });
  });

  it('still answers 404, 409, and 401 with no keys, so no state hides behind the expected one', async () => {
    const mine = await startSession();
    const theirs = await startSession(otherStudent);
    await server().patch(`/sessions/${mine}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
    delete process.env.LIVEKIT_API_SECRET;
    await post(`/sessions/${theirs}/live-room`).expect(404);
    await post(`/sessions/${mine}/live-room`).expect(409);
    await server().post(`/sessions/${theirs}/live-room`).expect(401);
  });
});
