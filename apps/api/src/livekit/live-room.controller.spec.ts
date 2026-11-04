import { randomUUID } from 'node:crypto';
import { TokenVerifier } from 'livekit-server-sdk';
import request from 'supertest';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import { LIVE_ROOM_SETTINGS } from './live-room.service';

const SETTINGS = { url: 'ws://127.0.0.1:7999', apiKey: 'test-key', apiSecret: 'a-test-secret-that-is-long-enough-for-a-token' };
const VALID_SESSION = { title: 'Free-body diagrams', subject: 'Physics', language: 'en' };
const VALID_PROFILE = { name: 'Maya', interests: ['basketball', 'space'], level: 'university', goal: 'exam' };

describe('the live room route', () => {
  let testApp: TestApp;
  let student: TestStudent;

  function api({ token }: TestStudent = student) {
    const server = request(testApp.app.getHttpServer());
    return {
      post: (url: string) => server.post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) => server.patch(url).set('Authorization', `Bearer ${token}`),
      put: (url: string) => server.put(url).set('Authorization', `Bearer ${token}`),
    };
  }

  async function startSession(owner: TestStudent = student) {
    const { body } = await api(owner).post('/sessions').send(VALID_SESSION).expect(201);
    return body as { id: string };
  }

  beforeAll(async () => {
    testApp = await createTestApp({ configure: (builder) => builder.overrideProvider(LIVE_ROOM_SETTINGS).useValue(SETTINGS) });
    student = await createTestStudent(testApp);
    await api().put('/me/profile').send(VALID_PROFILE).expect(200);
  });

  afterAll(() => testApp.close());

  it('gives the owner a pass to this session room alone, one that can hear and send messages but not publish', async () => {
    const session = await startSession();
    const { body } = await api().post(`/sessions/${session.id}/live`).expect(201);
    const claims = await new TokenVerifier(SETTINGS.apiKey, SETTINGS.apiSecret).verify(body.token as string);
    expect(body.url).toBe(SETTINGS.url);
    expect(claims.video).toMatchObject({ room: `session-${session.id}`, roomJoin: true, canSubscribe: true, canPublishData: true, canPublish: false });
    expect(claims.sub).toMatch(/^student-/);
  });

  it('starts the tutor with only the level, interests, and goal', async () => {
    const session = await startSession();
    const { body } = await api().post(`/sessions/${session.id}/live`).expect(201);
    const claims = await new TokenVerifier(SETTINGS.apiKey, SETTINGS.apiSecret).verify(body.token as string);
    const [tutor] = claims.roomConfig?.agents ?? [];
    expect(tutor?.agentName).toBe('astra-tutor');
    expect(JSON.parse(tutor?.metadata ?? '{}')).toEqual({ level: 'university', interests: ['basketball', 'space'], goal: 'exam' });
    expect(JSON.stringify(claims)).not.toContain('Maya');
  });

  it("answers 404 for another student's session", async () => {
    const other = await createTestStudent(testApp);
    const session = await startSession(other);
    await api().post(`/sessions/${session.id}/live`).expect(404);
    await api().post(`/sessions/${randomUUID()}/live`).expect(404);
  });

  it('refuses a finished session', async () => {
    const session = await startSession();
    await api().patch(`/sessions/${session.id}`).send({ durationSeconds: 5, status: 'finished' }).expect(200);
    await api().post(`/sessions/${session.id}/live`).expect(409);
  });

  it('says so when no room server is set up', async () => {
    const plainApp = await createTestApp();
    const plainStudent = await createTestStudent(plainApp);
    const server = request(plainApp.app.getHttpServer());
    const { body } = await server.post('/sessions').set('Authorization', `Bearer ${plainStudent.token}`).send(VALID_SESSION).expect(201);
    await server.post(`/sessions/${(body as { id: string }).id}/live`).set('Authorization', `Bearer ${plainStudent.token}`).expect(503);
    await plainApp.close();
  });

  it('answers 401 with no sign-in', async () => {
    const session = await startSession();
    await request(testApp.app.getHttpServer()).post(`/sessions/${session.id}/live`).expect(401);
  });
});
