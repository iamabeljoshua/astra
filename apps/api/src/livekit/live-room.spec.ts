import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { createTestApp, createTestStudent, OLD_ENOUGH_BIRTH_DATE } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

const LIVE_ROOM_KEYS = { LIVEKIT_URL: 'wss://astra-test.livekit.cloud', LIVEKIT_API_KEY: 'key-for-test', LIVEKIT_API_SECRET: 'secret-for-test-that-is-long-enough-to-sign', ASTRA_AGENT_NAME: 'tutor-for-test' };
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

function getAccess(answer: unknown) {
  return (answer as { access: { url: string; token: string; roomName: string } }).access;
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
    const sessionId = await startSession();
    await waitUntil(() => liveKit.named('CreateRoom').length === 1);
    expect(liveKit.roomsOf(sessionId)).toHaveLength(1);
    const callsBefore = liveKit.calls.length;
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(getAccess(body).roomName).toBe(liveKit.roomsOf(sessionId)[0]);
    expect(liveKit.calls).toHaveLength(callsBefore);
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
    const sessionId = await startSession();
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
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
    expect(Object.keys(getAccess(body)).sort()).toEqual(['roomName', 'token', 'url']);
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
