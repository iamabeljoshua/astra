import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneTheme } from './scene.dto';

interface SceneRecord {
  /** Set only on a scene made from approved parts, whose code the agent built from them and which holds no model-written code. */
  recipe?: unknown;
  status?: string;
  ownerId?: string | null;
  engine?: string;
  code?: string;
  topic?: string;
  moments?: Record<string, number>;
  durationSeconds?: number;
  reviewed?: boolean;
}

interface KitSceneRecord {
  sceneId?: string;
  topic?: string;
  reviewed?: boolean;
}

// A damaged record cannot prove who may see a take, so it reads as no take.
function readRecord<Shape>(path: string): Shape | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Shape;
  } catch {
    return null;
  }
}

const normalizeTopic = (topic: string) => topic.normalize('NFC').toLowerCase().trim();

export function findCheckedTake({ storeRoot, sceneId, theme, studentId }: { storeRoot: string | undefined; sceneId: string; theme: SceneTheme; studentId: string }): string | null {
  if (!storeRoot) return null;
  const folder = join(storeRoot, 'scenes', sceneId);
  const scenePath = join(folder, 'scene.json');
  const takePath = join(folder, `${theme}.take.br`);
  if (!existsSync(scenePath) || !existsSync(takePath) || existsSync(join(storeRoot, 'flags', `${sceneId}.json`))) return null;
  const record = readRecord<SceneRecord>(scenePath);
  return record?.status === 'checked' && ((record.ownerId ?? null) === null || record.ownerId === studentId) ? takePath : null;
}

// The person-run store holds a topic's 3D scene beside its 2D take, and only a reviewed one may play.
function readReviewedKitCode(storeRoot: string, sceneId: string, topic: string): string | null {
  const kitRoot = join(storeRoot, 'kit');
  if (!existsSync(kitRoot)) return null;
  for (const folder of readdirSync(kitRoot)) {
    const codePath = join(kitRoot, folder, 'scene.js');
    const record = readRecord<KitSceneRecord>(join(kitRoot, folder, 'scene.json'));
    const isThisScene = record?.sceneId === sceneId || (record?.sceneId === undefined && normalizeTopic(record?.topic ?? '') === normalizeTopic(topic));
    if (record?.reviewed === true && isThisScene && existsSync(codePath)) return readFileSync(codePath, 'utf8');
  }
  return null;
}

export interface KitTakeRecord {
  code: string;
  timing: { moments: Record<string, number>; duration: number };
}

/** One format for a stored scene and a live one. */
export function findCheckedKitTake({ storeRoot, sceneId, studentId }: { storeRoot: string | undefined; sceneId: string; studentId: string }): KitTakeRecord | null {
  if (!storeRoot || existsSync(join(storeRoot, 'flags', `${sceneId}.json`))) return null;
  const record = readRecord<SceneRecord>(join(storeRoot, 'scenes', sceneId, 'scene.json'));
  if (record?.status !== 'checked' || ((record.ownerId ?? null) !== null && record.ownerId !== studentId)) return null;
  const code = record.engine === 'kit' ? (record.reviewed === true || record.recipe !== undefined ? record.code : null) : readReviewedKitCode(storeRoot, sceneId, record.topic ?? '');
  return code && record.moments && record.durationSeconds ? { code, timing: { moments: record.moments, duration: record.durationSeconds } } : null;
}
