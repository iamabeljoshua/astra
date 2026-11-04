import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { brotliCompressSync } from 'node:zlib';
import request from 'supertest';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

const TAKE_BYTES = Buffer.from('a stored take');

describe('the scene routes', () => {
  let testApp: TestApp;
  let student: TestStudent;
  let storeRoot: string;

  function saveScene(sceneId: string, status: string) {
    const folder = join(storeRoot, 'scenes', sceneId);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'scene.json'), JSON.stringify({ status }));
    writeFileSync(join(folder, 'light.take.br'), brotliCompressSync(TAKE_BYTES));
  }

  const getTake = (path: string, { token }: TestStudent = student) => request(testApp.app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`).buffer(true).parse((response, done) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => done(null, Buffer.concat(chunks)));
  });

  beforeAll(async () => {
    storeRoot = mkdtempSync(join(tmpdir(), 'scene-takes-'));
    process.env.SCENE_STORE_DIR = storeRoot;
    testApp = await createTestApp();
    student = await createTestStudent(testApp);
    saveScene('slope-1a2b', 'checked');
    saveScene('wrong-fact-3c4d', 'rejected');
  });

  afterAll(async () => {
    delete process.env.SCENE_STORE_DIR;
    rmSync(storeRoot, { recursive: true });
    await testApp.close();
  });

  it('sends a checked take as it was compressed, and lets the browser keep it', async () => {
    const response = await getTake('/scene-takes/slope-1a2b/light').expect(200);
    expect(response.body).toEqual(TAKE_BYTES);
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('never sends a scene that failed its review', async () => {
    await getTake('/scene-takes/wrong-fact-3c4d/light').expect(404);
  });

  it('answers 404 for a theme or a scene with no take', async () => {
    await getTake('/scene-takes/slope-1a2b/dark').expect(404);
    await getTake('/scene-takes/no-such-scene/light').expect(404);
  });

  it('refuses a scene id that is a path, and a theme it does not know', async () => {
    await getTake('/scene-takes/..%2F..%2Fsecret/light').expect(400);
    await getTake('/scene-takes/slope-1a2b/sepia').expect(400);
  });

  it('asks for a signed-in student', async () => {
    await request(testApp.app.getHttpServer()).get('/scene-takes/slope-1a2b/light').expect(401);
  });

  describe('opening a lesson', () => {
    let lessonService: Server;
    let heard: { sessionId: string; request: string; isCard: boolean }[];

    const post = (path: string, { token }: TestStudent = student) => request(testApp.app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);

    beforeAll(async () => {
      heard = [];
      lessonService = createServer((incoming, outgoing) => {
        let body = '';
        incoming.on('data', (chunk: Buffer) => (body += chunk.toString()));
        incoming.on('end', () => {
          heard.push(JSON.parse(body) as (typeof heard)[number]);
          outgoing.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ url: 'ws://room', token: 'room-token' }));
        });
      });
      await new Promise<void>((resolve) => lessonService.listen(0, '127.0.0.1', resolve));
      const address = lessonService.address() as { port: number };
      process.env.SCENE_LESSON_SERVICE_URL = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      delete process.env.SCENE_LESSON_SERVICE_URL;
      await new Promise((resolve) => lessonService.close(resolve));
    });

    const startSession = async (owner: TestStudent, fields: object = {}) => {
      const { body } = await post('/sessions', owner).send({ title: 'What a derivative really measures', subject: 'Math', language: 'en', ...fields }).expect(201);
      return (body as { id: string }).id;
    };

    it('reads the title on the server, and says whether a card started it', async () => {
      const typed = await startSession(student);
      const { body } = await post(`/sessions/${typed}/scene-lesson`).expect(200);
      expect(body).toEqual({ url: 'ws://room', token: 'room-token' });
      expect(heard.at(-1)).toEqual({ sessionId: typed, request: 'What a derivative really measures', isCard: false });
      const carded = await startSession(student, { topicId: 'derivative' });
      await post(`/sessions/${carded}/scene-lesson`).expect(200);
      expect(heard.at(-1)?.isCard).toBe(true);
    });

    it("answers 404 for another student's session", async () => {
      const other = await createTestStudent(testApp);
      const theirs = await startSession(other);
      await post(`/sessions/${theirs}/scene-lesson`).expect(404);
    });

    it('answers 503 when no lesson service is set up', async () => {
      const id = await startSession(student);
      const url = process.env.SCENE_LESSON_SERVICE_URL;
      delete process.env.SCENE_LESSON_SERVICE_URL;
      await post(`/sessions/${id}/scene-lesson`).expect(503);
      process.env.SCENE_LESSON_SERVICE_URL = url;
    });
  });
});
