import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneTheme } from './scene.dto';

// A damaged record cannot prove who may see a take, so it reads as no take.
function readSceneRecord(path: string): { status?: string; ownerId?: string | null } | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as { status?: string; ownerId?: string | null };
  } catch {
    return null;
  }
}

export function findCheckedTake({ storeRoot, sceneId, theme, studentId }: { storeRoot: string | undefined; sceneId: string; theme: SceneTheme; studentId: string }): string | null {
  if (!storeRoot) return null;
  const folder = join(storeRoot, 'scenes', sceneId);
  const scenePath = join(folder, 'scene.json');
  const takePath = join(folder, `${theme}.take.br`);
  if (!existsSync(scenePath) || !existsSync(takePath)) return null;
  const record = readSceneRecord(scenePath);
  return record?.status === 'checked' && ((record.ownerId ?? null) === null || record.ownerId === studentId) ? takePath : null;
}
