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

describe('the live room route', () => {
  let testApp: TestApp;
  let student: TestStudent;
  let otherStudent: TestStudent;
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

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  it('tells LiveKit which agent to call and nothing about the student', async () => {
    await server().put('/me/profile').set('Authorization', `Bearer ${student.token}`).send({ name: 'Maya', interests: ['basketball', 'space'], level: 'university', goal: 'exam' }).expect(200);
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt(getAccess(body).token) as { roomConfig: { agents: { agentName: string; metadata?: string }[] } };
    expect(claims.roomConfig.agents).toHaveLength(1);
    expect(claims.roomConfig.agents[0]?.agentName).toBe('tutor-for-test');
    expect(claims.roomConfig.agents[0]?.metadata ?? '').toBe('');
    for (const secret of ['university', 'basketball', 'space', 'exam', 'Maya', OLD_ENOUGH_BIRTH_DATE]) {
      expect(JSON.stringify(claims)).not.toContain(secret);
    }
  });

  it('gives a token for this session room with the least it needs', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt(getAccess(body).token) as Record<string, unknown> & { exp: number; nbf: number };
    expect(claims.video).toEqual({ room: `session-${sessionId}`, roomJoin: true, canSubscribe: true, canPublish: true, canPublishSources: ['microphone'], canPublishData: true, canUpdateOwnMetadata: false });
    expect(claims.roomConfig).toMatchObject({ name: `session-${sessionId}`, maxParticipants: 1, departureTimeout: 120, agents: [{ agentName: 'tutor-for-test' }] });
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(600);
    expect(claims.sub).toMatch(/^student-/);
    expect(claims.name).toBeUndefined();
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
