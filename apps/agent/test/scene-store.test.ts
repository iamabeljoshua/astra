import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createSceneStore, getSceneId, getSceneKey } from '../src/scenes/scene-store.ts';
import type { StoredScene } from '../src/scenes/scene-types.ts';

const TOPIC = 'What a derivative really measures';
const TAKES = [{ theme: 'light', bytes: Buffer.from('first light') }, { theme: 'dark', bytes: Buffer.from('first dark') }] as const;

const makeRoot = () => mkdtempSync(join(tmpdir(), 'scene-store-'));
const makeScene = (topic = TOPIC, ownerId: string | null = null): StoredScene => ({ ...getSceneKey(topic, { ownerId }), status: 'checked', narration: 'first words' }) as unknown as StoredScene;

describe('a scene id', () => {
  it('holds a long hash and no words of the topic, so a typed topic never reaches an address', () => {
    expect(getSceneId('Jane Doe homework')).toMatch(/^scene-[0-9a-f]{40}$/);
  });

  it('differs for two topics whose letters a slug would lose', () => {
    expect(getSceneId('первая фраза')).not.toBe(getSceneId('вторая фраза'));
  });

  it('differs between shared and a student, and between two students', () => {
    const ids = [getSceneId(TOPIC), getSceneId(TOPIC, { ownerId: 'student-a' }), getSceneId(TOPIC, { ownerId: 'student-b' })];
    expect(new Set(ids).size).toBe(3);
  });
});

describe('a scene with a 3D take beside it', () => {
  const saveKitScene = (root: string, folder: string, record: object) => {
    mkdirSync(join(root, 'kit', folder), { recursive: true });
    writeFileSync(join(root, 'kit', folder, 'scene.js'), 'function scene(kit) {}');
    writeFileSync(join(root, 'kit', folder, 'scene.json'), JSON.stringify(record));
  };

  it('plays on the kit when a reviewed scene names it, on the 2D record\'s own moments', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    const scene = makeScene();
    await store.saveChecked(scene, TAKES, []);
    saveKitScene(root, 'derivative', { sceneId: scene.id, reviewed: true, moments: { other: 99 } });
    const found = store.find(getSceneKey(TOPIC));
    expect(found?.engine).toBe('kit');
    expect(found?.moments).toEqual(scene.moments);
  });

  it('stays on the 2D take when the scene is not marked reviewed', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    const scene = makeScene();
    await store.saveChecked(scene, TAKES, []);
    saveKitScene(root, 'derivative', { sceneId: scene.id, reviewed: false });
    expect(store.find(getSceneKey(TOPIC))?.engine).not.toBe('kit');
  });

  it('stays on the 2D take when the kit scene is another topic\'s', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    await store.saveChecked(makeScene(), TAKES, []);
    saveKitScene(root, 'other', { sceneId: getSceneId('Another topic'), reviewed: true });
    expect(store.find(getSceneKey(TOPIC))?.engine).not.toBe('kit');
  });

  it('shows nobody a flagged scene, on either take', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    const scene = makeScene();
    await store.saveChecked(scene, TAKES, []);
    saveKitScene(root, 'derivative', { sceneId: scene.id, reviewed: true });
    mkdirSync(join(root, 'flags'), { recursive: true });
    writeFileSync(join(root, 'flags', `${scene.id}.json`), '{}');
    expect(store.find(getSceneKey(TOPIC))).toBeNull();
  });
});

describe('finding a scene', () => {
  it('compares the stored topic, so a key that lands on another scene finds nothing', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    const saved = makeScene();
    await store.saveChecked(saved, TAKES, []);
    const scenePath = join(root, 'scenes', saved.id, 'scene.json');
    writeFileSync(scenePath, JSON.stringify({ ...JSON.parse(readFileSync(scenePath, 'utf8')), topic: 'Something else entirely' }));
    expect(store.find(getSceneKey(TOPIC))).toBeNull();
  });

  it("never finds one student's scene for another student, or for nobody", async () => {
    const store = createSceneStore(makeRoot());
    await store.saveChecked(makeScene('a typed topic', 'student-a'), TAKES, []);
    expect(store.find(getSceneKey('a typed topic', { ownerId: 'student-a' }))?.topic).toBe('a typed topic');
    expect(store.find(getSceneKey('a typed topic', { ownerId: 'student-b' }))).toBeNull();
    expect(store.find(getSceneKey('a typed topic'))).toBeNull();
  });

  it('finds nothing from an old folder whose scene was rejected', () => {
    const root = makeRoot();
    const key = getSceneKey(TOPIC);
    mkdirSync(join(root, 'scenes', key.id), { recursive: true });
    writeFileSync(join(root, 'scenes', key.id, 'scene.json'), JSON.stringify({ ...key, status: 'rejected' }));
    expect(createSceneStore(root).find(key)).toBeNull();
  });
});

describe('saving a scene', () => {
  it('builds no path from anything but a server id and a known theme', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    await expect(store.saveChecked({ ...makeScene(), id: '../../outside' }, TAKES, [])).rejects.toThrow(/id/);
    await expect(store.saveChecked(makeScene(), [{ theme: '../other/light', bytes: Buffer.from('x') }] as never, [])).rejects.toThrow(/theme/);
    expect(readdirSync(root).filter((name) => name !== 'incoming')).toEqual([]);
  });

  it('keeps the first passing save, so a take never changes under an immutable address', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    const first = await store.saveChecked(makeScene(), TAKES, []);
    const second = await store.saveChecked({ ...makeScene(), narration: 'second words' } as StoredScene, [{ theme: 'light', bytes: Buffer.from('second light') }, { theme: 'dark', bytes: Buffer.from('second dark') }], []);
    expect(first.narration).toBe('first words');
    expect(second.narration).toBe('first words');
    expect(brotliDecompressSync(readFileSync(join(root, 'scenes', first.id, 'light.take.br'))).toString()).toBe('first light');
    expect(store.find(getSceneKey(TOPIC))?.narration).toBe('first words');
  });

  it('keeps one winner when two saves race', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    const results = await Promise.all(['one', 'two', 'three'].map((word) => store.saveChecked({ ...makeScene(), narration: word } as StoredScene, [{ theme: 'light', bytes: Buffer.from(word) }, { theme: 'dark', bytes: Buffer.from(word) }], [])));
    expect(new Set(results.map(({ narration }) => narration)).size).toBe(1);
    const stored = store.find(getSceneKey(TOPIC));
    expect(brotliDecompressSync(readFileSync(join(root, 'scenes', makeScene().id, 'dark.take.br'))).toString()).toBe(stored?.narration);
  });

  it('leaves the loop free while it compresses, because the audio queue holds 200 ms', async () => {
    const store = createSceneStore(makeRoot());
    let didLoopRun = false;
    setImmediate(() => (didLoopRun = true));
    await store.saveChecked(makeScene(), TAKES, []);
    expect(didLoopRun).toBe(true);
  });

  it('saves over a damaged record in a full folder, so a lesson does not pay for a write it can never keep', async () => {
    const root = makeRoot();
    const store = createSceneStore(root);
    const scene = makeScene();
    await store.saveChecked(scene, TAKES, []);
    writeFileSync(join(root, 'scenes', scene.id, 'scene.json'), '{"status":"che');
    const saved = await store.saveChecked({ ...scene, narration: 'second words' } as StoredScene, [{ theme: 'light', bytes: Buffer.from('second light') }, { theme: 'dark', bytes: Buffer.from('second dark') }], []);
    expect(saved.narration).toBe('second words');
    expect(store.find(getSceneKey(TOPIC))?.narration).toBe('second words');
    expect(brotliDecompressSync(readFileSync(join(root, 'scenes', scene.id, 'dark.take.br'))).toString()).toBe('second dark');
    expect(readdirSync(join(root, 'scenes'))).toEqual([scene.id]);
  });

  it('reads a damaged record as no record, so one bad file costs a rewrite and not a lesson', () => {
    const root = mkdtempSync(join(tmpdir(), 'scene-store-damaged-'));
    const store = createSceneStore(root);
    const key = getSceneKey('what a slope measures');
    mkdirSync(join(root, 'scenes', key.id), { recursive: true });
    writeFileSync(join(root, 'scenes', key.id, 'scene.json'), '{"status":"che');
    expect(store.find(key)).toBeNull();
  });
});
