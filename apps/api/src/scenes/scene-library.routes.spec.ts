import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import request from 'supertest';
import deeperScenes from '../picks/deeper-scenes.json';
import { LIBRARY } from '../picks/library';
import { createTestApp, createTestStudent } from '../../test/test-database';
import type { TestApp, TestStudent } from '../../test/test-database';
import type { LibrarySceneDto } from './scene.dto';

const getSceneId = (index: number) => `scene-${String(index).padStart(40, '0')}`;

describe('the scene library routes', () => {
  let testApp: TestApp;
  let reviewer: TestStudent;
  let student: TestStudent;
  let storeRoot: string;

  function saveScene(sceneId: string, topic: string, ownerId: string | null = null) {
    const folder = join(storeRoot, 'scenes', sceneId);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'scene.json'), JSON.stringify({ status: 'checked', ownerId, topic, narration: '[[a]] Words.', plan: { close: 'Why?' } }));
    writeFileSync(join(folder, 'light.take.br'), brotliCompressSync(Buffer.from('a take')));
    writeFileSync(join(folder, 'sheet-0.png'), Buffer.from('a picture'));
  }

  const server = () => testApp.app.getHttpServer();
  const asStudent = (route: string, { token }: TestStudent) => request(server()).get(route).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    storeRoot = mkdtempSync(join(tmpdir(), 'scene-library-'));
    process.env.SCENE_STORE_DIR = storeRoot;
    testApp = await createTestApp();
    reviewer = await createTestStudent(testApp);
    student = await createTestStudent(testApp);
    process.env.SCENE_REVIEWER_IDS = reviewer.studentId;
    LIBRARY.topics.slice(0, 30).forEach(({ title }, index) => saveScene(getSceneId(index), title));
    deeperScenes.deeper.flatMap(({ titles }) => titles).slice(0, 20).forEach((title, index) => saveScene(getSceneId(100 + index), title));
  });

  afterAll(async () => {
    delete process.env.SCENE_STORE_DIR;
    delete process.env.SCENE_REVIEWER_IDS;
    rmSync(storeRoot, { recursive: true });
    await testApp.close();
  });

  it('refuses a student on every route, and shows them nothing', async () => {
    await asStudent('/scene-library/sample', student).expect(403);
    await asStudent(`/scene-library/${getSceneId(0)}/sheet`, student).expect(403);
    await request(server()).put(`/scene-library/${getSceneId(0)}/flag`).set('Authorization', `Bearer ${student.token}`).expect(403);
    await request(server()).delete(`/scene-library/${getSceneId(0)}/flag`).set('Authorization', `Bearer ${student.token}`).expect(403);
    expect(existsSync(join(storeRoot, 'flags'))).toBe(false);
  });

  it('gives a named reviewer a sample that leans to openings, and its frames', async () => {
    const { body } = await asStudent('/scene-library/sample', reviewer).expect(200);
    const sample = body as LibrarySceneDto[];
    expect(sample.filter(({ kind }) => kind === 'opening')).toHaveLength(18);
    expect(sample.filter(({ kind }) => kind === 'deeper')).toHaveLength(6);
    await asStudent(`/scene-library/${getSceneId(0)}/sheet`, reviewer).expect(200).expect('Content-Type', 'image/png');
  });

  it('stops a flagged take reaching any student, keeps the flag across reads, and clears it', async () => {
    const sceneId = getSceneId(1);
    await asStudent(`/scene-takes/${sceneId}/light`, student).expect(200);
    await request(server()).put(`/scene-library/${sceneId}/flag`).set('Authorization', `Bearer ${reviewer.token}`).expect(204);
    await asStudent(`/scene-takes/${sceneId}/light`, student).expect(404);
    await request(server()).delete(`/scene-library/${sceneId}/flag`).set('Authorization', `Bearer ${reviewer.token}`).expect(204);
    await asStudent(`/scene-takes/${sceneId}/light`, student).expect(200);
  });
});
