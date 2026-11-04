import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

const LIVE_ROOM_KEYS = { LIVEKIT_URL: 'wss://astra-test.livekit.cloud', LIVEKIT_API_KEY: 'key-for-test', LIVEKIT_API_SECRET: 'secret-for-test-that-is-long-enough-to-sign', ASTRA_AGENT_NAME: 'tutor-for-test' };
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };

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

  beforeAll(async () => {
    Object.assign(process.env, LIVE_ROOM_KEYS);
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
    otherStudent = await createTestStudent(testApp);
  });

  afterAll(async () => {
    process.env = savedEnvironment;
    await testApp.close();
  });

  it('gives a token for this session room with the least it needs', async () => {
    const sessionId = await startSession();
    const { body } = await post(`/sessions/${sessionId}/live-room`).expect(200);
    const claims = decodeJwt((body as { token: string }).token) as Record<string, unknown> & { exp: number; nbf: number };
    expect(claims.video).toEqual({ room: `session-${sessionId}`, roomJoin: true, canSubscribe: true, canPublish: true, canPublishSources: ['microphone'], canPublishData: true, canUpdateOwnMetadata: false });
    expect(claims.roomConfig).toMatchObject({ name: `session-${sessionId}`, maxParticipants: 2, agents: [{ agentName: 'tutor-for-test' }] });
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(600);
    expect(claims.sub).toMatch(/^student-/);
    expect(claims.name).toBeUndefined();
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
