import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

const LIVE_ROOM_KEYS = { LIVEKIT_URL: 'wss://astra-test.livekit.cloud', LIVEKIT_API_KEY: 'key-for-test', LIVEKIT_API_SECRET: 'secret-for-test-that-is-long-enough-to-sign', ASTRA_AGENT_NAME: 'tutor-for-test' };
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

interface RoomCall {
  method: string;
  body: Record<string, unknown>;
}

// LiveKit answers over fetch, so the route runs for real and only the far end is replaced. A created room gets a new id after each delete, as Cloud's does once its old room has gone.
function stubLiveKit() {
  const realFetch = global.fetch;
  const calls: RoomCall[] = [];
  let roomId = 1;
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith('https://astra-test.livekit.cloud/')) return realFetch(input, init);
    const method = url.split('/').at(-1) as string;
    calls.push({ method, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    if (method === 'DeleteRoom') roomId += 1;
    const answers: Record<string, object> = { CreateRoom: { sid: `RM_${roomId}` }, ListRooms: { rooms: [{ sid: `RM_${roomId}` }] }, DeleteRoom: {} };
    return new Response(JSON.stringify(answers[method] ?? {}), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { calls, named: (method: string) => calls.filter((call) => call.method === method) };
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

  beforeAll(async () => {
    Object.assign(process.env, LIVE_ROOM_KEYS);
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
    otherStudent = await createTestStudent(testApp);
  });

  beforeEach(() => {
    liveKit = stubLiveKit();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  it('gives a token for this session room with the least it needs', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt((body as { token: string }).token) as Record<string, unknown> & { exp: number; nbf: number };
    expect(claims.video).toEqual({ room: `session-${sessionId}`, roomJoin: true, canSubscribe: true, canPublish: true, canPublishSources: ['microphone'], canPublishData: true, canUpdateOwnMetadata: false });
    expect(claims.roomConfig).toMatchObject({ name: `session-${sessionId}`, maxParticipants: 1, departureTimeout: 120 });
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(120);
    expect(claims.sub).toMatch(/^student-/);
    expect(claims.name).toBeUndefined();
  });

  it('puts no tutor in the token, because a token cannot be taken back and would call a job into a finished session', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt((body as { token: string }).token) as { roomConfig?: { agents?: unknown } };
    expect(claims.roomConfig?.agents ?? []).toEqual([]);
  });

  it('calls the tutor in from the API alone, with the room limits, before it hands over the token', async () => {
    const sessionId = await startSession();
    await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(liveKit.named('CreateRoom')).toHaveLength(1);
    expect(liveKit.named('CreateRoom')[0]?.body).toMatchObject({ name: `session-${sessionId}`, maxParticipants: 1, departureTimeout: 120, agents: [{ agentName: 'tutor-for-test' }] });
  });

  it('closes the room when the session finishes, from any tab, and a finished session calls no tutor', async () => {
    const sessionId = await startSession();
    await post(`/sessions/${sessionId}/live-room`).expect(200);
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
    expect(liveKit.named('DeleteRoom')[0]?.body).toMatchObject({ room: `session-${sessionId}` });
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
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('LiveKit is down'));
    await server().patch(`/sessions/${sessionId}`).set('Authorization', `Bearer ${student.token}`).send({ durationSeconds: 1, status: 'finished' }).expect(200);
    await post(`/sessions/${sessionId}/live-room`).expect(409);
  });

  it('closes the old room and opens a new one when the student starts over, and not otherwise', async () => {
    const sessionId = await startSession();
    await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(liveKit.named('DeleteRoom')).toHaveLength(0);
    await post(`/sessions/${sessionId}/live-room?startOver=yes`).expect(200);
    expect(liveKit.named('DeleteRoom')).toHaveLength(1);
    expect(liveKit.named('CreateRoom')).toHaveLength(2);
    await post(`/sessions/${sessionId}/live-room?startOver=maybe`).expect(400);
  });

  it('answers 503 when LiveKit will not open the room, and gives no token', async () => {
    const sessionId = await startSession();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('LiveKit is down'));
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(503);
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('sends the browser no key, only the address, the token, and the room name', async () => {
    const sessionId = await startSession();
    const { body, text } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    expect(Object.keys(body as object).sort()).toEqual(['roomName', 'token', 'url']);
    expect(text).not.toContain(LIVE_ROOM_KEYS.LIVEKIT_API_SECRET);
    expect(JSON.stringify(decodeJwt((body as { token: string }).token))).not.toContain(LIVE_ROOM_KEYS.LIVEKIT_API_SECRET);
  });

  it('gives each session its own room, and another student no token at all', async () => {
    const mine = await startSession();
    const theirs = await startSession(otherStudent);
    const { body: first } = await post(`/sessions/${mine}/live-room`).expect(200);
    const { body: second } = await post(`/sessions/${theirs}/live-room`, otherStudent).expect(200);
    expect((first as { roomName: string }).roomName).not.toBe((second as { roomName: string }).roomName);
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

  it('answers 503 when live voice has no keys, so the rest of the app runs without them', async () => {
    const sessionId = await startSession();
    delete process.env.LIVEKIT_API_SECRET;
    await post(`/sessions/${sessionId}/live-room`).expect(503);
    process.env.LIVEKIT_API_SECRET = LIVE_ROOM_KEYS.LIVEKIT_API_SECRET;
  });
});
