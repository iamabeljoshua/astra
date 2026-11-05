import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import deeperScenes from '../picks/deeper-scenes.json';
import { LIBRARY } from '../picks/library';
import type { LibrarySceneDto } from './scene.dto';

const SAMPLE_OPENINGS = 18;
const SAMPLE_DEEPER = 6;
const SCENE_FOLDER = /^scene-[0-9a-f]{40}$/;
const THE_LIGHT_SHEET = 'sheet-0.png';

interface ListedTitle {
  kind: 'opening' | 'deeper';
  subject: string;
}

const normalizeTitle = (title: string) => title.normalize('NFC').toLowerCase().trim();

function getListedTitles(): ReadonlyMap<string, ListedTitle> {
  const openings = LIBRARY.topics.map(({ title, subject }): [string, ListedTitle] => [normalizeTitle(title), { kind: 'opening', subject }]);
  const deeper = deeperScenes.deeper.flatMap(({ topicId, titles }) => titles.map((title): [string, ListedTitle] => [normalizeTitle(title), { kind: 'deeper', subject: LIBRARY.topics.find(({ id }) => id === topicId)?.subject ?? '' }]));
  return new Map([...openings, ...deeper]);
}

const getFlagPath = (storeRoot: string, sceneId: string) => join(storeRoot, 'flags', `${sceneId}.json`);

interface SceneRecord {
  status?: string;
  ownerId?: string | null;
  topic?: string;
  narration?: string;
  plan?: { close?: string; opening?: readonly { say?: unknown }[]; more?: readonly { say?: unknown }[] };
}

export interface CardMaterial {
  title: string;
  subject: string;
  ideas: { title: string; lines: string[]; hasScene: boolean }[];
}

const SHELF_KEPT_MS = 5 * 60_000;
let shelf: { storeRoot: string; readAtMs: number; scenes: ReadonlyMap<string, { sceneId: string; lines: string[] }> } | null = null;

// A damaged record cannot prove what it is, so the page leaves it out.
function readSceneRecord(path: string): SceneRecord | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SceneRecord;
  } catch {
    return null;
  }
}

/** Every saved scene that is on the server's own list. A student's typed scene has an owner, so it never comes here. */
export function getLibraryScenes(storeRoot: string): LibrarySceneDto[] {
  const scenesRoot = join(storeRoot, 'scenes');
  if (!existsSync(scenesRoot)) return [];
  const listed = getListedTitles();
  return readdirSync(scenesRoot).filter((sceneId) => SCENE_FOLDER.test(sceneId)).flatMap((sceneId) => {
    const record = readSceneRecord(join(scenesRoot, sceneId, 'scene.json'));
    const found = record?.topic ? listed.get(normalizeTitle(record.topic)) : undefined;
    if (!record?.topic || !found || record.status !== 'checked' || (record.ownerId ?? null) !== null) return [];
    return [{ sceneId, title: record.topic, kind: found.kind, subject: found.subject, narration: record.narration ?? '', close: record.plan?.close ?? '', isFlagged: existsSync(getFlagPath(storeRoot, sceneId)), isCheckedByPerson: false }];
  });
}

const toLines = (lines: readonly { say?: unknown }[] = []) => lines.flatMap(({ say }) => (typeof say === 'string' ? [say] : []));

function getShelf(storeRoot: string, nowMs: number) {
  if (shelf?.storeRoot === storeRoot && nowMs - shelf.readAtMs < SHELF_KEPT_MS) return shelf.scenes;
  const scenesRoot = join(storeRoot, 'scenes');
  const listed = getListedTitles();
  const scenes = new Map(
    (existsSync(scenesRoot) ? readdirSync(scenesRoot) : []).filter((sceneId) => SCENE_FOLDER.test(sceneId)).flatMap((sceneId): [string, { sceneId: string; lines: string[] }][] => {
      const record = readSceneRecord(join(scenesRoot, sceneId, 'scene.json'));
      if (!record?.topic || !listed.has(normalizeTitle(record.topic)) || record.status !== 'checked' || (record.ownerId ?? null) !== null) return [];
      return [[normalizeTitle(record.topic), { sceneId, lines: [...toLines(record.plan?.opening), ...toLines(record.plan?.more)] }]];
    }),
  );
  shelf = { storeRoot, readAtMs: nowMs, scenes };
  return scenes;
}

export function getCardMaterial(storeRoot: string | undefined, title: string, nowMs = Date.now()): CardMaterial | null {
  const topic = LIBRARY.topics.find((one) => normalizeTitle(one.title) === normalizeTitle(title));
  if (!topic) return null;
  const titles = [topic.title, ...(deeperScenes.deeper.find(({ topicId }) => topicId === topic.id)?.titles ?? [])];
  const scenes = storeRoot ? getShelf(storeRoot, nowMs) : new Map<string, { sceneId: string; lines: string[] }>();
  return {
    title: topic.title,
    subject: topic.subject,
    ideas: titles.map((idea) => {
      const saved = scenes.get(normalizeTitle(idea));
      const canShow = saved !== undefined && !existsSync(getFlagPath(storeRoot as string, saved.sceneId));
      return { title: idea, lines: canShow ? saved.lines : [], hasScene: canShow };
    }),
  };
}

const getShuffleKey = (seed: number, sceneId: string) => createHash('sha256').update(`${seed}:${sceneId}`).digest('hex');

/** The same seed draws the same scenes, so a flag is still in view after a reload. Openings outnumber the rest because more students see them. */
export function getWeightedSample(scenes: readonly LibrarySceneDto[], seed: number): LibrarySceneDto[] {
  const shuffled = [...scenes].sort((first, second) => getShuffleKey(seed, first.sceneId).localeCompare(getShuffleKey(seed, second.sceneId)));
  return [...shuffled.filter(({ kind }) => kind === 'opening').slice(0, SAMPLE_OPENINGS), ...shuffled.filter(({ kind }) => kind === 'deeper').slice(0, SAMPLE_DEEPER)];
}

export function setSceneFlag({ storeRoot, sceneId, flaggedBy, isFlagged }: { storeRoot: string; sceneId: string; flaggedBy: string; isFlagged: boolean }): void {
  const path = getFlagPath(storeRoot, sceneId);
  if (!isFlagged) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(join(storeRoot, 'flags'), { recursive: true });
  writeFileSync(path, JSON.stringify({ flaggedBy, flaggedAt: new Date().toISOString() }));
}

export const getLightSheetPath = (storeRoot: string, sceneId: string) => join(storeRoot, 'scenes', sceneId, THE_LIGHT_SHEET);

export const isNamedReviewer = (studentId: string) => (process.env.SCENE_REVIEWER_IDS ?? '').split(',').map((id) => id.trim()).includes(studentId);
