import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneTheme } from './scene.dto';

export function findCheckedTake(storeRoot: string | undefined, sceneId: string, theme: SceneTheme): string | null {
  if (!storeRoot) return null;
  const folder = join(storeRoot, 'scenes', sceneId);
  const scenePath = join(folder, 'scene.json');
  const takePath = join(folder, `${theme}.take.br`);
  if (!existsSync(scenePath) || !existsSync(takePath)) return null;
  const { status } = JSON.parse(readFileSync(scenePath, 'utf8')) as { status?: string };
  return status === 'checked' ? takePath : null;
}
