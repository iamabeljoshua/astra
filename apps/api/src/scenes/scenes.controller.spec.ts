import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { brotliCompressSync } from 'node:zlib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { LIBRARY } from '../picks/library';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';

const TAKE_BYTES = Buffer.from('a stored take');

describe('the scene routes', () => {
  let testApp: TestApp;
  let student: TestStudent;
  let storeRoot: string;

  function saveScene(sceneId: string, status: string, ownerId: string | null = null) {
    const folder = join(storeRoot, 'scenes', sceneId);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'scene.json'), JSON.stringify({ status, ownerId }));
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
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  describe('a 3D take', () => {
    const SCENE_ID = 'rocket-9f8e';
    const MOMENTS = { start: 0, liftoff: 2.5 };
    const getKitTake = (sceneId: string, as: TestStudent = student) => request(testApp.app.getHttpServer()).get(`/scene-takes/${sceneId}/kit`).set('Authorization', `Bearer ${as.token}`);
    const saveKitScene = (folder: string, record: object, code = 'function scene(kit) {}') => {
      mkdirSync(join(storeRoot, 'kit', folder), { recursive: true });
      writeFileSync(join(storeRoot, 'kit', folder, 'scene.js'), code);
      writeFileSync(join(storeRoot, 'kit', folder, 'scene.json'), JSON.stringify(record));
    };
    const saveRecord = (id: string, fields: object) => {
      mkdirSync(join(storeRoot, 'scenes', id), { recursive: true });
      writeFileSync(join(storeRoot, 'scenes', id, 'scene.json'), JSON.stringify({ status: 'checked', ownerId: null, engine: 'manimgx', topic: 'Rockets', moments: MOMENTS, durationSeconds: 12, ...fields }));
    };

    it('sends a reviewed scene on the times of its 2D record, whatever its own file says', async () => {
      saveRecord(SCENE_ID, {});
      saveKitScene('rocket', { sceneId: SCENE_ID, reviewed: true, moments: { start: 0, liftoff: 99 }, durationSeconds: 99 });
      const response = await getKitTake(SCENE_ID).expect(200);
      expect(response.body).toEqual({ code: 'function scene(kit) {}', timing: { moments: MOMENTS, duration: 12 } });
    });

    it('refuses a scene not marked reviewed', async () => {
      saveRecord('rocket-unreviewed', {});
      saveKitScene('unreviewed', { sceneId: 'rocket-unreviewed', reviewed: false });
      await getKitTake('rocket-unreviewed').expect(404);
    });

    it('refuses a scene whose reviewed mark is not exactly true', async () => {
      saveRecord('rocket-truthy', {});
      saveKitScene('truthy', { sceneId: 'rocket-truthy', reviewed: 'yes' });
      await getKitTake('rocket-truthy').expect(404);
    });

    it('answers 404 for a topic with no kit scene', async () => {
      saveRecord('flat-only', {});
      await getKitTake('flat-only').expect(404);
    });

    it('does not take a kit scene with no id and no topic for a scene with an empty topic', async () => {
      saveRecord('no-topic', { topic: '' });
      saveKitScene('nameless', { reviewed: true });
      await getKitTake('no-topic').expect(404);
    });

    it('sends a live scene from its own record, in the same shape', async () => {
      saveRecord('live-1a2b', { engine: 'kit', reviewed: true, code: 'function scene(kit) { /* live */ }' });
      const response = await getKitTake('live-1a2b').expect(200);
      expect(response.body).toEqual({ code: 'function scene(kit) { /* live */ }', timing: { moments: MOMENTS, duration: 12 } });
    });

    it('answers 404 for a live scene nobody marked reviewed', async () => {
      saveRecord('live-unread', { engine: 'kit', code: 'function scene(kit) {}' });
      await getKitTake('live-unread').expect(404);
    });

    it('sends a typed scene to its own student only, and a flagged scene to nobody', async () => {
      const owner = await createTestStudent(testApp);
      saveRecord('live-owned', { engine: 'kit', reviewed: true, code: 'function scene(kit) {}', ownerId: owner.studentId });
      await getKitTake('live-owned', owner).expect(200);
      await getKitTake('live-owned', student).expect(404);
      saveRecord('live-flagged', { engine: 'kit', reviewed: true, code: 'function scene(kit) {}' });
      mkdirSync(join(storeRoot, 'flags'), { recursive: true });
      writeFileSync(join(storeRoot, 'flags', 'live-flagged.json'), '{}');
      await getKitTake('live-flagged').expect(404);
    });

    it('does not take the word kit for a theme on the route that sends a 2D take', async () => {
      await getTake('/scene-takes/slope-1a2b/sepia').expect(400);
    });
  });

  it("sends a scene from a typed question to its own student only", async () => {
    const owner = await createTestStudent(testApp);
    const other = await createTestStudent(testApp);
    saveScene('typed-5e6f', 'checked', owner.studentId);
    await getTake('/scene-takes/typed-5e6f/light', owner).expect(200);
    await getTake('/scene-takes/typed-5e6f/light', other).expect(404);
  });

  it('sends a shared scene to any student', async () => {
    await getTake('/scene-takes/slope-1a2b/light', await createTestStudent(testApp)).expect(200);
  });

  it('never sends a scene that failed its review', async () => {
    await getTake('/scene-takes/wrong-fact-3c4d/light').expect(404);
  });

  it('answers 404 for a theme or a scene with no take', async () => {
    await getTake('/scene-takes/slope-1a2b/dark').expect(404);
    await getTake('/scene-takes/no-such-scene/light').expect(404);
  });

  it('answers 404 and not a server error when a scene record is damaged, because it cannot prove who may see the take', async () => {
    saveScene('damaged-9a8b', 'checked');
    writeFileSync(join(storeRoot, 'scenes', 'damaged-9a8b', 'scene.json'), '{"status":"che');
    await getTake('/scene-takes/damaged-9a8b/light').expect(404);
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
    let heard: { sessionId: string; studentId: string; request: string; isCard: boolean }[];
    let replyStatus = 200;
    let replyBody: object | null = null;

    const post = (path: string, { token }: TestStudent = student) => request(testApp.app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);

    beforeAll(async () => {
      heard = [];
      lessonService = createServer((incoming, outgoing) => {
        let body = '';
        incoming.on('data', (chunk: Buffer) => (body += chunk.toString()));
        incoming.on('end', () => {
          heard.push(JSON.parse(body) as (typeof heard)[number]);
          outgoing.writeHead(replyStatus, { 'Content-Type': 'application/json' }).end(JSON.stringify(replyBody ?? { url: 'ws://room', token: 'room-token' }));
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
      expect(heard.at(-1)).toEqual({ sessionId: typed, studentId: student.studentId, request: 'What a derivative really measures', isCard: false });
      const carded = await startSession(student, { topicId: 'derivative' });
      await post(`/sessions/${carded}/scene-lesson`).expect(200);
      expect(heard.at(-1)?.isCard).toBe(true);
    });

    describe('a card', () => {
      const POISON = 'My name is Jane Doe, I am 14, I go to Lincoln High. What is a derivative?';
      const LIBRARY_TITLE = LIBRARY.topics.find(({ id }) => id === 'derivative')?.title as string;

      it("keeps the library's title, whatever title the browser sent", async () => {
        const { body } = await post('/sessions').send({ title: POISON, subject: 'Math', language: 'en', topicId: 'derivative' }).expect(201);
        expect((body as { title: string }).title).toBe(LIBRARY_TITLE);
      });

      it('sends the planner only the library\'s title, even for a session saved with other words', async () => {
        const id = await startSession(student, { topicId: 'derivative', title: POISON });
        await testApp.app.get(DataSource).query('UPDATE sessions SET title = $1 WHERE id = $2', [POISON, id]);
        await post(`/sessions/${id}/scene-lesson`).expect(200);
        expect(heard.at(-1)).toMatchObject({ request: LIBRARY_TITLE, isCard: true });
        expect(JSON.stringify(heard.at(-1))).not.toMatch(/Jane|Lincoln/);
      });
    });

    it('says when a student has opened too many lessons', async () => {
      const id = await startSession(student);
      replyStatus = 429;
      await post(`/sessions/${id}/scene-lesson`).expect(429);
      replyStatus = 200;
    });

    it('passes on which limit a student hit and the real wait, so the page can tell them', async () => {
      const id = await startSession(student);
      replyStatus = 429;
      replyBody = { refused: 'tooManyStarts', retryAfterSeconds: 240 };
      const { body } = await post(`/sessions/${id}/scene-lesson`).expect(429);
      expect(body).toMatchObject({ refused: 'tooManyStarts', retryAfterSeconds: 240 });
      replyStatus = 200;
      replyBody = null;
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
